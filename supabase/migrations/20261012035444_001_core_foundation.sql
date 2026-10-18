create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public;

create or replace function app_private.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, slug)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);

create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.storage_locations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  code text,
  location_type text not null default 'bin' check (location_type in ('site','room','cabinet','drawer','bin','shelf','box','tray','other')),
  sort_order integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,code)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_type text not null check (source_type in ('manufacturer','catalogue','book','website','auction','sold_comp','invoice','email','document','bench_note','other')),
  title text not null check (btrim(title) <> ''),
  publisher text not null default '',
  url text not null default '',
  reference_text text not null default '',
  publication_date date,
  reliability text not null default 'unknown' check (reliability in ('primary','high','medium','low','unknown')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_number bigint generated always as identity,
  type text not null check (type in ('watch','movement','clock','jewellery','accessory','collectible','part_lot','other')),
  purpose text not null default 'resale' check (purpose in ('resale','collection','repair','donor','client','reference','other')),
  status text not null default 'acquired' check (status in ('acquired','researching','preparing','ready_for_sale','listed','sold','archived')),
  title text not null check (btrim(title) <> ''),
  acquired_at date,
  source_id uuid,
  storage_location_id uuid,
  notes text not null default '',
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,source_id) references public.sources(workspace_id,id) on delete set null,
  foreign key(workspace_id,storage_location_id) references public.storage_locations(workspace_id,id) on delete set null
);

create table public.item_identity (
  item_id uuid primary key,
  workspace_id uuid not null,
  maker text not null default '',
  model text not null default '',
  reference text not null default '',
  serial text not null default '',
  year_from integer check (year_from is null or year_from between 1500 and 2200),
  year_to integer check (year_to is null or year_to between 1500 and 2200),
  era text not null default '',
  country text not null default '',
  materials text not null default '',
  dimensions_text text not null default '',
  weight_grams numeric(12,3) check (weight_grams is null or weight_grams >= 0),
  dial_markings text not null default '',
  case_markings text not null default '',
  movement_markings text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create table public.item_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  fact_type text not null check (btrim(fact_type) <> ''),
  value_text text not null default '',
  value_number numeric,
  value_date date,
  unit text not null default '',
  confidence text not null default 'unknown' check (confidence in ('confirmed','strong','probable','possible','unknown')),
  status text not null default 'active' check (status in ('active','rejected','superseded')),
  evidence_note text not null default '',
  superseded_by uuid references public.item_facts(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  check ((value_text <> '') or value_number is not null or value_date is not null)
);

create table public.item_fact_sources (
  workspace_id uuid not null,
  item_fact_id uuid not null references public.item_facts(id) on delete cascade,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(item_fact_id,source_id),
  foreign key(workspace_id,source_id) references public.sources(workspace_id,id) on delete cascade
);

create table public.passports (
  item_id uuid primary key,
  workspace_id uuid not null,
  movement_maker text not null default '',
  calibre text not null default '',
  calibre_family text not null default '',
  jewels integer check (jewels is null or jewels between 0 and 200),
  beat_rate integer check (beat_rate is null or beat_rate between 1000 and 100000),
  power_reserve_hours numeric(8,2) check (power_reserve_hours is null or power_reserve_hours >= 0),
  escapement text not null default '',
  movement_diameter_mm numeric(8,3) check (movement_diameter_mm is null or movement_diameter_mm > 0),
  movement_type text not null default '',
  setting_system text not null default '',
  complications text[] not null default '{}',
  case_material text not null default '',
  case_style text not null default '',
  caseback_type text not null default '',
  crystal_type text not null default '',
  crown_type text not null default '',
  lug_width_mm numeric(8,3), width_mm numeric(8,3), height_mm numeric(8,3), thickness_mm numeric(8,3),
  water_resistance_marking text not null default '',
  hallmarks text not null default '',
  provenance_summary text not null default '',
  technical_notes text not null default '',
  updated_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create index items_ws_status_idx on public.items(workspace_id,status,updated_at desc);
create index items_ws_type_idx on public.items(workspace_id,type);
create index items_title_trgm_idx on public.items using gin(title gin_trgm_ops);
create index identity_maker_trgm_idx on public.item_identity using gin(maker gin_trgm_ops);
create index identity_model_trgm_idx on public.item_identity using gin(model gin_trgm_ops);
create index facts_item_idx on public.item_facts(workspace_id,item_id,fact_type,status);

create trigger workspaces_touch before update on public.workspaces for each row execute function app_private.touch_updated_at();
create trigger storage_locations_touch before update on public.storage_locations for each row execute function app_private.touch_updated_at();
create trigger sources_touch before update on public.sources for each row execute function app_private.touch_updated_at();
create trigger items_touch before update on public.items for each row execute function app_private.touch_updated_at();
create trigger identity_touch before update on public.item_identity for each row execute function app_private.touch_updated_at();
create trigger passports_touch before update on public.passports for each row execute function app_private.touch_updated_at();