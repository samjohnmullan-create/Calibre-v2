create table if not exists public.work_component_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  component_key text not null check (btrim(component_key) <> ''),
  component_label text not null check (btrim(component_label) <> ''),
  state text not null default 'installed' check (state = any (array['installed'::text,'removed'::text,'opened'::text,'unopened'::text,'disassembled'::text,'reassembled'::text,'cleaning'::text,'stored'::text,'not_applicable'::text])),
  location text not null default '',
  notes text not null default '',
  sequence integer not null default 100 check (sequence >= 0),
  updated_by uuid null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_component_states_work_fk foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_component_states_item_fk foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_component_states_unique unique (workspace_id, work_id, component_key)
);

create index if not exists work_component_states_work_idx on public.work_component_states(workspace_id, work_id, sequence, component_key);
create index if not exists work_component_states_item_idx on public.work_component_states(workspace_id, item_id);

alter table public.work_component_states enable row level security;

grant select, insert, update, delete on table public.work_component_states to authenticated;

create policy work_component_states_select
on public.work_component_states
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = work_component_states.workspace_id
      and m.user_id = (select auth.uid())
  )
);

create policy work_component_states_insert
on public.work_component_states
for insert
to authenticated
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = work_component_states.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
);

create policy work_component_states_update
on public.work_component_states
for update
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = work_component_states.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
)
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = work_component_states.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
);

create policy work_component_states_delete
on public.work_component_states
for delete
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = work_component_states.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
);
