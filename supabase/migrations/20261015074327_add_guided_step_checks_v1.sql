create table public.work_template_step_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_step_id uuid not null references public.work_template_steps(id) on delete cascade,
  check_key text not null check (btrim(check_key) <> ''),
  label text not null check (btrim(label) <> ''),
  description text not null default '',
  sequence integer not null check (sequence >= 0),
  required boolean not null default true,
  check_type text not null default 'inspection'
    check (check_type = any(array['inspection','action','observation','decision','photo','measurement','timing','knowledge','part','qc']::text[])),
  tool_key text not null default ''
    check (tool_key = any(array['','photo','measurement','timing','knowledge','parts','research','diagnosis']::text[])),
  knowledge_scope text not null default '',
  evidence_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_step_id, check_key),
  unique (template_step_id, sequence)
);

create index work_template_step_checks_workspace_idx on public.work_template_step_checks(workspace_id);
create index work_template_step_checks_step_idx on public.work_template_step_checks(template_step_id);

create table public.work_step_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  checklist_step_id uuid not null references public.work_checklist_steps(id) on delete cascade,
  template_step_check_id uuid references public.work_template_step_checks(id) on delete set null,
  check_key text not null check (btrim(check_key) <> ''),
  label text not null check (btrim(label) <> ''),
  description text not null default '',
  sequence integer not null check (sequence >= 0),
  required boolean not null default true,
  check_type text not null default 'inspection'
    check (check_type = any(array['inspection','action','observation','decision','photo','measurement','timing','knowledge','part','qc']::text[])),
  tool_key text not null default ''
    check (tool_key = any(array['','photo','measurement','timing','knowledge','parts','research','diagnosis']::text[])),
  knowledge_scope text not null default '',
  evidence_required boolean not null default false,
  status text not null default 'not_started'
    check (status = any(array['not_started','in_progress','complete','not_applicable','problem']::text[])),
  result_text text not null default '',
  problem_finding_id uuid references public.work_findings(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_step_checks_work_fkey foreign key (workspace_id, work_id)
    references public.work_records(workspace_id, id) on delete cascade,
  constraint work_step_checks_item_fkey foreign key (workspace_id, item_id)
    references public.items(workspace_id, id) on delete cascade,
  unique (checklist_step_id, check_key),
  unique (checklist_step_id, sequence)
);

create index work_step_checks_workspace_idx on public.work_step_checks(workspace_id);
create index work_step_checks_work_idx on public.work_step_checks(work_id);
create index work_step_checks_checklist_step_idx on public.work_step_checks(checklist_step_id);
create index work_step_checks_problem_finding_idx on public.work_step_checks(problem_finding_id) where problem_finding_id is not null;

create trigger work_step_checks_touch_updated_at
before update on public.work_step_checks
for each row execute function app_private.touch_updated_at();

alter table public.work_template_step_checks enable row level security;
alter table public.work_step_checks enable row level security;

revoke all on public.work_template_step_checks from anon, authenticated;
revoke all on public.work_step_checks from anon, authenticated;
grant select, insert, update, delete on public.work_template_step_checks to authenticated;
grant select, insert, update, delete on public.work_step_checks to authenticated;

create policy work_template_step_checks_select on public.work_template_step_checks
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_template_step_checks.workspace_id
    and m.user_id = (select auth.uid())
));

create policy work_template_step_checks_insert on public.work_template_step_checks
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_template_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_template_step_checks_update on public.work_template_step_checks
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_template_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_template_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_template_step_checks_delete on public.work_template_step_checks
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_template_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_step_checks_select on public.work_step_checks
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_step_checks.workspace_id
    and m.user_id = (select auth.uid())
));

create policy work_step_checks_insert on public.work_step_checks
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_step_checks_update on public.work_step_checks
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

create policy work_step_checks_delete on public.work_step_checks
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_step_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));

