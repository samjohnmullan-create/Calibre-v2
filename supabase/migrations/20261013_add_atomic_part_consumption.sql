create or replace function public.consume_part_allocation(
  p_workspace_id uuid,
  p_allocation_id uuid
)
returns public.part_allocations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allocation public.part_allocations;
  v_available numeric;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_allocation
  from public.part_allocations
  where id = p_allocation_id
    and workspace_id = p_workspace_id
  for update;

  if v_allocation.id is null then
    raise exception 'Allocation not found';
  end if;

  if v_allocation.status <> 'reserved' then
    raise exception 'Only reserved allocations can be used';
  end if;

  select quantity into v_available
  from public.parts
  where id = v_allocation.part_id
    and workspace_id = p_workspace_id
  for update;

  if v_available is null then
    raise exception 'Part not found';
  end if;

  if v_available < v_allocation.quantity then
    raise exception 'Insufficient part quantity';
  end if;

  update public.parts
  set quantity = quantity - v_allocation.quantity,
      updated_at = now()
  where id = v_allocation.part_id
    and workspace_id = p_workspace_id;

  update public.part_allocations
  set status = 'used',
      used_at = now(),
      updated_at = now()
  where id = p_allocation_id
    and workspace_id = p_workspace_id
  returning * into v_allocation;

  return v_allocation;
end;
$$;

grant execute on function public.consume_part_allocation(uuid, uuid) to authenticated;
