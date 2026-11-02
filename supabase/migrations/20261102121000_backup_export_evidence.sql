-- Section 0.2.2b Foundation Health Baseline
--
-- Record that Calibre successfully generated an owner-controlled export.
-- These rows are operational evidence only: they do not prove the downloaded
-- file was retained off-site or that it can be restored successfully.

create table public.backup_export_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  export_kind text not null check (export_kind in ('structured', 'storage')),
  export_version text not null,
  generated_at timestamptz not null default now(),
  generated_by uuid not null default auth.uid(),
  structured_table_count integer check (structured_table_count is null or structured_table_count >= 0),
  row_count bigint check (row_count is null or row_count >= 0),
  file_count integer check (file_count is null or file_count >= 0),
  source_bytes bigint check (source_bytes is null or source_bytes >= 0),
  artifact_bytes bigint check (artifact_bytes is null or artifact_bytes >= 0),
  content_checksum text,
  details jsonb not null default '{}'::jsonb
);

create index backup_export_events_workspace_generated_idx
  on public.backup_export_events (workspace_id, generated_at desc, id desc);

alter table public.backup_export_events enable row level security;

create policy backup_export_events_select
on public.backup_export_events
for select to authenticated
using (
  exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = backup_export_events.workspace_id
      and m.user_id = (select auth.uid())
  )
);

create policy backup_export_events_insert
on public.backup_export_events
for insert to authenticated
with check (
  generated_by = (select auth.uid())
  and exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = backup_export_events.workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  )
);

revoke all on public.backup_export_events from anon;
revoke all on public.backup_export_events from authenticated;
grant select, insert on public.backup_export_events to authenticated;

comment on table public.backup_export_events is
  'Append-only evidence that Calibre generated an export. Does not prove off-site retention or restore success.';
