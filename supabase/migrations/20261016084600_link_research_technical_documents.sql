alter table public.knowledge_technical_documents
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists item_id uuid references public.items(id) on delete cascade,
  add column if not exists work_id uuid references public.work_records(id) on delete set null,
  add column if not exists research_request_id uuid references public.research_requests(id) on delete set null;

create index if not exists knowledge_technical_documents_item_idx
  on public.knowledge_technical_documents(workspace_id, item_id, created_at desc);
create index if not exists knowledge_technical_documents_work_idx
  on public.knowledge_technical_documents(workspace_id, work_id, created_at desc)
  where work_id is not null;
