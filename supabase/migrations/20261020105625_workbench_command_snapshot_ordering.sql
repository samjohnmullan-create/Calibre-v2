create or replace function public.workbench_command_snapshot(p_workspace_id uuid, p_limit integer default 40)
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
      j.type,
      j.title,
      j.status,
      j.waiting_reason,
      j.priority,
      j.next_action,
      j.blocker,
      j.diagnosis,
      j.opened_at,
      j.completed_at,
      j.item_number,
      j.item_title,
      j.item_type
    from public.workbench_jobs j
    where j.workspace_id = p_workspace_id
      and j.status in ('on_bench', 'ready', 'waiting', 'qc', 'queued')
    order by j.priority desc, j.work_number desc
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ),
  checklist as (
    select
      s.work_id,
      count(*)::integer as total,
      count(*) filter (where s.status in ('done', 'na'))::integer as completed,
      count(*) filter (where s.required and s.status not in ('done', 'na'))::integer as required_open,
      count(*) filter (where s.status = 'blocked')::integer as blocked
    from public.work_checklist_steps s
    join active_work w on w.id = s.work_id
    where s.workspace_id = p_workspace_id
    group by s.work_id
  )
  select jsonb_build_object(
    'work', coalesce((select jsonb_agg(to_jsonb(w) order by w.priority desc, w.work_number desc) from active_work w), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_object_agg(
        c.work_id::text,
        jsonb_build_object(
          'total', c.total,
          'completed', c.completed,
          'requiredOpen', c.required_open,
          'blocked', c.blocked,
          'percent', case when c.total > 0 then round((c.completed::numeric / c.total::numeric) * 100)::integer else 0 end
        )
      )
      from checklist c
    ), '{}'::jsonb)
  );
$$;