with seed(step_key, check_key, label, description, sequence, required, check_type, tool_key, knowledge_scope, evidence_required) as (
  values
('intake','presented_condition','Record presented condition','Confirm overall condition and the reported symptom before dismantling.',10,true,'inspection','','',true),
('intake','winding_test','Test winding','Check winding feel, crown security and whether power is accepted.',20,true,'inspection','','',false),
('intake','setting_test','Test setting','Check hand-setting and crown/stem behaviour without forcing the mechanism.',30,true,'inspection','','',false),
('intake','visible_damage','Inspect visible damage','Record crystal, case, dial, hands, crown and other visible damage.',40,true,'photo','photo','',true),
('intake','identity_context','Check movement identity context','Review the Passport and movement knowledge; request research if the movement is still uncertain.',50,false,'knowledge','knowledge','movement_identity',false),
('pre_service_timing','running_sufficiently','Confirm timing is possible','Confirm the watch runs consistently enough to obtain a meaningful baseline. Use N/A if it cannot be timed.',10,true,'decision','','',false),
('pre_service_timing','timing_specs','Confirm timing reference','Review documented BPH and lift angle when available before recording a run.',20,false,'knowledge','knowledge','timing_specs',false),
('pre_service_timing','baseline_run','Record baseline timing','Capture a pre-service timing run and save it to this Work.',30,true,'timing','timing','pre_service',true),
('pre_service_timing','baseline_observation','Record timing observation','Note instability, beat error, positional behaviour or anything unusual in the trace.',40,false,'observation','','',false),
('demagnetise_check','magnetism_check','Check for magnetism','Check the watch/movement for magnetism before interpreting timing behaviour.',10,true,'inspection','','',false),
('demagnetise_check','demagnetise_if_needed','Demagnetise if required','Demagnetise only when the check indicates it is appropriate.',20,false,'action','','',false),
('demagnetise_check','recheck_magnetism','Re-check magnetism','Confirm the condition after demagnetising or mark N/A if no demagnetising was needed.',30,true,'inspection','','',false),
('demagnetise_check','timing_effect','Check timing effect','If magnetism affected performance, record a comparison timing run.',40,false,'timing','timing','pre_service',false),
('movement_removal','before_opening_photo','Photograph before opening','Capture the case/movement state before removal where useful for reassembly and evidence.',10,false,'photo','photo','',true),
('movement_removal','stem_crown_removal','Remove stem/crown safely','Release the stem/crown without forcing the setting or keyless works.',20,true,'action','','',false),
('movement_removal','case_retention','Record movement retention','Inspect clamps, screws, movement ring, spacers and any unusual casing method.',30,true,'inspection','','',false),
('movement_removal','case_movement_marks','Record identifying marks','Capture case reference, serial, movement marks and calibre evidence that becomes visible.',40,false,'knowledge','research','identification',true),
('movement_removal','parts_secured','Secure removed parts','Keep case screws, clamps, ring, stem and other removed components controlled with the job.',50,true,'action','','',false),
('strip_down','let_down_power','Let down mainspring power','Safely remove stored power before train or escapement disassembly.',10,true,'action','','',false),
('strip_down','dial_hands','Remove hands and dial','Remove and protect hands/dial; record unusual fittings or damage.',20,true,'action','','',false),
('strip_down','keyless_side','Disassemble keyless/motion works','Disassemble methodically and note unusual orientation, wear or missing components.',30,true,'inspection','','',false),
('strip_down','train_side','Disassemble train/barrel','Remove bridges, train and barrel methodically without mixing components.',40,true,'inspection','','',false),
('strip_down','escapement_balance','Remove escapement and balance','Protect balance, hairspring, pallet and escape components during removal.',50,true,'inspection','','',false),
('strip_down','strip_findings','Record strip-down findings','Any broken, missing, worn or unexpected component should be recorded as a Problem.',60,true,'observation','diagnosis','',false),
('inspection','barrel_mainspring','Inspect barrel and mainspring','Inspect barrel wall/lid/arbor, hook or bridle, and mainspring condition.',10,true,'inspection','diagnosis','barrel',false),
('inspection','train','Inspect train','Inspect wheel teeth, pinions, pivots, endshake/side shake and freedom.',20,true,'inspection','diagnosis','train',false),
('inspection','jewels','Inspect jewels','Check train, balance and cap jewels for cracks, contamination, wear or displacement.',30,true,'inspection','diagnosis','jewels',false),
('inspection','escapement','Inspect escapement','Inspect escape teeth, pallet stones/fork, roller and related surfaces.',40,true,'inspection','diagnosis','escapement',false),
('inspection','balance','Inspect balance and hairspring','Inspect pivots, staff, roller, hairspring shape/centering and balance condition.',50,true,'inspection','diagnosis','balance',false),
('inspection','keyless','Inspect keyless and winding works','Inspect sliding/winding pinions, yoke, setting lever, springs and related wear.',60,true,'inspection','diagnosis','keyless',false),
('inspection','parts_decision','Identify replacement needs','Create Part Needs for components that cannot be returned to reliable service.',70,false,'part','parts','compatibility',false),
('cleaning','cleaning_exclusions','Identify cleaning exclusions','Separate painted, shellacked, delicate, rust-sensitive or otherwise unsuitable components from normal cleaning.',10,true,'decision','knowledge','cleaning',false),
('cleaning','preclean','Pre-clean heavy contamination','Remove heavy grease/dirt where needed before the main cleaning cycle.',20,false,'action','','',false),
('cleaning','clean_cycle','Clean components','Clean appropriate components using the selected bench process.',30,true,'action','','',false),
('cleaning','rinse_dry','Rinse and dry','Ensure components are adequately rinsed/dried and protected from contamination.',40,true,'action','','',false),
('cleaning','post_clean_inspection','Inspect after cleaning','Re-inspect pivots, jewels, teeth and surfaces now that contamination is removed.',50,true,'inspection','diagnosis','inspection',false),
('barrel_mainspring','barrel_condition','Inspect barrel components','Check barrel wall, lid, arbor bearing surfaces and hooks/bridle contact areas.',10,true,'inspection','diagnosis','barrel',false),
('barrel_mainspring','spring_condition','Inspect mainspring','Check mainspring set, cracks, hook/bridle condition and appropriateness for reuse.',20,true,'inspection','parts','mainspring',false),
('barrel_mainspring','lubrication_reference','Check lubrication reference','Review movement-specific or general barrel/mainspring lubrication guidance before assembly.',30,false,'knowledge','knowledge','lubrication_barrel',false),
('barrel_mainspring','assemble_barrel','Assemble barrel','Install the mainspring/arbor correctly and close the barrel without distortion.',40,true,'action','','',false),
('barrel_mainspring','engagement_test','Confirm engagement and freedom','Confirm arbor hook/inner coil and outer hook/bridle engagement as applicable, then check smooth freedom.',50,true,'inspection','diagnosis','barrel',false),
('train_test','assemble_train','Assemble train for test','Install train wheels and bridges with the correct jewels/pivots engaged.',10,true,'action','','',false),
('train_test','free_spin','Check train freedom','Verify the train spins freely without power and stops naturally without binding.',20,true,'inspection','diagnosis','train',false),
('train_test','endshake','Check endshake and side shake','Assess excessive or insufficient endshake/side shake at relevant wheels.',30,true,'measurement','measurement','train',false),
('train_test','bridge_seating','Confirm bridge/plate seating','Verify bridges and plates seat without forcing pivots or distorting the train.',40,true,'inspection','diagnosis','train',false),
('keyless_winding','lubrication_reference','Check lubrication reference','Review movement-specific guidance for keyless and winding contact surfaces.',10,false,'knowledge','knowledge','lubrication_keyless',false),
('keyless_winding','assemble_keyless','Assemble keyless works','Assemble setting/winding components in the correct orientation and engagement.',20,true,'action','','',false),
('keyless_winding','winding_function','Verify winding','Confirm smooth positive winding and correct ratchet/click behaviour.',30,true,'inspection','diagnosis','keyless',false),
('keyless_winding','setting_function','Verify setting','Confirm crown positions, hand-setting and return to winding without slipping or binding.',40,true,'inspection','diagnosis','keyless',false),
('escapement','inspect_escape','Re-check escape wheel','Confirm escape teeth/pivots and freedom are suitable before final escapement assembly.',10,true,'inspection','diagnosis','escapement',false),
('escapement','inspect_pallet','Re-check pallet/fork','Confirm pallet stones, fork, guard pin and banking relationship appear serviceable.',20,true,'inspection','diagnosis','escapement',false),
('escapement','assemble_escapement','Assemble escapement','Install escape wheel/pallet components correctly and verify freedom.',30,true,'action','','',false),
('escapement','lock_drop','Verify lock/drop and action','Check functional locking/drop/action appropriate to the movement and your level of evidence.',40,true,'inspection','diagnosis','escapement',false),
('escapement','lubrication_reference','Check escapement lubrication','Use a sourced lubrication reference where available before oiling pallet/escape contact surfaces.',50,false,'knowledge','knowledge','lubrication_escapement',false),
('balance','pivot_jewel_check','Inspect balance pivots and jewels','Confirm pivots/cap jewels are clean, intact and correctly seated.',10,true,'inspection','diagnosis','balance',false),
('balance','hairspring_check','Inspect hairspring','Check centering, flatness, coil clearance, stud/collet condition and interference.',20,true,'inspection','diagnosis','balance',false),
('balance','roller_check','Inspect roller/impulse jewel','Check roller table, impulse jewel and safety action for obvious faults.',30,true,'inspection','diagnosis','balance',false),
('balance','install_balance','Install balance','Install the balance without forcing the pivot into the jewel.',40,true,'action','','',false),
('balance','freedom_endshake','Check freedom and endshake','Confirm free oscillation and appropriate endshake/clearance.',50,true,'inspection','diagnosis','balance',false),
('balance','stable_run','Confirm stable running','Confirm the movement starts and continues to run consistently enough to proceed.',60,true,'inspection','timing','balance',false),
('lubrication_final_assembly','lubrication_plan','Review lubrication plan','Use movement-specific sourced guidance where available; otherwise clearly distinguish general bench practice from documented data.',10,true,'knowledge','knowledge','lubrication',false),
('lubrication_final_assembly','train_lubrication','Lubricate train/jewels','Apply appropriate lubricant and quantity to required train/jewel points.',20,true,'action','','',false),
('lubrication_final_assembly','motion_keyless_lubrication','Lubricate motion/keyless contacts','Lubricate sliding and friction surfaces appropriate to the movement.',30,true,'action','','',false),
('lubrication_final_assembly','complete_assembly','Complete remaining assembly','Complete motion works and any applicable automatic/date components in the planned sequence.',40,true,'action','','',false),
('lubrication_final_assembly','lubrication_visual','Inspect lubrication quality','Check for obvious over-oiling, dry required points, contamination or migrated lubricant.',50,true,'inspection','diagnosis','lubrication',false),
('regulation','timing_reference','Confirm timing reference','Confirm BPH/lift angle and the intended checkpoint/position set before regulation.',10,false,'knowledge','knowledge','timing_specs',false),
('regulation','post_assembly_run','Record post-assembly timing','Capture a timing run before making final regulation adjustments.',20,true,'timing','timing','regulation',true),
('regulation','rate_beat_adjustment','Adjust rate/beat as appropriate','Make conservative adjustments based on stable timing evidence.',30,true,'action','','',false),
('regulation','position_checks','Check multiple positions','Record enough positions to understand spread rather than relying on one flattering trace.',40,true,'timing','timing','regulation',true),
('regulation','regulation_review','Review timing comparison','Compare baseline, post-assembly and regulated performance; investigate regressions before proceeding.',50,true,'decision','diagnosis','timing',false),
('casing','clean_case_interior','Clean case interior','Ensure case interior, movement ring/spacers and contact surfaces are clean before casing.',10,true,'action','','',false),
('casing','fit_dial_hands','Fit dial and hands','Fit securely and check alignment without marking dial/hands.',20,true,'action','','',false),
('casing','hand_clearance','Check hand clearance','Advance hands through a full cycle and confirm hand/dial/crystal clearance.',30,true,'inspection','diagnosis','casing',false),
('casing','stem_crown','Check stem/crown operation','Confirm winding/setting operation after casing and appropriate crown seating.',40,true,'inspection','diagnosis','casing',false),
('casing','movement_security','Secure movement','Confirm clamps/ring/spacers retain the movement correctly without distortion.',50,true,'inspection','','',false),
('casing','presentation_photo','Capture final presentation photo','Record the cased watch condition before Final QC.',60,false,'photo','photo','',true),
('final_qc','final_functions','Verify functions','Confirm winding, setting and all applicable calendar/complication functions.',10,true,'qc','','',false),
('final_qc','final_timing','Record final timing','Capture the final-QC timing evidence required for the job.',20,true,'timing','timing','final_qc',true),
('final_qc','final_visual','Check cleanliness and presentation','Inspect dial, hands, crystal/case and visible debris or marks before release.',30,true,'qc','photo','',false),
('final_qc','open_issues','Review unresolved issues','Confirm there are no unresolved blockers, required Part Needs or critical Findings being overlooked.',40,true,'decision','diagnosis','',false),
('final_qc','qc_evidence','Record final QC evidence','Record the final condition/evidence needed to support completion and any future Passport/service report.',50,true,'photo','photo','',true)
)
insert into public.work_template_step_checks (
  workspace_id, template_step_id, check_key, label, description, sequence,
  required, check_type, tool_key, knowledge_scope, evidence_required
)
select s.workspace_id, s.id, seed.check_key, seed.label, seed.description, seed.sequence,
       seed.required, seed.check_type, seed.tool_key, seed.knowledge_scope, seed.evidence_required
