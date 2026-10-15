alter table public.work_step_checks
  add column if not exists source_reasoning_run_id uuid references public.work_reasoning_runs(id) on delete set null,
  add column if not exists outcome_implications jsonb not null default '{}'::jsonb,
  add column if not exists recommendation_why text not null default '',
  add column if not exists origin_kind text not null default 'template';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_step_checks_origin_kind_check'
      and conrelid = 'public.work_step_checks'::regclass
  ) then
    alter table public.work_step_checks
      add constraint work_step_checks_origin_kind_check
      check (origin_kind in ('template','deterministic','ai_reasoning','manual'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_step_checks_outcome_implications_object_check'
      and conrelid = 'public.work_step_checks'::regclass
  ) then
    alter table public.work_step_checks
      add constraint work_step_checks_outcome_implications_object_check
      check (jsonb_typeof(outcome_implications) = 'object');
  end if;
end $$;

create index if not exists work_step_checks_source_reasoning_run_idx
  on public.work_step_checks(source_reasoning_run_id)
  where source_reasoning_run_id is not null;

create unique index if not exists work_step_checks_one_check_per_reasoning_run_idx
  on public.work_step_checks(workspace_id, source_reasoning_run_id)
  where source_reasoning_run_id is not null;

create or replace function public.schedule_reasoning_next_check(
  p_workspace_id uuid,
  p_reasoning_run_id uuid,
  p_checklist_step_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run public.work_reasoning_runs%rowtype;
  v_step public.work_checklist_steps%rowtype;
  v_next jsonb;
  v_outcome jsonb;
  v_options jsonb := '[]'::jsonb;
  v_implications jsonb := '{}'::jsonb;
  v_index integer := 0;
  v_value text;
  v_title text;
  v_instructions text;
  v_why text;
  v_sequence integer;
  v_check_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_run
  from public.work_reasoning_runs
  where workspace_id = p_workspace_id and id = p_reasoning_run_id;
  if not found then raise exception 'Reasoning run not found'; end if;

  select * into v_step
  from public.work_checklist_steps
  where workspace_id = p_workspace_id and id = p_checklist_step_id;
  if not found then raise exception 'Procedure stage not found'; end if;
  if v_step.work_id <> v_run.work_id or v_step.item_id <> v_run.item_id then
    raise exception 'Procedure stage does not belong to this reasoning run Work';
  end if;
  if v_step.status in ('done','na') then
    raise exception 'Choose an open or future procedure stage';
  end if;

  select id into v_check_id
  from public.work_step_checks
  where workspace_id = p_workspace_id
    and source_reasoning_run_id = p_reasoning_run_id
  limit 1;
  if found then return v_check_id; end if;

  v_next := coalesce(v_run.response_payload->'next_check', '{}'::jsonb);
  v_title := btrim(coalesce(v_next->>'title',''));
  v_instructions := btrim(coalesce(v_next->>'instructions',''));
  v_why := btrim(coalesce(v_next->>'why',''));
  if v_title = '' or v_instructions = '' then
    raise exception 'Reasoning run does not contain a usable next check';
  end if;

  for v_outcome in
    select value from jsonb_array_elements(coalesce(v_next->'expected_outcomes','[]'::jsonb))
  loop
    v_index := v_index + 1;
    v_value := 'outcome_' || lpad(v_index::text, 2, '0');
    v_options := v_options || jsonb_build_array(jsonb_build_object(
      'value', v_value,
      'label', coalesce(nullif(btrim(v_outcome->>'result'),''), 'Outcome ' || v_index::text)
    ));
    v_implications := v_implications || jsonb_build_object(
      v_value, coalesce(v_outcome->>'implication','')
    );
  end loop;

  if v_index = 0 then
    raise exception 'Reasoning run has no expected outcomes to record';
  end if;

  v_options := v_options || jsonb_build_array(jsonb_build_object('value','other','label','Something else'));
  v_implications := v_implications || jsonb_build_object('other','Outcome differs from the predicted branches; record the observation and re-analyse.');

  select coalesce(max(sequence),0) + 10 into v_sequence
  from public.work_step_checks
  where workspace_id = p_workspace_id and checklist_step_id = v_step.id;

  insert into public.work_step_checks (
    workspace_id, work_id, item_id, checklist_step_id,
    check_key, label, description, sequence, required,
    check_type, tool_key, knowledge_scope, evidence_required,
    status, answer_kind, answer_options, activation_rule, problem_values,
    answer_value, is_active, state_reason,
    source_reasoning_run_id, outcome_implications, recommendation_why, origin_kind,
    created_by
  ) values (
    p_workspace_id, v_run.work_id, v_run.item_id, v_step.id,
    'ai_reasoning_' || replace(p_reasoning_run_id::text,'-',''),
    v_title, v_instructions, v_sequence, true,
    'decision', 'diagnosis', 'diagnostic_reasoning', true,
    'not_started', 'choice', v_options, '{}'::jsonb, '[]'::jsonb,
    '', true, '',
    p_reasoning_run_id, v_implications, v_why, 'ai_reasoning',
    (select auth.uid())
  ) returning id into v_check_id;

  return v_check_id;
end
$$;

revoke all on function public.schedule_reasoning_next_check(uuid,uuid,uuid) from public;
revoke all on function public.schedule_reasoning_next_check(uuid,uuid,uuid) from anon;
grant execute on function public.schedule_reasoning_next_check(uuid,uuid,uuid) to authenticated;

create or replace function public.set_work_step_check_answer(p_workspace_id uuid, p_check_id uuid, p_answer text, p_note text default ''::text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_check public.work_step_checks%rowtype;
  v_parent public.work_step_checks%rowtype;
  v_step_label text;
  v_problem boolean := false;
  v_finding_id uuid;
  v_evidence_finding_id uuid;
  v_implication text := '';
  v_source_kind text := 'bench';
  v_source_ref text := '';
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_check
  from public.work_step_checks
  where workspace_id = p_workspace_id and id = p_check_id;
  if not found then raise exception 'Step check not found'; end if;
  if not v_check.is_active then raise exception 'This branch is not active'; end if;
  if btrim(coalesce(p_answer,'')) = '' then raise exception 'An answer is required'; end if;

  if jsonb_array_length(v_check.answer_options) > 0 and not exists (
    select 1 from jsonb_array_elements(v_check.answer_options) option
    where option->>'value' = p_answer
  ) then
    raise exception 'Unsupported answer for this check';
  end if;

  v_problem := exists (
    select 1 from jsonb_array_elements_text(v_check.problem_values) problem(value)
    where problem.value = p_answer
  );
  v_implication := coalesce(v_check.outcome_implications->>p_answer,'');

  select label into v_step_label
  from public.work_checklist_steps
  where workspace_id = p_workspace_id and id = v_check.checklist_step_id;

  if v_check.parent_check_id is not null then
    select * into v_parent from public.work_step_checks where id = v_check.parent_check_id;
    v_evidence_finding_id := v_parent.problem_finding_id;
  end if;

  if v_problem then
    if v_check.problem_finding_id is not null then
      update public.work_findings
      set details = concat(v_check.label, ': ', p_answer,
                           case when btrim(coalesce(p_note,'')) <> '' then concat(' — ', btrim(p_note)) else '' end),
          status = case when status = 'resolved' then 'open' else status end,
          updated_at = now()
      where id = v_check.problem_finding_id
      returning id into v_finding_id;
    else
      insert into public.work_findings (
        workspace_id, work_id, item_id, finding_type, severity, title, details, status, created_by
      ) values (
        v_check.workspace_id, v_check.work_id, v_check.item_id, 'fault', 'moderate',
        concat_ws(': ', nullif(v_step_label,''), v_check.label),
        concat(v_check.label, ': ', p_answer,
               case when btrim(coalesce(p_note,'')) <> '' then concat(' — ', btrim(p_note)) else '' end),
        'open', (select auth.uid())
      ) returning id into v_finding_id;
    end if;
    v_evidence_finding_id := v_finding_id;
  else
    v_finding_id := v_check.problem_finding_id;
    v_evidence_finding_id := coalesce(v_check.problem_finding_id, v_evidence_finding_id);
  end if;

  update public.work_step_checks
  set answer_value = p_answer,
      result_text = case when btrim(coalesce(p_note,'')) <> '' then btrim(p_note) else result_text end,
      status = 'complete',
      problem_finding_id = coalesce(v_finding_id, problem_finding_id),
      started_at = coalesce(started_at, now()),
      completed_at = now(),
      completed_by = (select auth.uid()),
      updated_at = now()
  where id = v_check.id;

  if v_check.origin_kind = 'ai_reasoning' then
    v_source_kind := 'ai_reasoning';
    v_source_ref := case when v_check.source_reasoning_run_id is not null
      then 'Reasoning run: ' || v_check.source_reasoning_run_id::text
      else 'Calibre Reasoning' end;
  else
    v_source_ref := 'Procedure step: ' || coalesce(v_step_label,'Unknown');
  end if;

  insert into public.work_diagnostic_evidence (
    workspace_id, work_id, item_id, finding_id, work_step_check_id,
    effect, strength, summary, source_kind, source_ref, created_by
  ) values (
    v_check.workspace_id, v_check.work_id, v_check.item_id, v_evidence_finding_id, v_check.id,
    'neutral', 'unknown',
    concat(v_check.label, ': ', p_answer,
           case when v_implication <> '' then concat(' — implication: ', v_implication) else '' end,
           case when btrim(coalesce(p_note,'')) <> '' then concat(' — observation: ', btrim(p_note)) else '' end),
    v_source_kind, v_source_ref, (select auth.uid())
  );

  perform public.recompute_work_step_check_branches(p_workspace_id, v_check.checklist_step_id);
  return v_finding_id;
end
$$;

revoke all on function public.set_work_step_check_answer(uuid,uuid,text,text) from public;
revoke all on function public.set_work_step_check_answer(uuid,uuid,text,text) from anon;
grant execute on function public.set_work_step_check_answer(uuid,uuid,text,text) to authenticated;