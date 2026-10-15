create index work_step_checks_workspace_work_idx on public.work_step_checks(workspace_id, work_id);
create index work_step_checks_workspace_item_idx on public.work_step_checks(workspace_id, item_id);
create index work_step_checks_template_check_idx on public.work_step_checks(template_step_check_id) where template_step_check_id is not null;
create index work_step_checks_created_by_idx on public.work_step_checks(created_by) where created_by is not null;
create index work_step_checks_completed_by_idx on public.work_step_checks(completed_by) where completed_by is not null;
