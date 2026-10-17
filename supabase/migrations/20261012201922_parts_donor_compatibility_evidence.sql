alter table public.parts
  add column if not exists knowledge_part_ref_id uuid references public.knowledge_part_refs(id) on delete set null,
  add column if not exists provenance_type text not null default 'unknown',
  add column if not exists provenance_note text not null default '',
  add column if not exists replacement_cost numeric,
  add constraint parts_provenance_type_check check (provenance_type in ('purchased','salvaged','donor','new_old_stock','unknown')),
  add constraint parts_replacement_cost_check check (replacement_cost is null or replacement_cost >= 0);

alter table public.part_applications
  add column if not exists knowledge_movement_id uuid references public.knowledge_movements(id) on delete set null,
  add column if not exists confidence numeric,
  add column if not exists verification_status text not null default 'candidate',
  add constraint part_applications_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add constraint part_applications_verification_status_check check (verification_status in ('candidate','reviewed','confirmed','rejected'));

create table if not exists public.part_fit_verifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  knowledge_movement_id uuid references public.knowledge_movements(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  work_record_id uuid references public.work_records(id) on delete set null,
  result text not null check (result in ('confirmed','rejected','conditional')),
  modification_required boolean not null default false,
  evidence_note text not null default '',
  measured_values jsonb not null default '{}'::jsonb,
  verified_by uuid default auth.uid(),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists parts_knowledge_part_ref_idx on public.parts(knowledge_part_ref_id);
create index if not exists parts_donor_item_idx on public.parts(donor_item_id);
create index if not exists part_applications_knowledge_movement_idx on public.part_applications(knowledge_movement_id);
create index if not exists part_fit_verifications_part_idx on public.part_fit_verifications(part_id);
create index if not exists part_fit_verifications_movement_idx on public.part_fit_verifications(knowledge_movement_id);
create index if not exists part_fit_verifications_item_idx on public.part_fit_verifications(item_id);

alter table public.part_fit_verifications enable row level security;

create policy part_fit_verifications_select on public.part_fit_verifications
for select using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_fit_verifications.workspace_id
      and m.user_id = (select auth.uid())
  )
);

create policy part_fit_verifications_insert on public.part_fit_verifications
for insert with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_fit_verifications.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
);

create policy part_fit_verifications_update on public.part_fit_verifications
for update using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_fit_verifications.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
) with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_fit_verifications.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
);

create policy part_fit_verifications_delete on public.part_fit_verifications
for delete using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = part_fit_verifications.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text,'editor'::text])
  )
);

grant select, insert, update, delete on public.part_fit_verifications to authenticated;
