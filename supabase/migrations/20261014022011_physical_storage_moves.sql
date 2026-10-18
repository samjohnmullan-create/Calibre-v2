alter table public.storage_locations drop constraint if exists storage_locations_location_type_check;
alter table public.storage_locations add constraint storage_locations_location_type_check
  check (location_type = any (array['site','room','cabinet','drawer','bin','shelf','box','tray','position','other']::text[]));

alter table public.storage_locations drop constraint if exists storage_locations_parent_id_fkey;
alter table public.storage_locations add constraint storage_locations_parent_workspace_fk
  foreign key (workspace_id, parent_id)
  references public.storage_locations(workspace_id, id)
  on delete restrict;

create or replace function public.validate_storage_location_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cycle boolean := false;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A storage location cannot be its own parent';
  end if;

  if not exists (
    select 1 from public.storage_locations p
    where p.id = new.parent_id and p.workspace_id = new.workspace_id
  ) then
    raise exception 'Parent storage location must belong to the same workspace';
  end if;

  with recursive ancestors as (
    select p.id, p.parent_id
    from public.storage_locations p
    where p.id = new.parent_id and p.workspace_id = new.workspace_id
    union all
    select p.id, p.parent_id
    from public.storage_locations p
    join ancestors a on p.id = a.parent_id
    where p.workspace_id = new.workspace_id
  )
  select exists(select 1 from ancestors where id = new.id) into v_cycle;

  if v_cycle then
    raise exception 'Storage hierarchy cannot contain a cycle';
  end if;

  return new;
end;
$$;

drop trigger if exists storage_locations_validate_parent on public.storage_locations;
create trigger storage_locations_validate_parent
before insert or update of parent_id, workspace_id on public.storage_locations
for each row execute function public.validate_storage_location_parent();

create table if not exists public.storage_location_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type = any (array['item','part','tool','consumable']::text[])),
  entity_id uuid not null,
  entity_label text not null default '',
  from_location_id uuid null references public.storage_locations(id) on delete set null,
  to_location_id uuid null references public.storage_locations(id) on delete set null,
  note text not null default '',
  moved_by uuid null references auth.users(id) on delete set null default auth.uid(),
  moved_at timestamptz not null default now()
);

create index if not exists storage_location_events_workspace_entity_idx
  on public.storage_location_events (workspace_id, entity_type, entity_id, moved_at desc);
create index if not exists storage_location_events_workspace_to_idx
  on public.storage_location_events (workspace_id, to_location_id, moved_at desc);
create index if not exists storage_location_events_workspace_moved_idx
  on public.storage_location_events (workspace_id, moved_at desc);
create index if not exists storage_location_events_moved_by_idx
  on public.storage_location_events (moved_by) where moved_by is not null;

alter table public.storage_location_events enable row level security;

create policy storage_location_events_select on public.storage_location_events
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = storage_location_events.workspace_id
    and m.user_id = (select auth.uid())
));

create policy storage_location_events_insert on public.storage_location_events
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = storage_location_events.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

revoke update, delete on public.storage_location_events from authenticated;
grant select, insert on public.storage_location_events to authenticated;

create or replace function public.move_storage_entity(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_to_location_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from uuid;
  v_label text := '';
  v_to_name text := '';
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any (array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if p_to_location_id is not null then
    select concat_ws(' · ', nullif(l.code,''), l.name)
      into v_to_name
    from public.storage_locations l
    where l.workspace_id = p_workspace_id and l.id = p_to_location_id;
    if not found then raise exception 'Destination storage location not found in this workspace'; end if;
  else
    v_to_name := 'Unassigned';
  end if;

  if p_entity_type = 'item' then
    select i.storage_location_id, concat('#', i.item_number, ' ', i.title)
      into v_from, v_label
    from public.items i
    where i.workspace_id = p_workspace_id and i.id = p_entity_id
    for update;
    if not found then raise exception 'Item not found'; end if;
    update public.items set storage_location_id = p_to_location_id, updated_at = now()
    where workspace_id = p_workspace_id and id = p_entity_id;
  elsif p_entity_type = 'part' then
    select p.storage_location_id, concat_ws(' · ', p.part_type, nullif(p.manufacturer,''), nullif(p.reference,''))
      into v_from, v_label
    from public.parts p
    where p.workspace_id = p_workspace_id and p.id = p_entity_id
    for update;
    if not found then raise exception 'Part not found'; end if;
    update public.parts set storage_location_id = p_to_location_id, updated_at = now()
    where workspace_id = p_workspace_id and id = p_entity_id;
  elsif p_entity_type = 'tool' then
    select t.storage_location_id, t.name into v_from, v_label
    from public.tools t
    where t.workspace_id = p_workspace_id and t.id = p_entity_id
    for update;
    if not found then raise exception 'Tool not found'; end if;
    update public.tools set storage_location_id = p_to_location_id, updated_at = now()
    where workspace_id = p_workspace_id and id = p_entity_id;
  elsif p_entity_type = 'consumable' then
    select c.storage_location_id, c.name into v_from, v_label
    from public.consumables c
    where c.workspace_id = p_workspace_id and c.id = p_entity_id
    for update;
    if not found then raise exception 'Consumable not found'; end if;
    update public.consumables set storage_location_id = p_to_location_id, updated_at = now()
    where workspace_id = p_workspace_id and id = p_entity_id;
  else
    raise exception 'Unsupported storage entity type';
  end if;

  if v_from is distinct from p_to_location_id then
    insert into public.storage_location_events (
      workspace_id, entity_type, entity_id, entity_label,
      from_location_id, to_location_id, note, moved_by
    ) values (
      p_workspace_id, p_entity_type, p_entity_id, coalesce(v_label,''),
      v_from, p_to_location_id, coalesce(p_note,''), auth.uid()
    );
  end if;

  return jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'label', v_label,
    'from_location_id', v_from,
    'to_location_id', p_to_location_id,
    'to_location_name', v_to_name
  );
end;
$$;

revoke all on function public.move_storage_entity(uuid,text,uuid,uuid,text) from public;
grant execute on function public.move_storage_entity(uuid,text,uuid,uuid,text) to authenticated;