from public.work_template_steps s
join seed on seed.step_key = s.step_key
on conflict (template_step_id, check_key) do nothing;

create or replace function public.copy_work_step_checks_from_template()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if new.template_step_id is null then
    return new;
  end if;

  insert into public.work_step_checks (
    workspace_id, work_id, item_id, checklist_step_id, template_step_check_id,
    check_key, label, description, sequence, required, check_type, tool_key,
    knowledge_scope, evidence_required, created_by
  )
  select new.workspace_id, new.work_id, new.item_id, new.id, c.id,
         c.check_key, c.label, c.description, c.sequence, c.required, c.check_type, c.tool_key,
         c.knowledge_scope, c.evidence_required, new.created_by
  from public.work_template_step_checks c
  where c.template_step_id = new.template_step_id
  on conflict (checklist_step_id, check_key) do nothing;

  return new;
end
$function$;

create trigger work_checklist_steps_copy_step_checks
after insert on public.work_checklist_steps
for each row execute function public.copy_work_step_checks_from_template();

insert into public.work_step_checks (
  workspace_id, work_id, item_id, checklist_step_id, template_step_check_id,
  check_key, label, description, sequence, required, check_type, tool_key,
  knowledge_scope, evidence_required, created_by
)
select s.workspace_id, s.work_id, s.item_id, s.id, c.id,
       c.check_key, c.label, c.description, c.sequence, c.required, c.check_type, c.tool_key,
       c.knowledge_scope, c.evidence_required, s.created_by
