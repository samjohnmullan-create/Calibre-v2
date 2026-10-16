alter table public.knowledge_technical_documents
  add column if not exists storage_bucket text not null default '',
  add column if not exists storage_path text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists file_size_bytes bigint;

create unique index if not exists knowledge_technical_documents_storage_path_uidx
  on public.knowledge_technical_documents(storage_bucket, storage_path)
  where storage_path <> '';

create index if not exists knowledge_technical_documents_movement_created_idx
  on public.knowledge_technical_documents(movement_id, created_at desc);
