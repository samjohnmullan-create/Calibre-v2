create index if not exists work_part_needs_workspace_work_idx on public.work_part_needs(workspace_id, work_record_id);
create index if not exists work_part_needs_workspace_item_idx on public.work_part_needs(workspace_id, item_id);
create index if not exists part_allocations_workspace_work_idx on public.part_allocations(workspace_id, work_record_id);
create index if not exists part_allocations_workspace_item_idx on public.part_allocations(workspace_id, item_id);
create index if not exists part_allocations_part_idx on public.part_allocations(part_id);
create index if not exists measurements_workspace_work_idx on public.measurements(workspace_id, work_id);
create index if not exists timing_runs_workspace_work_idx on public.timing_runs(workspace_id, work_id);
create index if not exists work_events_workspace_work_created_idx on public.work_events(workspace_id, work_id, created_at desc);