from public.work_checklist_steps s
join public.work_template_step_checks c on c.template_step_id = s.template_step_id
on conflict (checklist_step_id, check_key) do nothing;

create or replace function public.begin_work_checklist_step(p_workspace_id uuid, p_step_id uuid)
returns void
language plpgsql
security invoker
set search_path = 'public'
as $function$
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  update public.work_checklist_steps
  set status = case when status = 'not_started' then 'in_progress' else status end,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where workspace_id = p_workspace_id
    and id = p_step_id
    and status in ('not_started','in_progress','blocked');

  if not found then
    raise exception 'Checklist step not found or cannot be started';
  end if;
end
$function$;

create or replace function public.complete_work_checklist_step(p_workspace_id uuid, p_step_id uuid)
returns void
language plpgsql
security invoker
set search_path = 'public'
as $function$
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
    and c.required
    and c.status not in ('complete','not_applicable');

  if v_open_required > 0 then
    raise exception 'Complete or mark N/A all required step checks first';
  end if;

  update public.work_checklist_steps
  set status = 'done',
      started_at = coalesce(started_at, now()),
      completed_at = now(),
      blocked_reason = '',
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_step_id;
end
$function$;

create or replace function public.mark_work_step_check_problem(
  p_workspace_id uuid,
  p_check_id uuid,
  p_details text,
  p_severity text default 'moderate'
)
returns uuid
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_check public.work_step_checks%rowtype;
  v_step_label text;
  v_finding_id uuid;
