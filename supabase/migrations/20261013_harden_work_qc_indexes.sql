create index if not exists work_qc_checks_workspace_item_idx on public.work_qc_checks(workspace_id,item_id);
create index if not exists work_qc_checks_checked_by_idx on public.work_qc_checks(checked_by) where checked_by is not null;
drop index if exists public.work_events_workspace_work_created_idx;
