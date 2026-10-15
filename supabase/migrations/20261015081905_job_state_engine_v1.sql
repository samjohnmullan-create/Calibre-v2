-- Calibre Job State Engine v1
-- Adds branching procedure checks, diagnostic evidence, plan revision history,
-- a deterministic Next Best Action RPC, and timing-to-step evidence links.

alter table public.work_template_step_checks
  add column answer_kind text not null default 'status'
    check (answer_kind = any(array['status','yes_no','choice','text','number','tool_result']::text[])),
  add column answer_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(answer_options) = 'array'),
  add column activation_rule jsonb not null default '{}'::jsonb
    check (jsonb_typeof(activation_rule) = 'object'),
  add column problem_values jsonb not null default '[]'::jsonb
    check (jsonb_typeof(problem_values) = 'array');

alter table public.work_step_checks
  add column answer_kind text not null default 'status'
    check (answer_kind = any(array['status','yes_no','choice','text','number','tool_result']::text[])),
  add column answer_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(answer_options) = 'array'),
  add column activation_rule jsonb not null default '{}'::jsonb
    check (jsonb_typeof(activation_rule) = 'object'),
  add column problem_values jsonb not null default '[]'::jsonb
    check (jsonb_typeof(problem_values) = 'array'),
  add column answer_value text not null default '',
  add column is_active boolean not null default true,
  add column parent_check_id uuid references public.work_step_checks(id) on delete set null,
  add column state_reason text not null default '';

create index work_step_checks_parent_check_idx on public.work_step_checks(parent_check_id) where parent_check_id is not null;
create index work_step_checks_active_step_idx on public.work_step_checks(workspace_id, checklist_step_id, is_active, sequence);

alter table public.timing_runs
  add column work_step_check_id uuid references public.work_step_checks(id) on delete set null;
create index timing_runs_work_step_check_idx on public.timing_runs(work_step_check_id) where work_step_check_id is not null;

create table public.work_diagnostic_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  finding_id uuid references public.work_findings(id) on delete set null,
  hypothesis_id uuid references public.work_diagnostic_hypotheses(id) on delete cascade,
  diagnostic_check_id uuid references public.work_diagnostic_checks(id) on delete set null,
  work_step_check_id uuid references public.work_step_checks(id) on delete set null,
  timing_run_id uuid references public.timing_runs(id) on delete set null,
  effect text not null default 'neutral'
    check (effect = any(array['supports','weakens','rules_out','confirms','neutral']::text[])),
  strength text not null default 'unknown'
    check (strength = any(array['strong','moderate','weak','unknown']::text[])),
  summary text not null check (btrim(summary) <> ''),
  source_kind text not null default 'bench'
    check (source_kind = any(array['bench','timing','knowledge','research','manual','workshop_history','ai_proposal']::text[])),
  source_ref text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint work_diagnostic_evidence_work_fkey foreign key (workspace_id, work_id)
    references public.work_records(workspace_id, id) on delete cascade,
  constraint work_diagnostic_evidence_item_fkey foreign key (workspace_id, item_id)
    references public.items(workspace_id, id) on delete cascade
);

create index work_diagnostic_evidence_work_idx on public.work_diagnostic_evidence(workspace_id, work_id, created_at desc);
create index work_diagnostic_evidence_finding_idx on public.work_diagnostic_evidence(finding_id) where finding_id is not null;
create index work_diagnostic_evidence_hypothesis_idx on public.work_diagnostic_evidence(hypothesis_id) where hypothesis_id is not null;
create index work_diagnostic_evidence_step_check_idx on public.work_diagnostic_evidence(work_step_check_id) where work_step_check_id is not null;
create index work_diagnostic_evidence_diag_check_idx on public.work_diagnostic_evidence(diagnostic_check_id) where diagnostic_check_id is not null;
create index work_diagnostic_evidence_timing_idx on public.work_diagnostic_evidence(timing_run_id) where timing_run_id is not null;
create index work_diagnostic_evidence_created_by_idx on public.work_diagnostic_evidence(created_by) where created_by is not null;

alter table public.work_diagnostic_evidence enable row level security;
revoke all on public.work_diagnostic_evidence from anon, authenticated;
grant select, insert, update, delete on public.work_diagnostic_evidence to authenticated;

