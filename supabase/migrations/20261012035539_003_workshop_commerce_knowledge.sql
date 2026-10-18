create table public.parts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  part_type text not null check (btrim(part_type) <> ''),
  manufacturer text not null default '',
  reference text not null default '',
  description text not null default '',
  condition text not null default '',
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  currency text not null default 'AUD',
  storage_location_id uuid,
  donor_item_id uuid,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,storage_location_id) references public.storage_locations(workspace_id,id) on delete set null,
  foreign key(workspace_id,donor_item_id) references public.items(workspace_id,id) on delete set null
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  work_id uuid,
  part_id uuid,
  measurement_type text not null check (btrim(measurement_type) <> ''),
  value numeric not null,
  unit text not null check (btrim(unit) <> ''),
  method text not null default '',
  notes text not null default '',
  media_asset_id uuid,
  measured_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete set null,
  foreign key(workspace_id,part_id) references public.parts(workspace_id,id) on delete set null,
  foreign key(workspace_id,media_asset_id) references public.media_assets(workspace_id,id) on delete set null
);

create table public.timing_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  work_id uuid,
  bph integer not null check (bph between 1000 and 100000),
  rate_seconds_per_day numeric(10,3) not null,
  beat_error_ms numeric(10,3) check (beat_error_ms is null or beat_error_ms >= 0),
  amplitude_deg numeric(10,3) check (amplitude_deg is null or amplitude_deg between 0 and 360),
  lift_angle_deg numeric(10,3) check (lift_angle_deg is null or lift_angle_deg between 0 and 90),
  position text not null default '' check (position in ('','dial_up','dial_down','crown_up','crown_down','crown_left','crown_right','other')),
  duration_seconds numeric(12,3),
  stability_score numeric(5,2) check (stability_score is null or stability_score between 0 and 100),
  confidence text not null default 'unknown' check (confidence in ('confirmed','strong','probable','possible','unknown')),
  device text not null default '',
  notes text not null default '',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete set null
);

create table public.part_applications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  part_id uuid not null,
  movement_maker text not null default '',
  calibre text not null default '',
  serial_from text not null default '',
  serial_to text not null default '',
  source_id uuid,
  evidence_class text not null default 'documented' check (evidence_class in ('documented','manufacturer','catalogue','inferred')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key(workspace_id,part_id) references public.parts(workspace_id,id) on delete cascade,
  foreign key(workspace_id,source_id) references public.sources(workspace_id,id) on delete set null
);

create table public.part_fit_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  part_id uuid not null,
  item_id uuid not null,
  work_id uuid,
  result text not null check (result in ('fits','does_not_fit','partial','untested')),
  notes text not null default '',
  verified_by uuid default auth.uid() references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  foreign key(workspace_id,part_id) references public.parts(workspace_id,id) on delete cascade,
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete set null
);

create table public.item_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_item_id uuid not null,
  relationship_type text not null check (relationship_type in ('donor_for','movement_removed_from','belongs_to','paired_with','replacement_for','related_to','other')),
  target_item_id uuid not null,
  confidence text not null default 'confirmed' check (confidence in ('confirmed','strong','probable','possible','unknown')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key(workspace_id,source_item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,target_item_id) references public.items(workspace_id,id) on delete cascade,
  check (source_item_id <> target_item_id)
);

create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  work_id uuid,
  category text not null check (category in ('purchase','buyer_premium','postage','part','consumable','external_service','marketplace_fee','buyer_postage','repair','preparation','other')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AUD',
  incurred_at date not null default current_date,
  source_id uuid,
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete set null,
  foreign key(workspace_id,source_id) references public.sources(workspace_id,id) on delete set null
);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  low_value numeric(12,2), expected_value numeric(12,2), high_value numeric(12,2), target_value numeric(12,2), minimum_value numeric(12,2),
  currency text not null default 'AUD',
  confidence text not null default 'unknown' check (confidence in ('confirmed','strong','probable','possible','unknown')),
  basis text not null default '',
  valued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  status text not null default 'draft' check (status in ('draft','ready','listed','sold','cancelled')),
  channel text not null default '',
  listing_title text not null default '',
  listing_text text not null default '',
  asking_price numeric(12,2), sale_price numeric(12,2),
  currency text not null default 'AUD',
  listed_at timestamptz, sold_at timestamptz,
  marketplace_fees numeric(12,2) not null default 0,
  shipping_to_buyer numeric(12,2) not null default 0,
  buyer_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  sale_id uuid,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AUD',
  buyer text not null default '', source text not null default '',
  status text not null default 'received' check (status in ('received','accepted','declined','expired','withdrawn')),
  notes text not null default '', offered_at timestamptz not null default now(),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,sale_id) references public.sales(workspace_id,id) on delete set null
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid,
  external_order_id text not null default '',
  description text not null check (btrim(description) <> ''),
  category text not null default 'other' check (category in ('item','part','tool','consumable','postage','service','other')),
  amount numeric(12,2), currency text not null default 'AUD',
  status text not null default 'ordered' check (status in ('suggested','ordered','shipped','delivered','received','cancelled','returned')),
  ordered_at date, tracking_number text not null default '', eta date, received_at timestamptz,
  notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(workspace_id,source_id) references public.sources(workspace_id,id) on delete set null
);

