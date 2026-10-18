create or replace function public.get_work_reasoning_freshness(
  p_workspace_id uuid,
  p_work_id uuid
)
returns table(
  latest_run_id uuid,
  reasoning_at timestamptz,
  latest_evidence_at timestamptz,
  is_stale boolean,
  stale_sources text[],
  source_timestamps jsonb
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_item_id uuid;
  v_run_id uuid;
  v_reasoning_at timestamptz;
begin
  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select w.item_id into v_item_id
  from public.work_records w
  where w.workspace_id = p_workspace_id
    and w.id = p_work_id;

  if v_item_id is null then
    raise exception 'Work not found';
  end if;

  select r.id, r.created_at
  into v_run_id, v_reasoning_at
  from public.work_reasoning_runs r
  where r.workspace_id = p_workspace_id
    and r.work_id = p_work_id
    and r.status = 'complete'
  order by r.created_at desc
  limit 1;

  return query
  with evidence as (
    select 'finding'::text as source, max(f.updated_at) as evidence_at
    from public.work_findings f
    where f.workspace_id = p_workspace_id and f.work_id = p_work_id

    union all

    select 'guided_answer', max(c.updated_at)
    from public.work_step_checks c
    where c.workspace_id = p_workspace_id
      and c.work_id = p_work_id
      and (
        c.problem_finding_id is not null
        or c.status = 'problem'
        or (
          c.answer_kind in ('yes_no','choice','text','number')
          and (btrim(c.answer_value) <> '' or c.status = 'not_applicable')
        )
      )

    union all

    select 'timing', max(t.recorded_at)
    from public.timing_runs t
    where t.workspace_id = p_workspace_id and t.work_id = p_work_id

    union all

    select 'measurement', max(m.measured_at)
    from public.measurements m
    where m.workspace_id = p_workspace_id and m.work_id = p_work_id

    union all

    select 'movement_identity', max((basis.entry->>'at')::timestamptz)
    from public.passports p
    cross join lateral jsonb_array_elements(coalesce(p.movement_identification_basis, '[]'::jsonb)) as basis(entry)
    where p.workspace_id = p_workspace_id
      and p.item_id = v_item_id
      and basis.entry ? 'at'
      and nullif(basis.entry->>'at','') is not null

    union all

    select 'research', max(rf.updated_at)
    from public.research_findings rf
    join public.research_requests rr
      on rr.workspace_id = rf.workspace_id
     and rr.id = rf.research_request_id
    where rf.workspace_id = p_workspace_id
      and rr.work_id = p_work_id

    union all

    select 'part_fit', max(pfe.verified_at)
    from public.part_fit_evidence pfe
    where pfe.workspace_id = p_workspace_id and pfe.work_id = p_work_id

    union all

    select 'part_fit', max(pfv.verified_at)
    from public.part_fit_verifications pfv
    where pfv.workspace_id = p_workspace_id and pfv.work_record_id = p_work_id

    union all

    select 'diagnostic_state', max(h.updated_at)
    from public.work_diagnostic_hypotheses h
    where h.workspace_id = p_workspace_id and h.work_id = p_work_id

    union all

    select 'diagnostic_evidence', max(e.created_at)
    from public.work_diagnostic_evidence e
    where e.workspace_id = p_workspace_id and e.work_id = p_work_id

    union all

    select 'job_plan', max(pr.created_at)
    from public.work_plan_revisions pr
    where pr.workspace_id = p_workspace_id and pr.work_id = p_work_id
  ), grouped as (
    select source, max(evidence_at) as evidence_at
    from evidence
    where evidence_at is not null
    group by source
  )
  select
    v_run_id,
    v_reasoning_at,
    max(g.evidence_at),
    coalesce(v_reasoning_at is not null and bool_or(g.evidence_at > v_reasoning_at), false),
    coalesce(
      array_agg(g.source order by g.evidence_at desc) filter (where v_reasoning_at is not null and g.evidence_at > v_reasoning_at),
      array[]::text[]
    ),
    coalesce(jsonb_object_agg(g.source, g.evidence_at order by g.source), '{}'::jsonb)
  from grouped g;
end
$$;

revoke all on function public.get_work_reasoning_freshness(uuid,uuid) from public;
revoke all on function public.get_work_reasoning_freshness(uuid,uuid) from anon;
grant execute on function public.get_work_reasoning_freshness(uuid,uuid) to authenticated;

comment on function public.get_work_reasoning_freshness(uuid,uuid) is
  'Compares the latest completed Calibre Reasoning run with meaningful workshop evidence. Ordinary physical checklist progress is excluded; structured diagnostic answers, findings, timing, measurements, movement identity, research, part-fit evidence, diagnostic state/evidence and job-plan revisions can make reasoning stale.';
