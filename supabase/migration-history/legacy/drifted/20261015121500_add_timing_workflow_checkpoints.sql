-- Timing is Work evidence, not a detached calculator result.
-- Checkpoints give each run a deterministic place in the service lifecycle.

alter table public.timing_runs
  add column if not exists checkpoint text not null default 'other';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'timing_runs_checkpoint_check'
      and conrelid = 'public.timing_runs'::regclass
  ) then
    alter table public.timing_runs
      add constraint timing_runs_checkpoint_check
      check (checkpoint = any (array[
        'pre_service'::text,
        'post_reassembly'::text,
        'regulation'::text,
        'final_qc'::text,
        'standalone'::text,
        'other'::text
      ]));
  end if;
end $$;

create index if not exists timing_runs_workspace_work_checkpoint_recorded_idx
  on public.timing_runs(workspace_id, work_id, checkpoint, recorded_at desc)
  where work_id is not null;
