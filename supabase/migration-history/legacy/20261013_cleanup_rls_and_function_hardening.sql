alter function public.knowledge_origin_for_record(text, jsonb) set search_path = public;
alter function public.begin_knowledge_import(text, text, text, text, text, jsonb) set search_path = public;
alter function public.import_knowledge_chunk(text, text, jsonb) set search_path = public;
alter function public.finalize_knowledge_import(text) set search_path = public;

drop policy if exists acquisition_invoices_manage on public.acquisition_invoices;
drop policy if exists acquisition_invoices_select on public.acquisition_invoices;
create policy acquisition_invoices_select on public.acquisition_invoices
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoices.workspace_id
    and m.user_id = (select auth.uid())
));
create policy acquisition_invoices_insert on public.acquisition_invoices
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoices.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));
create policy acquisition_invoices_update on public.acquisition_invoices
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoices.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoices.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));
create policy acquisition_invoices_delete on public.acquisition_invoices
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoices.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));

drop policy if exists acquisition_invoice_lines_manage on public.acquisition_invoice_lines;
drop policy if exists acquisition_invoice_lines_select on public.acquisition_invoice_lines;
create policy acquisition_invoice_lines_select on public.acquisition_invoice_lines
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoice_lines.workspace_id
    and m.user_id = (select auth.uid())
));
create policy acquisition_invoice_lines_insert on public.acquisition_invoice_lines
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoice_lines.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));
create policy acquisition_invoice_lines_update on public.acquisition_invoice_lines
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoice_lines.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoice_lines.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));
create policy acquisition_invoice_lines_delete on public.acquisition_invoice_lines
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = acquisition_invoice_lines.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));

drop policy if exists work_part_needs_manage on public.work_part_needs;
drop policy if exists work_part_needs_read on public.work_part_needs;
create policy work_part_needs_select on public.work_part_needs
for select to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = work_part_needs.workspace_id
    and wm.user_id = (select auth.uid())
));
create policy work_part_needs_insert on public.work_part_needs
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = work_part_needs.workspace_id
    and wm.user_id = (select auth.uid())
    and wm.role in ('owner','editor')
));
create policy work_part_needs_update on public.work_part_needs
for update to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = work_part_needs.workspace_id
    and wm.user_id = (select auth.uid())
    and wm.role in ('owner','editor')
))
with check (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = work_part_needs.workspace_id
    and wm.user_id = (select auth.uid())
    and wm.role in ('owner','editor')
));
create policy work_part_needs_delete on public.work_part_needs
for delete to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = work_part_needs.workspace_id
    and wm.user_id = (select auth.uid())
    and wm.role in ('owner','editor')
));

drop policy if exists workspace_members_insert_owner_self on public.workspace_members;
create policy workspace_members_insert_owner_self on public.workspace_members
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and public.is_workspace_owner(workspace_id)
);

create index if not exists acquisition_invoice_lines_workspace_idx on public.acquisition_invoice_lines(workspace_id);
create index if not exists acquisition_invoice_lines_created_item_idx on public.acquisition_invoice_lines(created_item_id) where created_item_id is not null;
create index if not exists part_allocations_work_record_idx on public.part_allocations(work_record_id);
create index if not exists part_allocations_item_idx on public.part_allocations(item_id);
create index if not exists part_fit_verifications_work_record_idx on public.part_fit_verifications(work_record_id) where work_record_id is not null;
create index if not exists part_fit_verifications_workspace_idx on public.part_fit_verifications(workspace_id);
