create or replace function public.fulfil_part_need(
  p_workspace_id uuid,
  p_need_id uuid
)
returns public.work_part_needs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_need public.work_part_needs;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_need
  from public.work_part_needs
  where id = p_need_id
    and workspace_id = p_workspace_id
  for update;

  if v_need.id is null then
    raise exception 'Part need not found';
  end if;

  if not exists (
    select 1 from public.part_allocations a
    where a.work_part_need_id = v_need.id
      and a.workspace_id = p_workspace_id
      and a.status = 'used'
  ) then
    raise exception 'Use the reserved part before fulfilling the need';
  end if;

  update public.work_part_needs
  set status = 'fulfilled',
      updated_at = now()
  where id = v_need.id
    and workspace_id = p_workspace_id
  returning * into v_need;

  update public.work_records
  set status = 'ready',
      waiting_reason = null,
      blocker = '',
      next_action = case
        when coalesce(next_action, '') = '' or lower(next_action) like 'source %' then 'Resume work'
        else next_action
      end
  where id = v_need.work_record_id
    and workspace_id = p_workspace_id
    and status = 'waiting'
    and waiting_reason = 'parts';

  return v_need;
end;
$$;

grant execute on function public.fulfil_part_need(uuid, uuid) to authenticated;
