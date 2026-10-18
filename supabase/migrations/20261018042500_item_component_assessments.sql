-- Item-level component condition evidence used by donor/rebuild intelligence.
-- Components remain part of the Item until physically harvested; harvested components continue to live in public.parts.

create table if not exists public.item_component_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id uuid not null,
  component_key text not null check (btrim(component_key) <> ''),
  component_label text not null check (btrim(component_label) <> ''),
  condition text not null default 'untested' check (condition = any (array[
    'unknown'::text,
    'good'::text,
    'usable'::text,
    'worn'::text,
    'damaged'::text,
    'missing'::text,
    'untested'::text
  ])),
  confidence text not null default 'unknown' check (confidence = any (array[
    'confirmed'::text,
    'strong'::text,
    'probable'::text,
    'possible'::text,
    'unknown'::text
  ])),
  evidence_note text not null default '',
  measured_values jsonb not null default '{}'::jsonb,
  assessed_by uuid null default auth.uid() references auth.users(id),
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_component_assessments_item_fk
    foreign key (workspace_id, item_id)
    references public.items(workspace_id, id)
    on delete cascade,
  constraint item_component_assessments_unique unique (workspace_id, item_id, component_key)
);

create index if not exists item_component_assessments_item_idx
  on public.item_component_assessments (workspace_id, item_id, component_key);
create index if not exists item_component_assessments_assessed_by_idx
  on public.item_component_assessments (assessed_by);

alter table public.item_component_assessments enable row level security;

grant select, insert, update, delete on table public.item_component_assessments to authenticated;

create policy item_component_assessments_select
on public.item_component_assessments
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = item_component_assessments.workspace_id
      and m.user_id = (select auth.uid())
  )
);

create policy item_component_assessments_insert
on public.item_component_assessments
for insert
to authenticated
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = item_component_assessments.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'editor'::text])
  )
);

create policy item_component_assessments_update
on public.item_component_assessments
for update
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = item_component_assessments.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'editor'::text])
  )
)
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = item_component_assessments.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'editor'::text])
  )
);

create policy item_component_assessments_delete
on public.item_component_assessments
for delete
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = item_component_assessments.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'editor'::text])
  )
);