create table public.tools (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''), category text not null default '', manufacturer text not null default '', model text not null default '',
  quantity numeric(12,3) not null default 1, purchase_cost numeric(12,2), storage_location_id uuid, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(workspace_id,storage_location_id) references public.storage_locations(workspace_id,id) on delete set null
);

create table public.consumables (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''), category text not null default '', quantity numeric(12,3) not null default 0, unit text not null default '',
  reorder_level numeric(12,3), storage_location_id uuid, notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(workspace_id,storage_location_id) references public.storage_locations(workspace_id,id) on delete set null
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null, entity_id uuid, action text not null,
  old_data jsonb, new_data jsonb,
  actor_id uuid default auth.uid() references auth.users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user','automation','research','import','system')),
  source text not null default 'app', device_id text not null default '', created_at timestamptz not null default now()
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(), title text not null, source_type text not null default 'document', publisher text not null default '',
  url text not null default '', reference_text text not null default '', reliability text not null default 'unknown' check (reliability in ('primary','high','medium','low','unknown')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.knowledge_movements (
  id uuid primary key default gen_random_uuid(), maker text not null default '', calibre text not null, calibre_family text not null default '',
  diameter_mm numeric(8,3), jewels integer, bph integer, escapement text not null default '', power_reserve_hours numeric(8,2), lift_angle_deg numeric(8,3),
  notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(maker,calibre)
);
create table public.knowledge_part_refs (
  id uuid primary key default gen_random_uuid(), manufacturer text not null default '', part_type text not null, part_reference text not null,
  description text not null default '', source_id uuid references public.knowledge_sources(id) on delete set null, notes text not null default '', created_at timestamptz not null default now()
);
create table public.knowledge_part_applications (
  id uuid primary key default gen_random_uuid(), part_ref_id uuid not null references public.knowledge_part_refs(id) on delete cascade,
  movement_id uuid not null references public.knowledge_movements(id) on delete cascade, serial_from text not null default '', serial_to text not null default '',
  evidence_class text not null default 'documented' check (evidence_class in ('manufacturer','documented','catalogue','inferred')),
  source_id uuid references public.knowledge_sources(id) on delete set null, notes text not null default '', unique(part_ref_id,movement_id,serial_from,serial_to)
);

create index measurements_item_idx on public.measurements(workspace_id,item_id,measurement_type,measured_at desc);
create index timing_item_idx on public.timing_runs(workspace_id,item_id,recorded_at desc);
create index parts_ref_idx on public.parts(workspace_id,manufacturer,reference);
create index costs_item_idx on public.cost_entries(workspace_id,item_id,incurred_at desc);
create index valuations_item_idx on public.valuations(workspace_id,item_id,valued_at desc);
create index sales_item_idx on public.sales(workspace_id,item_id,status);
create index audit_entity_idx on public.audit_events(workspace_id,entity_type,entity_id,created_at desc);
create index kmovement_specs_idx on public.knowledge_movements(diameter_mm,jewels,bph);

create trigger parts_touch before update on public.parts for each row execute function app_private.touch_updated_at();
create trigger sales_touch before update on public.sales for each row execute function app_private.touch_updated_at();
create trigger purchases_touch before update on public.purchases for each row execute function app_private.touch_updated_at();
create trigger tools_touch before update on public.tools for each row execute function app_private.touch_updated_at();
create trigger consumables_touch before update on public.consumables for each row execute function app_private.touch_updated_at();
create trigger knowledge_sources_touch before update on public.knowledge_sources for each row execute function app_private.touch_updated_at();
create trigger knowledge_movements_touch before update on public.knowledge_movements for each row execute function app_private.touch_updated_at();