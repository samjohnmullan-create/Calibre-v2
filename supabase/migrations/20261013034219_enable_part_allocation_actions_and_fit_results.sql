grant insert, update on table public.part_allocations to authenticated;

create or replace function public.record_part_fit_result(
  p_workspace_id uuid,
  p_part_id uuid,
  p_item_id uuid,
  p_work_record_id uuid,
  p_result text,
  p_note text default ''
)
returns public.part_fit_verifications
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_verification public.part_fit_verifications;
  v_knowledge_movement_id uuid;
begin
  if p_result not in ('confirmed','rejected','conditional') then
    raise exception 'Invalid fit result';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if not exists (
    select 1 from public.parts p
    where p.id = p_part_id and p.workspace_id = p_workspace_id
  ) then
    raise exception 'Part not found';
  end if;

  if not exists (
    select 1 from public.work_records w
    where w.id = p_work_record_id
      and w.item_id = p_item_id
      and w.workspace_id = p_workspace_id
  ) then
    raise exception 'Work record not found for item';
  end if;

  select knowledge_movement_id
  into v_knowledge_movement_id
  from public.passports
  where workspace_id = p_workspace_id
    and item_id = p_item_id
  limit 1;

  insert into public.part_fit_verifications (
    workspace_id,
    part_id,
    knowledge_movement_id,
    item_id,
    work_record_id,
    result,
    modification_required,
    evidence_note,
    measured_values,
    verified_by,
    verified_at
  ) values (
    p_workspace_id,
    p_part_id,
    v_knowledge_movement_id,
    p_item_id,
    p_work_record_id,
    p_result,
    false,
    coalesce(p_note,''),
    '{}'::jsonb,
    auth.uid(),
    now()
  )
  returning * into v_verification;

  return v_verification;
end;
$$;

grant execute on function public.record_part_fit_result(uuid, uuid, uuid, uuid, text, text) to authenticated;