begin
  if p_severity not in ('info','minor','moderate','major','critical') then
    raise exception 'Unsupported severity';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select c.* into v_check
  from public.work_step_checks c
  where c.workspace_id = p_workspace_id and c.id = p_check_id;

  if not found then raise exception 'Step check not found'; end if;

  select label into v_step_label
  from public.work_checklist_steps
  where workspace_id = p_workspace_id and id = v_check.checklist_step_id;

  if v_check.problem_finding_id is not null then
    update public.work_findings
    set details = coalesce(nullif(btrim(p_details),''), v_check.description),
        severity = p_severity,
        updated_at = now()
    where id = v_check.problem_finding_id
    returning id into v_finding_id;
  else
    insert into public.work_findings (
      workspace_id, work_id, item_id, finding_type, severity, title, details, status, created_by
    ) values (
      v_check.workspace_id, v_check.work_id, v_check.item_id, 'fault', p_severity,
      concat_ws(': ', nullif(v_step_label,''), v_check.label),
      coalesce(nullif(btrim(p_details),''), v_check.description),
      'open', (select auth.uid())
    )
    returning id into v_finding_id;
  end if;

  update public.work_step_checks
  set status = 'problem',
      result_text = coalesce(nullif(btrim(p_details),''), result_text),
      problem_finding_id = v_finding_id,
      started_at = coalesce(started_at, now()),
      completed_at = null,
      completed_by = null
  where id = v_check.id;

  return v_finding_id;
end
$function$;

revoke all on function public.begin_work_checklist_step(uuid, uuid) from public, anon;
revoke all on function public.complete_work_checklist_step(uuid, uuid) from public, anon;
revoke all on function public.mark_work_step_check_problem(uuid, uuid, text, text) from public, anon;
grant execute on function public.begin_work_checklist_step(uuid, uuid) to authenticated;
grant execute on function public.complete_work_checklist_step(uuid, uuid) to authenticated;
grant execute on function public.mark_work_step_check_problem(uuid, uuid, text, text) to authenticated;
