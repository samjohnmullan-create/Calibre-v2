-- Calibre Library foundation
-- Promotes technical documents from item-only attachments into reusable, evidence-linked library records.

alter table public.knowledge_technical_documents
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists item_id uuid references public.items(id) on delete set null,
  add column if not exists work_id uuid references public.work(id) on delete set null,
  add column if not exists research_request_id uuid references public.research_requests(id) on delete set null,
  add column if not exists publisher text not null default '',
  add column if not exists author text not null default '',
  add column if not exists publication_year integer,
  add column if not exists document_scope text not null default 'technical',
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists storage_bucket text not null default '',
  add column if not exists storage_path text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists file_size_bytes bigint,
  add column if not exists page_count integer,
  add column if not exists searchable_text_status text not null default 'not_processed',
  add column if not exists archived_at timestamptz;

create table if not exists public.knowledge_document_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.knowledge_technical_documents(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  work_id uuid references public.work(id) on delete cascade,
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

create index if not exists knowledge_technical_documents_workspace_idx
  on public.knowledge_technical_documents (workspace_id, created_at desc);
create index if not exists knowledge_technical_documents_movement_idx
  on public.knowledge_technical_documents (movement_id);
create index if not exists knowledge_document_links_document_idx
  on public.knowledge_document_links (document_id);
create index if not exists knowledge_document_links_item_idx
  on public.knowledge_document_links (item_id);
create index if not exists knowledge_document_links_work_idx
  on public.knowledge_document_links (work_id);
create index if not exists knowledge_document_links_movement_idx
  on public.knowledge_document_links (movement_id);

alter table public.knowledge_document_links enable row level security;

create policy "knowledge_document_links_read" on public.knowledge_document_links
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_document_links.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "knowledge_document_links_manage" on public.knowledge_document_links
  for all using (
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