create policy work_diagnostic_evidence_select on public.work_diagnostic_evidence
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_diagnostic_evidence.workspace_id
    and m.user_id = (select auth.uid())
));

create policy work_diagnostic_evidence_insert on public.work_diagnostic_evidence
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_diagnostic_evidence.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_diagnostic_evidence_update on public.work_diagnostic_evidence
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_diagnostic_evidence.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_diagnostic_evidence.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_diagnostic_evidence_delete on public.work_diagnostic_evidence
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_diagnostic_evidence.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

alter table public.work_diagnostic_hypotheses
  add column support_state text not null default 'possible'
    check (support_state = any(array['strongly_supported','supported','possible','weak','ruled_out','confirmed']::text[]));

create table public.work_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  revision integer not null check (revision > 0),
  reason text not null default '',
  trigger_finding_id uuid references public.work_findings(id) on delete set null,
  plan_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(plan_snapshot) = 'array'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint work_plan_revisions_work_fkey foreign key (workspace_id, work_id)
    references public.work_records(workspace_id, id) on delete cascade,
  constraint work_plan_revisions_item_fkey foreign key (workspace_id, item_id)
    references public.items(workspace_id, id) on delete cascade,
  unique (work_id, revision)
);

create index work_plan_revisions_work_idx on public.work_plan_revisions(workspace_id, work_id, revision desc);
create index work_plan_revisions_trigger_finding_idx on public.work_plan_revisions(trigger_finding_id) where trigger_finding_id is not null;
create index work_plan_revisions_created_by_idx on public.work_plan_revisions(created_by) where created_by is not null;

alter table public.work_plan_revisions enable row level security;
revoke all on public.work_plan_revisions from anon, authenticated;
grant select, insert on public.work_plan_revisions to authenticated;

create policy work_plan_revisions_select on public.work_plan_revisions
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_plan_revisions.workspace_id
    and m.user_id = (select auth.uid())
));

create policy work_plan_revisions_insert on public.work_plan_revisions
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_plan_revisions.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create or replace function public.record_work_plan_revision(
  p_workspace_id uuid,
  p_work_id uuid,
  p_reason text default '',
  p_trigger_finding_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_work public.work_records%rowtype;
  v_revision integer;
  v_snapshot jsonb;
  v_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work
  from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id;
  if not found then raise exception 'Work record not found'; end if;

  select coalesce(max(revision), 0) + 1 into v_revision
  from public.work_plan_revisions
  where workspace_id = p_workspace_id and work_id = p_work_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'action_key', a.action_key,
    'label', a.label,
    'sequence', a.sequence,
    'procedure_template_id', a.procedure_template_id,
    'status', a.status,
    'notes', a.notes
  ) order by a.sequence), '[]'::jsonb)
  into v_snapshot
  from public.work_plan_actions a
  where a.workspace_id = p_workspace_id and a.work_id = p_work_id;

  insert into public.work_plan_revisions (
    workspace_id, work_id, item_id, revision, reason, trigger_finding_id, plan_snapshot, created_by
  ) values (
    p_workspace_id, p_work_id, v_work.item_id, v_revision, coalesce(p_reason,''), p_trigger_finding_id, v_snapshot, (select auth.uid())
  ) returning id into v_id;

  return v_id;
end
$$;

-- Typed answer metadata for high-value branching checks.
with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'choice',
    answer_options = '[{"value":"normal","label":"Normal"},{"value":"rough","label":"Rough / gritty"},{"value":"slipping","label":"Slipping"},{"value":"blocked","label":"Blocked"},{"value":"no_torque","label":"No useful torque"},{"value":"other","label":"Other abnormal"}]'::jsonb,
    problem_values = '["rough","slipping","blocked","no_torque","other"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'intake' and t.check_key = 'winding_test';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'choice',
    answer_options = '[{"value":"normal","label":"Normal"},{"value":"stiff","label":"Stiff"},{"value":"slips","label":"Slips"},{"value":"blocked","label":"Blocked"},{"value":"other","label":"Other abnormal"}]'::jsonb,
    problem_values = '["stiff","slips","blocked","other"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'intake' and t.check_key = 'setting_test';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'yes_no',
    answer_options = '[{"value":"yes","label":"Yes"},{"value":"no","label":"No"}]'::jsonb
