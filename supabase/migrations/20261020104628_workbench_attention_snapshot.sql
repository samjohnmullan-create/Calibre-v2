create or replace function public.workbench_attention_snapshot(p_workspace_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with active_work as materialized (
    select
      j.id,
      j.item_id,
      j.work_number,
      j.item_number,
      j.item_title,
      j.status,
      j.waiting_reason,
      j.priority,
      j.next_action,
      j.blocker
    from public.workbench_jobs j
    where j.workspace_id = p_workspace_id
      and j.status in ('queued', 'ready', 'on_bench', 'waiting', 'qc')
    order by j.priority desc, j.work_number desc
  ),
  needs as (
    select n.id, n.work_record_id, n.part_type, n.description, n.status
    from public.work_part_needs n
    where n.workspace_id = p_workspace_id
      and n.status in ('open', 'reserved')
      and n.work_record_id in (select id from active_work)
  ),
  failed_qc as (
    select q.id, q.work_id, q.label, q.check_key, q.status
    from public.work_qc_checks q
    where q.workspace_id = p_workspace_id
      and q.status = 'failed'
      and q.work_id in (select id from active_work)
  )
  select jsonb_build_object(
    'work', coalesce((select jsonb_agg(to_jsonb(w)) from active_work w), '[]'::jsonb),
    'needs', coalesce((select jsonb_agg(to_jsonb(n)) from needs n), '[]'::jsonb),
    'failedQc', coalesce((select jsonb_agg(to_jsonb(q)) from failed_qc q), '[]'::jsonb),
    'evidenceCount', (
      select count(*)
      from public.knowledge_document_findings f
      where f.workspace_id = p_workspace_id
        and f.review_status = 'candidate'
    )
  );
$$;

revoke execute on function public.workbench_attention_snapshot(uuid) from public;
revoke execute on function public.workbench_attention_snapshot(uuid) from anon;
grant execute on function public.workbench_attention_snapshot(uuid) to authenticated;

comment on function public.workbench_attention_snapshot(uuid) is 'Returns the Workbench attention work, open/reserved part needs, failed QC checks and candidate evidence count in one RLS-aware request.';
