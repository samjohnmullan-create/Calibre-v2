-- Reconcile the Calibre Library schema with the live workshop database and
-- give PDF extraction a dedicated, reviewable page-level evidence store.

alter table public.knowledge_technical_documents
  add column if not exists publisher text not null default '',
  add column if not exists author text not null default '',
  add column if not exists publication_year integer,
  add column if not exists document_scope text not null default 'technical',
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists page_count integer,
  add column if not exists searchable_text_status text not null default 'not_processed',
  add column if not exists archived_at timestamptz,
  add column if not exists extraction_summary text not null default '',
  add column if not exists extraction_model text not null default '',
  add column if not exists extracted_at timestamptz;

-- Existing imported references pre-date workspace scoping. Calibre currently has
-- one workshop workspace, so attach legacy rows only when that assumption is true.
do $$
declare
  v_workspace_id uuid;
begin
  if (select count(*) from public.workspaces) = 1 then
    select id into v_workspace_id from public.workspaces limit 1;
    update public.knowledge_technical_documents
      set workspace_id = v_workspace_id
      where workspace_id is null;
  end if;
end
$$;

update public.knowledge_technical_documents
set publisher = coalesce(nullif(publisher, ''), publisher_or_issuer, '')
where coalesce(publisher, '') = '';

create table if not exists public.knowledge_document_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.knowledge_technical_documents(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  work_id uuid references public.work_records(id) on delete cascade,
  movement_id uuid references public.knowledge_movements(id) on delete cascade,
  research_request_id uuid references public.research_requests(id) on delete set null,
  link_kind text not null default 'reference',
  relevance_note text not null default '',
  page_from integer,
  page_to integer,
  created_at timestamptz not null default now(),
  constraint knowledge_document_links_target check (
    item_id is not null or work_id is not null or movement_id is not null or research_request_id is not null
  )
);

create unique index if not exists knowledge_document_links_unique_target_idx
  on public.knowledge_document_links (
    workspace_id,
    document_id,
    coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(movement_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(research_request_id, '00000000-0000-0000-0000-000000000000'::uuid),
    link_kind
  );

create table if not exists public.knowledge_document_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.knowledge_technical_documents(id) on delete cascade,
  extraction_run_id uuid not null,
  topic text not null,
  finding text not null,
  page_from integer not null check (page_from >= 1),
  page_to integer not null check (page_to >= page_from),
  confidence text not null check (confidence in ('confirmed','strong','probable','possible','unknown')),
  evidence_note text not null default '',
  source_kind text not null default 'pdf_extraction',
  extraction_model text not null default '',
  review_status text not null default 'candidate' check (review_status in ('candidate','accepted','rejected')),
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_technical_documents_workspace_idx
  on public.knowledge_technical_documents (workspace_id, created_at desc);
create index if not exists knowledge_document_links_document_idx
  on public.knowledge_document_links (document_id);
create index if not exists knowledge_document_links_item_idx
  on public.knowledge_document_links (item_id);
create index if not exists knowledge_document_links_work_idx
  on public.knowledge_document_links (work_id);
create index if not exists knowledge_document_links_movement_idx
  on public.knowledge_document_links (movement_id);
create index if not exists knowledge_document_findings_document_page_idx
  on public.knowledge_document_findings (document_id, page_from, page_to);
create index if not exists knowledge_document_findings_workspace_idx
  on public.knowledge_document_findings (workspace_id, extracted_at desc);
create index if not exists knowledge_document_findings_run_idx
  on public.knowledge_document_findings (extraction_run_id);

alter table public.knowledge_technical_documents enable row level security;
alter table public.knowledge_document_links enable row level security;
alter table public.knowledge_document_findings enable row level security;

drop policy if exists "knowledge_technical_documents_read" on public.knowledge_technical_documents;
drop policy if exists "knowledge_technical_documents_manage" on public.knowledge_technical_documents;
create policy "knowledge_technical_documents_read" on public.knowledge_technical_documents
  for select to authenticated using (
    (workspace_id is not null and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_technical_documents.workspace_id
        and wm.user_id = auth.uid()
    ))
    or (workspace_id is null and owner_id = auth.uid())
  );
create policy "knowledge_technical_documents_manage" on public.knowledge_technical_documents
  for all to authenticated using (
    (workspace_id is not null and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_technical_documents.workspace_id
        and wm.user_id = auth.uid()
    ))
    or (workspace_id is null and owner_id = auth.uid())
  ) with check (
    (workspace_id is not null and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_technical_documents.workspace_id
        and wm.user_id = auth.uid()
    ))
    or (workspace_id is null and owner_id = auth.uid())
  );

drop policy if exists "knowledge_document_links_read" on public.knowledge_document_links;
drop policy if exists "knowledge_document_links_manage" on public.knowledge_document_links;
create policy "knowledge_document_links_read" on public.knowledge_document_links
  for select to authenticated using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_links.workspace_id
        and wm.user_id = auth.uid()
    )
  );
create policy "knowledge_document_links_manage" on public.knowledge_document_links
  for all to authenticated using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_links.workspace_id
        and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_links.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "knowledge_document_findings_read" on public.knowledge_document_findings
  for select to authenticated using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_findings.workspace_id
        and wm.user_id = auth.uid()
    )
  );
create policy "knowledge_document_findings_manage" on public.knowledge_document_findings
  for all to authenticated using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_findings.workspace_id
        and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_findings.workspace_id
        and wm.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.knowledge_technical_documents to authenticated;
grant select, insert, update, delete on public.knowledge_document_links to authenticated;
grant select, insert, update, delete on public.knowledge_document_findings to authenticated;
