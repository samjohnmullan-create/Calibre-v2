create or replace function public.workbench_status_counts(p_workspace_id uuid)
returns table (
  active bigint,
  ready bigint,
  on_bench bigint,
  waiting bigint,
  qc bigint,
  queued bigint,
  complete bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where j.status not in ('complete', 'cancelled'))::bigint as active,
    count(*) filter (where j.status = 'ready')::bigint as ready,
    count(*) filter (where j.status = 'on_bench')::bigint as on_bench,
    count(*) filter (where j.status = 'waiting')::bigint as waiting,
    count(*) filter (where j.status = 'qc')::bigint as qc,
    count(*) filter (where j.status = 'queued')::bigint as queued,
    count(*) filter (where j.status = 'complete')::bigint as complete
  from public.workbench_jobs j
  where j.workspace_id = p_workspace_id;
$$;

revoke execute on function public.workbench_status_counts(uuid) from public;
revoke execute on function public.workbench_status_counts(uuid) from anon;
grant execute on function public.workbench_status_counts(uuid) to authenticated;

comment on function public.workbench_status_counts(uuid) is 'Returns all Workbench status counts in one RLS-aware aggregate request.';
