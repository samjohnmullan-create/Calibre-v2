create table if not exists public.customer_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  slug text not null unique,
  published boolean not null default false,
  catalogue_visible boolean not null default false,
  sold_archive_visible boolean not null default false,
  public_title text not null default '',
  subtitle text not null default '',
  summary text not null default '',
  condition_summary text not null default '',
  maker text not null default '',
  model text not null default '',
  reference text not null default '',
  era text not null default '',
  country text not null default '',
  movement_maker text not null default '',
  calibre text not null default '',
  jewels integer,
  beat_rate integer,
  movement_type text not null default '',
  escapement text not null default '',
  case_material text not null default '',
  crystal_type text not null default '',
  width_mm numeric,
  thickness_mm numeric,
  provenance_summary text not null default '',
  service_summary text not null default '',
  final_timing_summary text not null default '',
  authenticity_note text not null default '',
  certificate_number text unique,
  certificate_issued_at timestamptz,
  hero_image_url text not null default '',
  gallery_urls text[] not null default '{}',
  price_amount numeric,
  currency text not null default 'AUD',
  availability text not null default 'catalogue' check (availability in ('catalogue','available','reserved','sold','archive')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, item_id)
);

create index if not exists customer_publications_catalogue_idx
  on public.customer_publications (published, catalogue_visible, availability, published_at desc);

alter table public.customer_publications enable row level security;

grant select on table public.customer_publications to anon, authenticated;
grant insert, update, delete on table public.customer_publications to authenticated;

create policy "customer_publications_public_select"
  on public.customer_publications for select to anon
  using (published = true);

create policy "customer_publications_member_select"
  on public.customer_publications for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = customer_publications.workspace_id and m.user_id = (select auth.uid())));

create policy "customer_publications_editor_insert"
  on public.customer_publications for insert to authenticated
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = customer_publications.workspace_id and m.user_id = (select auth.uid()) and m.role = any (array['owner'::text, 'editor'::text])));

create policy "customer_publications_editor_update"
  on public.customer_publications for update to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = customer_publications.workspace_id and m.user_id = (select auth.uid()) and m.role = any (array['owner'::text, 'editor'::text])))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = customer_publications.workspace_id and m.user_id = (select auth.uid()) and m.role = any (array['owner'::text, 'editor'::text])));

create policy "customer_publications_editor_delete"
  on public.customer_publications for delete to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = customer_publications.workspace_id and m.user_id = (select auth.uid()) and m.role = any (array['owner'::text, 'editor'::text])));
