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
  w.next_action,
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
where i.archived_at is null;

revoke all on public.workbench_jobs from anon;
grant select on public.workbench_jobs to authenticated;

comment on view public.workbench_jobs is 'Security-invoker read model for paginated Workbench queries.';
