-- Existing composite indexes lead with workspace_id, so add direct covering indexes
-- for the document item/work foreign keys used by PostgreSQL referential checks.

create index if not exists knowledge_technical_documents_item_fk_idx
  on public.knowledge_technical_documents (item_id);

create index if not exists knowledge_technical_documents_work_fk_idx
  on public.knowledge_technical_documents (work_id);
