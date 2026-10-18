create or replace function public.enforce_work_checklist_step_completion_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_open_required integer;
begin
  if new.status in ('done', 'na')
     and old.status is distinct from new.status then
    select count(*) into v_open_required
    from public.work_step_checks c
    where c.workspace_id = new.workspace_id
      and c.checklist_step_id = new.id
      and c.is_active
      and c.required
      and c.status not in ('complete', 'not_applicable');

    if v_open_required > 0 then
      raise exception 'Complete or mark N/A all active required checks before closing this stage (% remaining)', v_open_required
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists work_checklist_step_completion_guard on public.work_checklist_steps;
create trigger work_checklist_step_completion_guard
before update of status on public.work_checklist_steps
for each row
execute function public.enforce_work_checklist_step_completion_guard();

comment on function public.enforce_work_checklist_step_completion_guard() is
  'Database safety net: a procedure stage cannot become done or N/A while active required guided checks remain unresolved.';

-- Repair legacy states created by the old direct status dropdown. Preserve all evidence;
-- reopen the stage so the unresolved checks become actionable again.
update public.work_checklist_steps s
set status = 'in_progress',
    completed_at = null,
    updated_at = now()
where s.status = 'done'
  and exists (
    select 1
    from public.work_step_checks c
    where c.workspace_id = s.workspace_id
      and c.checklist_step_id = s.id
      and c.is_active
      and c.required
      and c.status not in ('complete', 'not_applicable')
  );

-- The legacy text field is no longer an operational source of truth for active Work.
-- Retain the column for compatibility/history while clearing stale active values.
update public.work_records
set next_action = '',
    updated_at = now()
where status not in ('complete', 'cancelled')
  and btrim(next_action) <> '';

comment on column public.work_records.next_action is
  'DEPRECATED operational field. Active next action is calculated by get_work_next_best_action; do not use as a workflow source of truth.';

create or replace view public.workbench_jobs
with (security_invoker = true)
as
select
  w.id,
  w.workspace_id,
  w.item_id,
  w.work_number,
  w.type,
  w.title,
  w.status,
  w.waiting_reason,
  w.priority,
  case
    when w.status = 'complete' then 'Complete'
    when w.status = 'cancelled' then 'Cancelled'
    else coalesce(nba.title, 'Review Work')
  end as next_action,
  w.blocker,
  w.diagnosis,
  w.opened_at,
  w.completed_at,
  i.item_number,
  i.title as item_title,
  i.type as item_type
from public.work_records w
join public.items i
  on i.workspace_id = w.workspace_id
 and i.id = w.item_id
left join lateral (
  select a.title
  from public.get_work_next_best_action(w.workspace_id, w.id) a
  limit 1
) nba on true
where i.archived_at is null;

revoke all on public.workbench_jobs from anon;
grant select on public.workbench_jobs to authenticated;

comment on view public.workbench_jobs is
  'Security-invoker Workbench read model. next_action is calculated by the canonical Job State Engine, never the deprecated manual work_records.next_action field.';