from target t
where c.id = t.id and t.step_key = 'pre_service_timing' and t.check_key = 'running_sufficiently';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set activation_rule = '{"parent_key":"running_sufficiently","values":["yes"]}'::jsonb
from target t
where c.id = t.id and t.step_key = 'pre_service_timing' and t.check_key in ('timing_specs','baseline_run','baseline_observation');

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'choice',
    answer_options = '[{"value":"clear","label":"Clear"},{"value":"detected","label":"Magnetism detected"},{"value":"uncertain","label":"Uncertain"}]'::jsonb,
    problem_values = '["detected"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'demagnetise_check' and t.check_key = 'magnetism_check';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set activation_rule = '{"parent_key":"magnetism_check","values":["detected"]}'::jsonb
from target t
where c.id = t.id and t.step_key = 'demagnetise_check' and t.check_key in ('demagnetise_if_needed','recheck_magnetism','timing_effect');

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'choice',
    answer_options = '[{"value":"smooth","label":"Smooth / correct"},{"value":"rough","label":"Rough"},{"value":"slips","label":"Slips"},{"value":"no_engagement","label":"No engagement"}]'::jsonb,
    problem_values = '["rough","slips","no_engagement"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'barrel_mainspring' and t.check_key = 'engagement_test';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'choice',
    answer_options = '[{"value":"free","label":"Spins freely"},{"value":"rough","label":"Rough / hesitant"},{"value":"binds","label":"Binds"},{"value":"no_motion","label":"No useful motion"}]'::jsonb,
    problem_values = '["rough","binds","no_motion"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'train_test' and t.check_key = 'free_spin';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'choice',
    answer_options = '[{"value":"normal","label":"Normal"},{"value":"rough","label":"Rough"},{"value":"excessive_endshake","label":"Excessive endshake"},{"value":"no_freedom","label":"No freedom"}]'::jsonb,
    problem_values = '["rough","excessive_endshake","no_freedom"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'balance' and t.check_key = 'freedom_endshake';

with target as (
  select c.id, s.step_key, c.check_key
  from public.work_template_step_checks c
  join public.work_template_steps s on s.id = c.template_step_id
)
update public.work_template_step_checks c
set answer_kind = 'yes_no',
    answer_options = '[{"value":"no","label":"No unresolved issue"},{"value":"yes","label":"Yes — issue remains"}]'::jsonb,
    problem_values = '["yes"]'::jsonb
from target t
where c.id = t.id and t.step_key = 'final_qc' and t.check_key = 'open_issues';

-- Drill-down child checks. These remain inactive until their parent result activates them.
insert into public.work_template_step_checks (
  workspace_id, template_step_id, check_key, label, description, sequence, required,
  check_type, tool_key, knowledge_scope, evidence_required, answer_kind, answer_options,
  activation_rule, problem_values
)
select s.workspace_id, s.id, v.check_key, v.label, v.description, v.sequence, true,
       v.check_type, v.tool_key, v.knowledge_scope, false, v.answer_kind, v.answer_options,
       v.activation_rule, '[]'::jsonb
