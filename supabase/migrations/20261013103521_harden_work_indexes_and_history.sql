create index if not exists work_records_template_id_idx on public.work_records(template_id);
create index if not exists work_templates_created_by_idx on public.work_templates(created_by);
create index if not exists work_template_steps_workspace_template_idx on public.work_template_steps(workspace_id, template_id);
create index if not exists work_checklist_steps_workspace_work_idx on public.work_checklist_steps(workspace_id, work_id);
create index if not exists work_checklist_steps_workspace_item_idx on public.work_checklist_steps(workspace_id, item_id);
create index if not exists work_checklist_steps_template_id_idx on public.work_checklist_steps(template_id);
create index if not exists work_checklist_steps_template_step_id_idx on public.work_checklist_steps(template_step_id);

create or replace function public.log_work_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details, actor_id, actor_type)
    values (
      new.workspace_id,
      new.id,
      new.item_id,
      'status_changed',
      'Work moved from ' || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' '),
      jsonb_build_object('from', old.status, 'to', new.status),
      auth.uid(),
      case when auth.uid() is null then 'system' else 'user' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists work_records_log_status_change on public.work_records;
create trigger work_records_log_status_change
after update of status on public.work_records
for each row
when (old.status is distinct from new.status)
execute function public.log_work_status_change();

create or replace function public.log_work_checklist_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details, actor_id, actor_type)
    values (
      new.workspace_id,
      new.work_id,
      new.item_id,
      'checklist_step',
      new.label || ' → ' || replace(new.status, '_', ' '),
      jsonb_build_object('step_id', new.id, 'step_key', new.step_key, 'from', old.status, 'to', new.status),
      auth.uid(),
      case when auth.uid() is null then 'system' else 'user' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists work_checklist_steps_log_change on public.work_checklist_steps;
create trigger work_checklist_steps_log_change
after update of status on public.work_checklist_steps
for each row
when (old.status is distinct from new.status)
execute function public.log_work_checklist_change();
