create or replace function public.get_work_diagnostic_graph(
  p_workspace_id uuid,
  p_work_id uuid
)
returns table (
  hypothesis_key text,
  title text,
  description text,
  category text,
  support_state text,
  score integer,
  evidence_count integer,
  supports_count integer,
  against_count integer,
  contradiction boolean,
  evidence_for jsonb,
  evidence_against jsonb
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with authorised as (
    select 1 as ok
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
    limit 1
  ),
  matched as (
    select
      h.hypothesis_key,
      h.title,
      h.description,
      h.category,
      h.sequence,
      s.step_key,
      s.label as stage_label,
      c.id as work_step_check_id,
      c.check_key,
      c.label as check_label,
      c.answer_value,
      c.result_text,
      r.effect,
      r.strength,
      r.rationale,
      case r.strength when 'strong' then 3 when 'moderate' then 2 else 1 end as weight
    from authorised a
    join public.work_checklist_steps s
      on s.workspace_id = p_workspace_id and s.work_id = p_work_id
    join public.work_step_checks c
      on c.workspace_id = s.workspace_id and c.checklist_step_id = s.id
    join public.calibre_diagnostic_effect_rules r
      on r.active
     and r.step_key = s.step_key
     and r.check_key = c.check_key
     and r.answer_value = c.answer_value
    join public.calibre_diagnostic_hypotheses h
      on h.active and h.hypothesis_key = r.hypothesis_key
    where c.status = 'complete'
      and c.is_active
      and btrim(c.answer_value) <> ''
  ),
  aggregated as (
    select
      m.hypothesis_key,
      max(m.title) as title,
      max(m.description) as description,
      max(m.category) as category,
      min(m.sequence) as sequence,
      sum(case
        when m.effect in ('supports','confirms') then m.weight
        when m.effect in ('weakens','rules_out') then -m.weight
        else 0 end)::integer as score,
      count(*)::integer as evidence_count,
      count(*) filter (where m.effect in ('supports','confirms'))::integer as supports_count,
      count(*) filter (where m.effect in ('weakens','rules_out'))::integer as against_count,
      bool_or(m.effect = 'confirms') as has_confirm,
      bool_or(m.effect = 'rules_out') as has_rule_out,
      jsonb_agg(jsonb_build_object(
        'stage', m.stage_label,
        'step_key', m.step_key,
        'check', m.check_label,
        'check_key', m.check_key,
        'answer', m.answer_value,
        'effect', m.effect,
        'strength', m.strength,
        'rationale', m.rationale,
        'note', coalesce(m.result_text,''),
        'work_step_check_id', m.work_step_check_id
      ) order by m.stage_label, m.check_label)
        filter (where m.effect in ('supports','confirms')) as evidence_for,
      jsonb_agg(jsonb_build_object(
        'stage', m.stage_label,
        'step_key', m.step_key,
        'check', m.check_label,
        'check_key', m.check_key,
        'answer', m.answer_value,
        'effect', m.effect,
        'strength', m.strength,
        'rationale', m.rationale,
        'note', coalesce(m.result_text,''),
        'work_step_check_id', m.work_step_check_id
      ) order by m.stage_label, m.check_label)
        filter (where m.effect in ('weakens','rules_out')) as evidence_against
    from matched m
    group by m.hypothesis_key
  ),
  resolved as (
    select a.*,
      case
        when a.has_confirm then 'confirmed'
        when a.has_rule_out and a.supports_count = 0 then 'ruled_out'
        when a.score >= 5 then 'strongly_supported'
        when a.score >= 2 then 'supported'
        when a.score <= -3 then 'weak'
        else 'possible'
      end as resolved_state
    from aggregated a
  )
  select
    r.hypothesis_key,
    r.title,
    r.description,
    r.category,
    r.resolved_state as support_state,
    r.score,
    r.evidence_count,
    r.supports_count,
    r.against_count,
    (r.supports_count > 0 and r.against_count > 0) as contradiction,
    coalesce(r.evidence_for, '[]'::jsonb),
    coalesce(r.evidence_against, '[]'::jsonb)
  from resolved r
  order by
    case r.resolved_state
      when 'confirmed' then 0
      when 'strongly_supported' then 1
      when 'supported' then 2
      when 'possible' then 3
      when 'weak' then 4
      when 'ruled_out' then 5
      else 6
    end,
    r.score desc,
    r.sequence,
    r.title;
$$;

revoke all on function public.get_work_diagnostic_graph(uuid, uuid) from public, anon;
grant execute on function public.get_work_diagnostic_graph(uuid, uuid) to authenticated;