from public.work_template_steps s
join (values
  ('intake','winding_fault_detail','Describe the winding fault','Record exactly what feels or behaves abnormally. This becomes evidence for the winding/power diagnosis.',25,'observation','diagnosis','keyless','text','[]'::jsonb,'{"parent_key":"winding_test","values":["rough","slipping","blocked","no_torque","other"]}'::jsonb),
  ('intake','setting_fault_detail','Describe the setting fault','Record exactly where the setting action becomes stiff, slips or blocks.',35,'observation','diagnosis','keyless','text','[]'::jsonb,'{"parent_key":"setting_test","values":["stiff","slips","blocked","other"]}'::jsonb),
  ('pre_service_timing','timing_unavailable_reason','Why can it not be timed?','Record why a meaningful baseline is unavailable. The timing branch is suppressed until timing becomes possible.',15,'observation','diagnosis','pre_service','text','[]'::jsonb,'{"parent_key":"running_sufficiently","values":["no"]}'::jsonb),
  ('demagnetise_check','magnetism_uncertain_followup','Resolve the magnetism uncertainty','Repeat the check using the best available method and record what you observe before deciding whether to demagnetise.',15,'observation','diagnosis','magnetism','text','[]'::jsonb,'{"parent_key":"magnetism_check","values":["uncertain"]}'::jsonb),
  ('train_test','train_resistance_detail','Locate the train resistance','Narrow the binding or roughness: bridge seating, a specific wheel/pinion, pivot/jewel, debris or uncertain.',25,'observation','diagnosis','train','choice','[{"value":"bridge_seating","label":"Bridge / seating"},{"value":"specific_wheel","label":"Specific wheel or pinion"},{"value":"pivot_jewel","label":"Pivot / jewel"},{"value":"debris","label":"Debris / contamination"},{"value":"uncertain","label":"Still uncertain"}]'::jsonb,'{"parent_key":"free_spin","values":["rough","binds","no_motion"]}'::jsonb),
  ('barrel_mainspring','barrel_engagement_detail','Locate the barrel engagement fault','Narrow whether the issue is the arbor/inner coil, outer hook or bridle, barrel freedom, or still uncertain.',55,'observation','diagnosis','barrel','choice','[{"value":"arbor_inner","label":"Arbor / inner coil"},{"value":"outer_hook_bridle","label":"Outer hook / bridle"},{"value":"barrel_freedom","label":"Barrel freedom"},{"value":"uncertain","label":"Still uncertain"}]'::jsonb,'{"parent_key":"engagement_test","values":["rough","slips","no_engagement"]}'::jsonb),
  ('balance','balance_freedom_detail','Narrow the balance freedom fault','Record whether the evidence points to pivots/jewels, hairspring contact, endshake, roller/impulse relationship or is still uncertain.',55,'observation','diagnosis','balance','choice','[{"value":"pivot_jewel","label":"Pivot / jewel"},{"value":"hairspring","label":"Hairspring contact / geometry"},{"value":"endshake","label":"Endshake"},{"value":"roller_impulse","label":"Roller / impulse"},{"value":"uncertain","label":"Still uncertain"}]'::jsonb,'{"parent_key":"freedom_endshake","values":["rough","excessive_endshake","no_freedom"]}'::jsonb),
  ('final_qc','open_issue_detail','Describe the unresolved issue','Record the remaining problem. Final QC should not hide an unresolved fault.',45,'observation','diagnosis','final_qc','text','[]'::jsonb,'{"parent_key":"open_issues","values":["yes"]}'::jsonb)
) as v(step_key,check_key,label,description,sequence,check_type,tool_key,knowledge_scope,answer_kind,answer_options,activation_rule)
  on s.step_key = v.step_key
where not exists (
  select 1 from public.work_template_step_checks existing
  where existing.template_step_id = s.id and existing.check_key = v.check_key
);

