create or replace function public.guard_work_part_need_status_transition()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_transition text := current_setting('calibre.part_need_transition', true);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'fulfilled' then
    raise exception 'Fulfilled part requirements are historical records and cannot be reopened directly';
  end if;

  if new.status = 'reserved' and coalesce(v_transition, '') <> 'reserve' then
    raise exception 'Reserve a stock part through the parts matching workflow';
  end if;

  if new.status = 'fulfilled' and coalesce(v_transition, '') <> 'fulfil' then
    raise exception 'Use verified allocated stock before fulfilling this part requirement';
  end if;

  if old.status = 'reserved' and new.status = 'open' and coalesce(v_transition, '') <> 'release' then
    raise exception 'Release the active reservation through the parts matching workflow';
  end if;

  if old.status = 'reserved' and new.status = 'cancelled' and coalesce(v_transition, '') <> 'cancel' then
    raise exception 'Release the active reservation before cancelling this part requirement';
  end if;

  return new;
end;
$function$;

drop trigger if exists work_part_needs_status_guard on public.work_part_needs;
create trigger work_part_needs_status_guard
before update of status on public.work_part_needs
for each row execute function public.guard_work_part_need_status_transition();

create or replace function public.resume_work_when_part_needs_clear()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status in ('fulfilled','cancelled')
     and new.status is distinct from old.status
     and not exists (
       select 1
       from public.work_part_needs n
       where n.workspace_id = new.workspace_id
         and n.work_record_id = new.work_record_id
         and n.status in ('open','reserved')
     ) then
    update public.work_records
    set status = 'ready',
        waiting_reason = null,
        blocker = '',
        next_action = case
          when coalesce(next_action, '') = '' or lower(next_action) like 'source %' then 'Resume work'
          else next_action
        end
    where id = new.work_record_id
      and workspace_id = new.workspace_id
      and status = 'waiting'
      and waiting_reason = 'parts';
  end if;

  return new;
end;
$function$;

drop trigger if exists work_part_needs_resume_work on public.work_part_needs;
create trigger work_part_needs_resume_work
after update of status on public.work_part_needs
for each row execute function public.resume_work_when_part_needs_clear();

create or replace function public.reserve_part_for_need(
  p_workspace_id uuid,
  p_need_id uuid,
  p_part_id uuid,
  p_quantity numeric default 1,
  p_note text default ''
)
returns public.part_allocations
language plpgsql
set search_path = public
as $function$
declare
  v_need public.work_part_needs;
  v_part public.parts;
  v_reserved numeric;
  v_allocation public.part_allocations;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Reservation quantity must be greater than zero';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(array['owner'::text,'editor'::text])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_need
  from public.work_part_needs
  where id = p_need_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Part need not found'; end if;
  if v_need.status not in ('open','reserved') then raise exception 'Part need is not open'; end if;

  select * into v_part
  from public.parts
  where id = p_part_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Part not found'; end if;

  select coalesce(sum(quantity),0) into v_reserved
  from public.part_allocations
  where workspace_id = p_workspace_id
    and part_id = p_part_id
    and status = 'reserved';

  if (v_part.quantity - v_reserved) < p_quantity then
    raise exception 'Not enough unreserved stock';
  end if;

  if exists (
    select 1 from public.part_allocations
    where work_part_need_id = p_need_id and status = 'reserved'
  ) then
    raise exception 'This part need already has a reservation';
  end if;

  insert into public.part_allocations (
    workspace_id, work_part_need_id, work_record_id, item_id,
    part_id, quantity, status, note
  ) values (
    p_workspace_id, v_need.id, v_need.work_record_id, v_need.item_id,
    p_part_id, p_quantity, 'reserved', coalesce(p_note,'')
  ) returning * into v_allocation;

  perform set_config('calibre.part_need_transition', 'reserve', true);
  update public.work_part_needs
  set status = 'reserved', updated_at = now()
  where id = v_need.id;
  perform set_config('calibre.part_need_transition', '', true);

  return v_allocation;
end;
$function$;

create or replace function public.release_part_reservation(
  p_workspace_id uuid,
  p_allocation_id uuid
)
returns public.part_allocations
language plpgsql
set search_path = public
as $function$
declare
  v_allocation public.part_allocations;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(array['owner'::text,'editor'::text])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_allocation
  from public.part_allocations
  where id = p_allocation_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;
  if v_allocation.status <> 'reserved' then raise exception 'Reservation is not active'; end if;

  update public.part_allocations
  set status = 'released', released_at = now(), updated_at = now()
  where id = v_allocation.id
  returning * into v_allocation;

  perform set_config('calibre.part_need_transition', 'release', true);
  update public.work_part_needs
  set status = 'open', updated_at = now()
  where id = v_allocation.work_part_need_id and status = 'reserved';
  perform set_config('calibre.part_need_transition', '', true);

  return v_allocation;
end;
$function$;

create or replace function public.consume_part_allocation(
  p_workspace_id uuid,
  p_allocation_id uuid
)
returns public.part_allocations
language plpgsql
set search_path = public
as $function$
declare
  v_allocation public.part_allocations;
  v_available numeric;
  v_latest_fit text;
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

  select f.result into v_latest_fit
  from public.part_fit_verifications f
  where f.workspace_id = p_workspace_id
    and f.part_id = v_allocation.part_id
    and f.work_record_id = v_allocation.work_record_id
    and f.item_id = v_allocation.item_id
  order by f.verified_at desc, f.created_at desc
  limit 1;

  if coalesce(v_latest_fit, '') not in ('confirmed','conditional') then
    raise exception 'Record confirmed or conditional fit evidence before consuming this part';
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
$function$;

create or replace function public.fulfil_part_need(
  p_workspace_id uuid,
  p_need_id uuid
)
returns public.work_part_needs
language plpgsql
set search_path = public
as $function$
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

  perform set_config('calibre.part_need_transition', 'fulfil', true);
  update public.work_part_needs
  set status = 'fulfilled',
      updated_at = now()
  where id = v_need.id
    and workspace_id = p_workspace_id
  returning * into v_need;
  perform set_config('calibre.part_need_transition', '', true);

  return v_need;
end;
$function$;
