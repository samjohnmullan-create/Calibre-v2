create table if not exists public.knowledge_verifications (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid references public.knowledge_movements(id) on delete cascade,
  part_ref_id uuid references public.knowledge_part_refs(id) on delete cascade,
  compatibility_edge_id uuid references public.knowledge_compatibility_edges(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  work_record_id uuid references public.work_records(id) on delete set null,
  verification_type text not null,
  result text not null,
  evidence_note text not null default '',
  measured_values jsonb not null default '{}'::jsonb,
  verified_by uuid default auth.uid(),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (result in ('confirmed','rejected','conditional')),
  check (verification_type in ('fit','dimension','identity','timing','part_reference','donor','other'))
);

alter table public.knowledge_verifications enable row level security;

create policy "knowledge_verifications_read" on public.knowledge_verifications for select using (true);
create policy "knowledge_verifications_manage" on public.knowledge_verifications for all
  using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));

create index if not exists knowledge_verifications_movement_idx on public.knowledge_verifications (movement_id);
create index if not exists knowledge_verifications_part_idx on public.knowledge_verifications (part_ref_id);
create index if not exists knowledge_verifications_edge_idx on public.knowledge_verifications (compatibility_edge_id);
