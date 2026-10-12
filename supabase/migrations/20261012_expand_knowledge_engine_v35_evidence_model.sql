alter table public.knowledge_sources
  add column if not exists accessed_date date,
  add column if not exists source_record_id text,
  add column if not exists origin_kind text not null default 'documented',
  add column if not exists verification_status text not null default 'reviewed',
  add column if not exists import_batch text not null default '';

alter table public.knowledge_movements
  add column if not exists winding text not null default '',
  add column if not exists height_mm numeric,
  add column if not exists layout text not null default '',
  add column if not exists search_aliases jsonb not null default '[]'::jsonb,
  add column if not exists common_brands jsonb not null default '[]'::jsonb,
  add column if not exists primary_source_id uuid references public.knowledge_sources(id) on delete set null,
  add column if not exists source_record_id text,
  add column if not exists origin_kind text not null default 'documented',
  add column if not exists verification_status text not null default 'candidate',
  add column if not exists evidence_grade text not null default 'candidate',
  add column if not exists import_batch text not null default '';

alter table public.knowledge_part_refs
  add column if not exists source_record_id text,
  add column if not exists origin_kind text not null default 'documented',
  add column if not exists verification_status text not null default 'candidate',
  add column if not exists evidence_grade text not null default 'candidate',
  add column if not exists import_batch text not null default '';

alter table public.knowledge_part_applications
  add column if not exists confidence numeric,
  add column if not exists condition_text text not null default '',
  add column if not exists source_record_id text,
  add column if not exists origin_kind text not null default 'documented',
  add column if not exists verification_status text not null default 'candidate',
  add column if not exists import_batch text not null default '';

create table if not exists public.knowledge_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  engine_name text not null,
  engine_version text not null,
  imported_at timestamptz not null default now(),
  source_filename text not null default '',
  source_hash text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  notes text not null default ''
);

create table if not exists public.knowledge_families (
  id uuid primary key default gen_random_uuid(),
  maker text not null,
  family_name text not null,
  notes text not null default '',
  source_record_id text,
  origin_kind text not null default 'documented',
  verification_status text not null default 'candidate',
  evidence_grade text not null default 'candidate',
  import_batch text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maker, family_name)
);

create table if not exists public.knowledge_compatibility_edges (
  id uuid primary key default gen_random_uuid(),
  movement_a_id uuid not null references public.knowledge_movements(id) on delete cascade,
  movement_b_id uuid not null references public.knowledge_movements(id) on delete cascade,
  scope text not null,
  status text not null,
  confidence numeric,
  modification_required boolean not null default false,
  notes text not null default '',
  source_id uuid references public.knowledge_sources(id) on delete set null,
  source_record_id text,
  origin_kind text not null default 'documented',
  verification_status text not null default 'candidate',
  evidence_grade text not null default 'candidate',
  import_batch text not null default '',
  created_at timestamptz not null default now(),
  unique (movement_a_id, movement_b_id, scope, status)
);

create table if not exists public.knowledge_identification_signals (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.knowledge_movements(id) on delete cascade,
  signal_type text not null,
  signal_value text not null,
  weight numeric not null default 1,
  source_url text not null default '',
  source_id uuid references public.knowledge_sources(id) on delete set null,
  notes text not null default '',
  source_record_id text,
  origin_kind text not null default 'documented',
  verification_status text not null default 'candidate',
  import_batch text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_technical_documents (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid references public.knowledge_movements(id) on delete cascade,
  title text not null,
  document_type text not null default '',
  url text not null default '',
  reference_text text not null default '',
  source_id uuid references public.knowledge_sources(id) on delete set null,
  notes text not null default '',
  source_record_id text,
  origin_kind text not null default 'documented',
  verification_status text not null default 'candidate',
  import_batch text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  rule_text text not null,
  severity text not null,
  applies_to text not null,
  active boolean not null default true,
  import_batch text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_import_batches enable row level security;
alter table public.knowledge_families enable row level security;
alter table public.knowledge_compatibility_edges enable row level security;
alter table public.knowledge_identification_signals enable row level security;
alter table public.knowledge_technical_documents enable row level security;
alter table public.knowledge_rules enable row level security;

create policy "knowledge_import_batches_read" on public.knowledge_import_batches for select using (true);
create policy "knowledge_families_read" on public.knowledge_families for select using (true);
create policy "knowledge_compatibility_edges_read" on public.knowledge_compatibility_edges for select using (true);
create policy "knowledge_identification_signals_read" on public.knowledge_identification_signals for select using (true);
create policy "knowledge_technical_documents_read" on public.knowledge_technical_documents for select using (true);
create policy "knowledge_rules_read" on public.knowledge_rules for select using (true);

create policy "knowledge_import_batches_manage" on public.knowledge_import_batches for all using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));
create policy "knowledge_families_manage" on public.knowledge_families for all using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));
create policy "knowledge_compatibility_edges_manage" on public.knowledge_compatibility_edges for all using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));
create policy "knowledge_identification_signals_manage" on public.knowledge_identification_signals for all using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));
create policy "knowledge_technical_documents_manage" on public.knowledge_technical_documents for all using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));
create policy "knowledge_rules_manage" on public.knowledge_rules for all using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));

create index if not exists knowledge_movements_maker_calibre_idx on public.knowledge_movements (maker, calibre);
create index if not exists knowledge_compatibility_edges_a_idx on public.knowledge_compatibility_edges (movement_a_id);
create index if not exists knowledge_compatibility_edges_b_idx on public.knowledge_compatibility_edges (movement_b_id);
create index if not exists knowledge_identification_signals_movement_idx on public.knowledge_identification_signals (movement_id);
