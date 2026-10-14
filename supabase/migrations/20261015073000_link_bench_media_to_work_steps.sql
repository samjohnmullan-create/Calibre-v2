-- Bench photo/microscope evidence can point to the exact copied Work step.

alter table public.media_assets
  add column work_checklist_step_id uuid
  references public.work_checklist_steps(id) on delete set null;

create index media_assets_workspace_work_step_idx
  on public.media_assets(workspace_id, work_checklist_step_id)
  where work_checklist_step_id is not null;

create or replace function public.validate_media_work_step_context()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_step public.work_checklist_steps%rowtype;
begin
  if new.work_checklist_step_id is null then
    return new;
  end if;

  select * into v_step
  from public.work_checklist_steps
  where id = new.work_checklist_step_id;

  if not found then
    raise exception 'Checklist step not found';
  end if;

  if new.work_id is null then
    raise exception 'Step-level media requires a Work record';
  end if;

  if v_step.workspace_id is distinct from new.workspace_id
     or v_step.work_id is distinct from new.work_id
     or v_step.item_id is distinct from new.item_id then
    raise exception 'Media Item, Work and checklist step must belong to the same workshop context';
  end if;

  return new;
end;
$$;

create trigger media_assets_validate_work_step_context
before insert or update of workspace_id, item_id, work_id, work_checklist_step_id
on public.media_assets
for each row execute function public.validate_media_work_step_context();
