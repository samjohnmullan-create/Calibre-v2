-- Tighten Calibre Library RLS and add the indexes used by research and bench lookups.

create index if not exists knowledge_document_links_research_request_idx
  on public.knowledge_document_links (research_request_id);
create index if not exists knowledge_technical_documents_item_idx
  on public.knowledge_technical_documents (item_id);
create index if not exists knowledge_technical_documents_work_idx
  on public.knowledge_technical_documents (work_id);
create index if not exists knowledge_technical_documents_research_request_idx
  on public.knowledge_technical_documents (research_request_id);

drop policy if exists "knowledge_technical_documents_read" on public.knowledge_technical_documents;
drop policy if exists "knowledge_technical_documents_manage" on public.knowledge_technical_documents;
drop policy if exists "knowledge_technical_documents_insert" on public.knowledge_technical_documents;
drop policy if exists "knowledge_technical_documents_update" on public.knowledge_technical_documents;
drop policy if exists "knowledge_technical_documents_delete" on public.knowledge_technical_documents;
create policy "knowledge_technical_documents_read" on public.knowledge_technical_documents for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_technical_documents.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_technical_documents_insert" on public.knowledge_technical_documents for insert to authenticated with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_technical_documents.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_technical_documents_update" on public.knowledge_technical_documents for update to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_technical_documents.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_technical_documents.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_technical_documents_delete" on public.knowledge_technical_documents for delete to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_technical_documents.workspace_id and wm.user_id = (select auth.uid())));

drop policy if exists "knowledge_document_links_read" on public.knowledge_document_links;
drop policy if exists "knowledge_document_links_manage" on public.knowledge_document_links;
drop policy if exists "knowledge_document_links_insert" on public.knowledge_document_links;
drop policy if exists "knowledge_document_links_update" on public.knowledge_document_links;
drop policy if exists "knowledge_document_links_delete" on public.knowledge_document_links;
create policy "knowledge_document_links_read" on public.knowledge_document_links for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_links.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_document_links_insert" on public.knowledge_document_links for insert to authenticated with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_links.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_document_links_update" on public.knowledge_document_links for update to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_links.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_links.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_document_links_delete" on public.knowledge_document_links for delete to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_links.workspace_id and wm.user_id = (select auth.uid())));

drop policy if exists "knowledge_document_findings_read" on public.knowledge_document_findings;
drop policy if exists "knowledge_document_findings_manage" on public.knowledge_document_findings;
drop policy if exists "knowledge_document_findings_insert" on public.knowledge_document_findings;
drop policy if exists "knowledge_document_findings_update" on public.knowledge_document_findings;
drop policy if exists "knowledge_document_findings_delete" on public.knowledge_document_findings;
create policy "knowledge_document_findings_read" on public.knowledge_document_findings for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_findings.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_document_findings_insert" on public.knowledge_document_findings for insert to authenticated with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_findings.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_document_findings_update" on public.knowledge_document_findings for update to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_findings.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_findings.workspace_id and wm.user_id = (select auth.uid())));
create policy "knowledge_document_findings_delete" on public.knowledge_document_findings for delete to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = knowledge_document_findings.workspace_id and wm.user_id = (select auth.uid())));
