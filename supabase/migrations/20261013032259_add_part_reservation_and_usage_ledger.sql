create table if not exists public.part_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_part_need_id uuid not null references public.work_part_needs(id) on delete cascade,
  work_record_id uuid not null references public.work_records(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete restrict,
  quantity numeric not null default 1 check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','used','released')),
  reserved_by uuid default auth.uid(),
  reserved_at timestamptz not null default now(),
  used_at timestamptz,
  released_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists part_allocations_one_active_per_need
  on public.part_allocations(work_part_need_id)
  where status = 'reserved';
create index if not exists part_allocations_part_status_idx
  on public.part_allocations(workspace_id, part_id, status);
create index if not exists part_allocations_work_idx
  on public.part_allocations(workspace_id, work_record_id, created_at desc);

alter table public.part_allocations enable row level security;

drop policy if exists part_allocations_select on public.part_allocations;
create policy part_allocations_select on public.part_allocations
for select using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_allocations.workspace_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists part_allocations_insert on public.part_allocations;
create policy part_allocations_insert on public.part_allocations
for insert with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_allocations.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text,'editor'::text])
  )
);

drop policy if exists part_allocations_update on public.part_allocations;
create policy part_allocations_update on public.part_allocations
for update using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_allocations.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text,'editor'::text])
  )
) with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_allocations.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text,'editor'::text])
  )
);

drop policy if exists part_allocations_delete on public.part_allocations;
create policy part_allocations_delete on public.part_allocations
for delete using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_allocations.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text,'editor'::text])
  )
);

create or replace function public.reserve_part_for_need(
  p_workspace_id uuid,
  p_need_id uuid,
  p_part_id uuid,
  p_quantity numeric default 1,
  p_note text default ''
) returns public.part_allocations
language plpgsql
set search_path = public
as $$
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
    select 1 from workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(array['owner'::text,'editor'::text])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_need from work_part_needs
  where id = p_need_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Part need not found'; end if;
  if v_need.status not in ('open','reserved') then raise exception 'Part need is not open'; end if;

  select * into v_part from parts
  where id = p_part_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Part not found'; end if;

  select coalesce(sum(quantity),0) into v_reserved
  from part_allocations
  where workspace_id = p_workspace_id
    and part_id = p_part_id
    and status = 'reserved';

  if (v_part.quantity - v_reserved) < p_quantity then
    raise exception 'Not enough unreserved stock';
  end if;

  if exists (select 1 from part_allocations where work_part_need_id = p_need_id and status = 'reserved') then
    raise exception 'This part need already has a reservation';
  end if;

  insert into part_allocations (
    workspace_id, work_part_need_id, work_record_id, item_id,
    part_id, quantity, status, note
  ) values (
    p_workspace_id, v_need.id, v_need.work_record_id, v_need.item_id,
    p_part_id, p_quantity, 'reserved', coalesce(p_note,'')
  ) returning * into v_allocation;

  update work_part_needs
  set status = 'reserved', updated_at = now()
  where id = v_need.id;

  return v_allocation;
end;
$$;

create or replace function public.release_part_reservation(
  p_workspace_id uuid,
  p_allocation_id uuid
) returns public.part_allocations
language plpgsql
set search_path = public
as $$
declare
  v_allocation public.part_allocations;
begin
  if not exists (
    select 1 from workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(array['owner'::text,'editor'::text])
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_allocation from part_allocations
  where id = p_allocation_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;
  if v_allocation.status <> 'reserved' then raise exception 'Reservation is not active'; end if;

  update part_allocations
  set status='released', released_at=now(), updated_at=now()
  where id=v_allocation.id returning * into v_allocation;

  update work_part_needs
  set status='open', updated_at=now()
  where id=v_allocation.work_part_need_id and status='reserved';

  return v_allocation;
end;
$$;

create or replace function public.consume_part_reservation(
  p_workspace_id uuid,
  p_allocation_id uuid
) returns public.part_allocations
language plpgsql
set search_path = public
as $$
declare
  v_allocation public.part_allocations;
  v_part public.parts;
begin
  if not exists (
    select 1 from workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(array['owner'::text,'editor'::text])
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_allocation from part_allocations
  where id=p_allocation_id and workspace_id=p_workspace_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;
  if v_allocation.status <> 'reserved' then raise exception 'Reservation is not active'; end if;

  select * into v_part from parts
  where id=v_allocation.part_id and workspace_id=p_workspace_id
  for update;
  if not found then raise exception 'Part not found'; end if;
  if v_part.quantity < v_allocation.quantity then raise exception 'Part stock is below reserved quantity'; end if;

  update parts
  set quantity = quantity - v_allocation.quantity, updated_at=now()
  where id=v_part.id;

  update part_allocations
  set status='used', used_at=now(), updated_at=now()
  where id=v_allocation.id returning * into v_allocation;

  return v_allocation;
end;
$$;

create or replace function public.fulfil_part_need(
  p_workspace_id uuid,
  p_need_id uuid
) returns public.work_part_needs
language plpgsql
set search_path = public
as $$
declare
  v_need public.work_part_needs;
begin
  if not exists (
    select 1 from workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(array['owner'::text,'editor'::text])
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_need from work_part_needs
  where id=p_need_id and workspace_id=p_workspace_id
  for update;
  if not found then raise exception 'Part need not found'; end if;

  if not exists (
    select 1 from part_allocations a
    where a.work_part_need_id=v_need.id and a.status='used'
  ) then raise exception 'Use the reserved part before fulfilling the need'; end if;

  update work_part_needs
  set status='fulfilled', updated_at=now()
  where id=v_need.id returning * into v_need;

  return v_need;
end;
$$;

grant execute on function public.reserve_part_for_need(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.release_part_reservation(uuid,uuid) to authenticated;
grant execute on function public.consume_part_reservation(uuid,uuid) to authenticated;
grant execute on function public.fulfil_part_need(uuid,uuid) to authenticated;