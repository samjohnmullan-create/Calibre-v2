create index if not exists work_induction_checks_workspace_work_idx on public.work_induction_checks(workspace_id, work_id);
create index if not exists work_induction_checks_created_by_idx on public.work_induction_checks(created_by);
create index if not exists work_findings_workspace_work_idx on public.work_findings(workspace_id, work_id);
create index if not exists work_findings_workspace_item_idx on public.work_findings(workspace_id, item_id);
create index if not exists work_findings_created_by_idx on public.work_findings(created_by);
create index if not exists work_plan_actions_workspace_work_idx on public.work_plan_actions(workspace_id, work_id);
create index if not exists work_plan_actions_workspace_item_idx on public.work_plan_actions(workspace_id, item_id);
create index if not exists work_plan_actions_procedure_template_idx on public.work_plan_actions(procedure_template_id);
create index if not exists work_plan_actions_created_by_idx on public.work_plan_actions(created_by);