create or replace function public.recompute_work_step_check_branches(
  p_workspace_id uuid,
  p_checklist_step_id uuid
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_iter integer;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  update public.work_step_checks c
  set parent_check_id = p.id
  from public.work_step_checks p
  where c.workspace_id = p_workspace_id
    and c.checklist_step_id = p_checklist_step_id
    and p.workspace_id = c.workspace_id
    and p.checklist_step_id = c.checklist_step_id
    and c.activation_rule <> '{}'::jsonb
    and c.activation_rule->>'parent_key' = p.check_key;

  update public.work_step_checks
  set is_active = (activation_rule = '{}'::jsonb),
      state_reason = case when activation_rule = '{}'::jsonb then '' else 'Waiting for parent result' end
  where workspace_id = p_workspace_id and checklist_step_id = p_checklist_step_id;

  for v_iter in 1..10 loop
    update public.work_step_checks child
    set is_active = parent.is_active and exists (
          select 1
          from jsonb_array_elements_text(coalesce(child.activation_rule->'values','[]'::jsonb)) allowed(value)
          where allowed.value = parent.answer_value
        ),
        state_reason = case
          when parent.is_active and exists (
            select 1
            from jsonb_array_elements_text(coalesce(child.activation_rule->'values','[]'::jsonb)) allowed(value)
            where allowed.value = parent.answer_value
          ) then ''
          when not parent.is_active then concat('Parent branch inactive: ', parent.label)
          when btrim(parent.answer_value) = '' then concat('Waiting for: ', parent.label)
          else concat('Ruled out by ', parent.label, ' = ', parent.answer_value)
        end
    from public.work_step_checks parent
    where child.workspace_id = p_workspace_id
      and child.checklist_step_id = p_checklist_step_id
      and child.parent_check_id = parent.id;
  end loop;
end
$$;

create or replace function public.set_work_step_check_answer(
  p_workspace_id uuid,
  p_check_id uuid,
  p_answer text,
  p_note text default ''
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_check public.work_step_checks%rowtype;
  v_parent public.work_step_checks%rowtype;
  v_step_label text;
  v_problem boolean := false;
  v_finding_id uuid;
  v_evidence_finding_id uuid;
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

  insert into public.work_diagnostic_evidence (
    workspace_id, work_id, item_id, finding_id, work_step_check_id,
    effect, strength, summary, source_kind, source_ref, created_by
  ) values (
    v_check.workspace_id, v_check.work_id, v_check.item_id, v_evidence_finding_id, v_check.id,
    'neutral', 'unknown',
    concat(v_check.label, ': ', p_answer,
           case when btrim(coalesce(p_note,'')) <> '' then concat(' — ', btrim(p_note)) else '' end),
    'bench', concat('Procedure step: ', coalesce(v_step_label,'Unknown')), (select auth.uid())
  );

  perform public.recompute_work_step_check_branches(p_workspace_id, v_check.checklist_step_id);
  return v_finding_id;
end
$$;

create or replace function public.copy_work_step_checks_from_template()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.template_step_id is null then
    return new;
  end if;

  insert into public.work_step_checks (
    workspace_id, work_id, item_id, checklist_step_id, template_step_check_id,
    check_key, label, description, sequence, required, check_type, tool_key,
    knowledge_scope, evidence_required, answer_kind, answer_options, activation_rule,
    problem_values, is_active, created_by
  )
  select new.workspace_id, new.work_id, new.item_id, new.id, c.id,
         c.check_key, c.label, c.description, c.sequence, c.required, c.check_type, c.tool_key,
         c.knowledge_scope, c.evidence_required, c.answer_kind, c.answer_options, c.activation_rule,
         c.problem_values, (c.activation_rule = '{}'::jsonb), new.created_by
  from public.work_template_step_checks c
  where c.template_step_id = new.template_step_id
  order by c.sequence
  on conflict (checklist_step_id, check_key) do nothing;

  update public.work_step_checks child
  set parent_check_id = parent.id
  from public.work_step_checks parent
  where child.workspace_id = new.workspace_id
    and child.checklist_step_id = new.id
    and parent.workspace_id = child.workspace_id
    and parent.checklist_step_id = child.checklist_step_id
    and child.activation_rule <> '{}'::jsonb
    and child.activation_rule->>'parent_key' = parent.check_key;

  return new;
end
$$;

create or replace function public.complete_work_checklist_step(p_workspace_id uuid, p_step_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_open_required integer;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if not exists (
    select 1 from public.work_checklist_steps s
    where s.workspace_id = p_workspace_id and s.id = p_step_id
  ) then
    raise exception 'Checklist step not found';
  end if;

  select count(*) into v_open_required
  from public.work_step_checks c
  where c.workspace_id = p_workspace_id
    and c.checklist_step_id = p_step_id
    and c.is_active
    and c.required
    and c.status not in ('complete','not_applicable');

  if v_open_required > 0 then
    raise exception 'Complete all active required checks first';
  end if;

  update public.work_checklist_steps
  set status = 'done',
      started_at = coalesce(started_at, now()),
      completed_at = now(),
      blocked_reason = '',
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_step_id;
end
$$;

-- Backfill new branch metadata into existing Work snapshots.
update public.work_step_checks w
set answer_kind = t.answer_kind,
    answer_options = t.answer_options,
    activation_rule = t.activation_rule,
    problem_values = t.problem_values,
    is_active = (t.activation_rule = '{}'::jsonb)
from public.work_template_step_checks t
where w.template_step_check_id = t.id;

-- Add newly introduced child checks to existing snapshot-backed Work.
insert into public.work_step_checks (
  workspace_id, work_id, item_id, checklist_step_id, template_step_check_id,
  check_key, label, description, sequence, required, check_type, tool_key,
  knowledge_scope, evidence_required, answer_kind, answer_options, activation_rule,
  problem_values, is_active, created_by
)
select s.workspace_id, s.work_id, s.item_id, s.id, t.id,
       t.check_key, t.label, t.description, t.sequence, t.required, t.check_type, t.tool_key,
       t.knowledge_scope, t.evidence_required, t.answer_kind, t.answer_options, t.activation_rule,
       t.problem_values, (t.activation_rule = '{}'::jsonb), s.created_by
from public.work_checklist_steps s
join public.work_template_step_checks t on t.template_step_id = s.template_step_id
where not exists (
  select 1 from public.work_step_checks existing
  where existing.checklist_step_id = s.id and existing.check_key = t.check_key
)
on conflict (checklist_step_id, check_key) do nothing;

update public.work_step_checks child
set parent_check_id = parent.id
from public.work_step_checks parent
where child.workspace_id = parent.workspace_id
  and child.checklist_step_id = parent.checklist_step_id
  and child.activation_rule <> '{}'::jsonb
  and child.activation_rule->>'parent_key' = parent.check_key;

-- Recompute all existing branch states without needing user context.
update public.work_step_checks
set is_active = (activation_rule = '{}'::jsonb),
    state_reason = case when activation_rule = '{}'::jsonb then '' else 'Waiting for parent result' end;

update public.work_step_checks child
set is_active = parent.is_active and exists (
      select 1 from jsonb_array_elements_text(coalesce(child.activation_rule->'values','[]'::jsonb)) allowed(value)
      where allowed.value = parent.answer_value
    ),
    state_reason = case
      when parent.is_active and exists (
        select 1 from jsonb_array_elements_text(coalesce(child.activation_rule->'values','[]'::jsonb)) allowed(value)
        where allowed.value = parent.answer_value
      ) then ''
      when not parent.is_active then concat('Parent branch inactive: ', parent.label)
      when btrim(parent.answer_value) = '' then concat('Waiting for: ', parent.label)
      else concat('Ruled out by ', parent.label, ' = ', parent.answer_value)
    end
from public.work_step_checks parent
where child.parent_check_id = parent.id;

-- Preserve a baseline plan revision for already-planned Work.
insert into public.work_plan_revisions (
  workspace_id, work_id, item_id, revision, reason, plan_snapshot, created_by
)
select w.workspace_id, w.id, w.item_id, 1, 'Baseline plan captured when Job State Engine v1 was introduced',
       coalesce((
         select jsonb_agg(jsonb_build_object(
           'id', a.id,
           'action_key', a.action_key,
           'label', a.label,
           'sequence', a.sequence,
           'procedure_template_id', a.procedure_template_id,
           'status', a.status,
           'notes', a.notes
         ) order by a.sequence)
         from public.work_plan_actions a
         where a.workspace_id = w.workspace_id and a.work_id = w.id
       ), '[]'::jsonb),
       w.created_by
from public.work_records w
where exists (
  select 1 from public.work_plan_actions a
  where a.workspace_id = w.workspace_id and a.work_id = w.id
)
and not exists (
  select 1 from public.work_plan_revisions r
  where r.workspace_id = w.workspace_id and r.work_id = w.id
);

create or replace function public.get_work_next_best_action(
  p_workspace_id uuid,
  p_work_id uuid
)
returns table (
  action_type text,
  title text,
  instructions text,
  reason text,
  tool_key text,
  entity_id uuid,
  checklist_step_id uuid,
  timing_checkpoint text
)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_work public.work_records%rowtype;
  v_step public.work_checklist_steps%rowtype;
  v_check public.work_step_checks%rowtype;
  v_diag public.work_diagnostic_checks%rowtype;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work
  from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id;
  if not found then return; end if;

  if v_work.status in ('complete','cancelled') then return; end if;

  if v_work.induction_status not in ('complete','legacy_skipped') then
    return query select 'induction', 'Continue Workshop Induction',
      'Finish the active induction checks so Calibre has a reliable incoming condition before planning repair work.',
      'The Job Plan should be based on observed condition, not assumptions.', '', null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_work.induction_status <> 'legacy_skipped' and v_work.job_plan_status <> 'applied' then
    return query select 'job_plan', 'Create / apply the Job Plan',
      'Choose the planned work from the induction findings. Material discoveries later can create a versioned revision.',
      'No repair procedure should be treated as canonical until the plan is applied.', '', null::uuid, null::uuid, null::text;
    return;
  end if;

  select * into v_step
  from public.work_checklist_steps s
  where s.workspace_id = p_workspace_id
    and s.work_id = p_work_id
    and s.status not in ('done','na')
  order by case s.status when 'in_progress' then 0 when 'blocked' then 1 else 2 end, s.sequence
  limit 1;

  if found then
    if v_step.status = 'not_started' then
      return query select 'begin_stage', v_step.label, v_step.description,
        'This is the next procedure stage in the current Job Plan.', '', v_step.id, v_step.id, null::text;
      return;
    end if;

    select * into v_check
    from public.work_step_checks c
    where c.workspace_id = p_workspace_id
      and c.checklist_step_id = v_step.id
      and c.is_active
      and c.status not in ('complete','not_applicable')
    order by case when c.required then 0 else 1 end, c.sequence
    limit 1;

    if found then
      return query select 'step_check', v_check.label, v_check.description,
        concat('Active check in ', v_step.label,
               case when v_check.required then ' · required' else ' · optional' end),
        v_check.tool_key, v_check.id, v_step.id,
        case
          when v_check.tool_key <> 'timing' then null
          when v_check.knowledge_scope = 'pre_service' then 'pre_service'
          when v_check.knowledge_scope = 'final_qc' then 'final_qc'
          when v_check.knowledge_scope = 'regulation' then 'regulation'
          when v_check.knowledge_scope = 'balance' then 'post_reassembly'
          else 'other'
        end;
      return;
    end if;

    select c.* into v_diag
    from public.work_diagnostic_checks c
    join public.work_diagnostic_hypotheses h on h.id = c.hypothesis_id
    join public.work_findings f on f.id = h.finding_id
    where c.workspace_id = p_workspace_id
      and c.work_id = p_work_id
      and c.status in ('approved','suggested')
      and h.status = 'possible'
      and f.status = 'open'
    order by case c.status when 'approved' then 0 else 1 end, c.sequence, c.created_at
    limit 1;

    if found then
      return query select 'diagnostic_check', v_diag.label, v_diag.instructions,
        'This check can narrow an unresolved Finding and rule hypotheses in or out.', 'diagnosis', v_diag.id, v_step.id, null::text;
      return;
    end if;

    return query select 'complete_stage', concat('Complete ', v_step.label),
      'All active checks in this stage are cleared. Complete the stage to advance the Job Plan.',
      'Inactive branches are excluded but remain in the audit history.', '', v_step.id, v_step.id, null::text;
    return;
  end if;

  select c.* into v_diag
  from public.work_diagnostic_checks c
  join public.work_diagnostic_hypotheses h on h.id = c.hypothesis_id
  join public.work_findings f on f.id = h.finding_id
  where c.workspace_id = p_workspace_id
    and c.work_id = p_work_id
    and c.status in ('approved','suggested')
    and h.status = 'possible'
    and f.status = 'open'
  order by case c.status when 'approved' then 0 else 1 end, c.sequence, c.created_at
  limit 1;

  if found then
    return query select 'diagnostic_check', v_diag.label, v_diag.instructions,
      'Procedure stages are clear, but an unresolved Finding still has a useful discriminating check.',
      'diagnosis', v_diag.id, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1 from public.work_part_needs n
    where n.workspace_id = p_workspace_id and n.work_record_id = p_work_id
      and n.status in ('open','reserved')
  ) then
    return query select 'parts', 'Resolve required parts',
      'Review open Part Needs, donor candidates and compatibility evidence before closing the job.',
      'A part requirement is still open for this Work.', 'parts', null::uuid, null::uuid, null::text;
    return;
  end if;

  return query select 'review_qc', 'Review Final QC / completion readiness',
    'Review timing, unresolved Findings, evidence and completion readiness before closing Work.',
    'No earlier active action was found.', '', null::uuid, null::uuid, null::text;
end
$$;

grant execute on function public.recompute_work_step_check_branches(uuid, uuid) to authenticated;
grant execute on function public.set_work_step_check_answer(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_work_plan_revision(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.get_work_next_best_action(uuid, uuid) to authenticated;
