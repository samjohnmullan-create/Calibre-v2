-- Calibre cross-stage diagnostic graph v1
-- Deterministic evidence relationships across the whole Work. OpenAI consumes this graph;
-- it does not own the underlying mechanical rule relationships.

create table public.calibre_diagnostic_hypotheses (
  hypothesis_key text primary key,
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  category text not null default 'mechanical',
  sequence integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.calibre_diagnostic_effect_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  step_key text not null check (btrim(step_key) <> ''),
  check_key text not null check (btrim(check_key) <> ''),
  answer_value text not null check (btrim(answer_value) <> ''),
  hypothesis_key text not null references public.calibre_diagnostic_hypotheses(hypothesis_key) on delete cascade,
  effect text not null check (effect = any(array['supports','weakens','rules_out','confirms']::text[])),
  strength text not null default 'moderate' check (strength = any(array['strong','moderate','weak']::text[])),
  rationale text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (step_key, check_key, answer_value, hypothesis_key)
);

create index calibre_diag_rules_lookup_idx
  on public.calibre_diagnostic_effect_rules(step_key, check_key, answer_value)
  where active;
create index calibre_diag_rules_hypothesis_idx
  on public.calibre_diagnostic_effect_rules(hypothesis_key)
  where active;

alter table public.calibre_diagnostic_hypotheses enable row level security;
alter table public.calibre_diagnostic_effect_rules enable row level security;

revoke all on public.calibre_diagnostic_hypotheses from anon, authenticated;
revoke all on public.calibre_diagnostic_effect_rules from anon, authenticated;
grant select on public.calibre_diagnostic_hypotheses to authenticated;
grant select on public.calibre_diagnostic_effect_rules to authenticated;

create policy calibre_diagnostic_hypotheses_authenticated_read
on public.calibre_diagnostic_hypotheses for select to authenticated using (true);
create policy calibre_diagnostic_effect_rules_authenticated_read
on public.calibre_diagnostic_effect_rules for select to authenticated using (true);

insert into public.calibre_diagnostic_hypotheses
  (hypothesis_key,title,description,category,sequence)
values
  ('magnetism','Magnetism affecting performance','Magnetic influence is materially affecting the movement or hairspring.','environmental',10),
  ('casing_crown_tube_interference','Casing / crown-tube interference','The case, case tube, crown, stem alignment or casing geometry is creating resistance not present in the uncased movement.','casing',20),
  ('keyless_winding_fault','Internal keyless / winding fault','Wear, damage, alignment or engagement in the stem, winding, setting or motion-work path is causing the symptom.','keyless',30),
  ('barrel_mainspring_fault','Barrel / mainspring energy-delivery fault','The mainspring, arbor, hook/bridle, barrel wall or barrel freedom is preventing reliable energy storage or delivery.','power',40),
  ('train_resistance','Train resistance / geometry fault','Wheel, pinion, pivot, jewel, endshake, bridge seating or debris is restricting train freedom.','train',50),
  ('escapement_fault','Escapement fault','Escape wheel, pallets, fork, banking, lock/drop or safety action is preventing reliable impulse and locking.','escapement',60),
  ('balance_pivot_jewel_fault','Balance pivot / jewel fault','Balance staff pivots, balance jewels, endshake or seating are restricting or destabilising oscillation.','balance',70),
  ('hairspring_fault','Hairspring geometry / interference fault','The hairspring is touching, distorted, poorly centred, or has a stud/collet/clearance problem.','balance',80),
  ('roller_impulse_fault','Roller / impulse-jewel fault','The roller table, impulse jewel or associated safety interaction is defective or misrelated.','balance',90),
  ('lubrication_contamination','Lubrication / contamination fault','Incorrect quantity, migrated lubricant, retained contamination or a dry required point is affecting operation.','lubrication',100),
  ('movement_retention_distortion','Movement retention / casing distortion','Clamps, ring, spacer or case fit is allowing movement or distorting the movement when secured.','casing',110),
  ('hand_clearance_fault','Hand / dial / crystal clearance fault','Hands are contacting each other, the dial/markers or the crystal and causing interference.','casing',120)
on conflict (hypothesis_key) do update set
  title=excluded.title, description=excluded.description, category=excluded.category,
  sequence=excluded.sequence, active=true;

insert into public.calibre_diagnostic_effect_rules
  (rule_key,step_key,check_key,answer_value,hypothesis_key,effect,strength,rationale)
values
  ('magnetism_detected','demagnetise_check','magnetism_check','detected','magnetism','supports','strong','Magnetism was directly detected at the bench.'),
  ('magnetism_clear','demagnetise_check','magnetism_check','clear','magnetism','rules_out','strong','The bench magnetism check was clear.'),
  ('magnetism_recheck_clear','demagnetise_check','recheck_magnetism','clear','magnetism','rules_out','strong','Magnetism was clear on the repeat check.'),
  ('magnetism_recheck_detected','demagnetise_check','recheck_magnetism','still_detected','magnetism','supports','strong','Magnetism remained detectable after intervention.'),
  ('intake_winding_rough_keyless','intake','winding_test','rough','keyless_winding_fault','supports','moderate','Rough winding is consistent with resistance in the winding/keyless path.'),
  ('intake_winding_blocked_keyless','intake','winding_test','blocked','keyless_winding_fault','supports','moderate','Blocked winding is consistent with a winding/keyless obstruction.'),
  ('intake_winding_slip_keyless','intake','winding_test','slipping','keyless_winding_fault','supports','moderate','Slipping during winding suggests an engagement fault in the winding path.'),
  ('intake_setting_stiff_keyless','intake','setting_test','stiff','keyless_winding_fault','supports','moderate','Stiff setting supports resistance in the shared keyless path.'),
  ('intake_setting_blocked_keyless','intake','setting_test','blocked','keyless_winding_fault','supports','moderate','Blocked setting supports an internal or stem/keyless obstruction.'),
  ('intake_winding_normal_keyless','intake','winding_test','normal','keyless_winding_fault','weakens','moderate','Normal winding weakens a general winding-path fault.'),
  ('intake_setting_normal_keyless','intake','setting_test','normal','keyless_winding_fault','weakens','moderate','Normal setting weakens a general keyless-setting fault.'),
  ('stem_detail_crown_tube','movement_removal','stem_removal_detail','crown_tube','casing_crown_tube_interference','supports','strong','Resistance was localised to the crown/case-tube interface.'),
  ('stem_detail_alignment','movement_removal','stem_removal_detail','stem_alignment','casing_crown_tube_interference','supports','moderate','Stem alignment or bending can create case-dependent resistance.'),
  ('stem_detail_internal_keyless','movement_removal','stem_removal_detail','internal_keyless','keyless_winding_fault','supports','strong','The resistance was localised to the internal keyless path.'),
  ('keyless_inspection_serviceable','inspection','keyless','serviceable','keyless_winding_fault','weakens','strong','Detailed component inspection found the keyless/winding works serviceable.'),
  ('keyless_inspection_wear','inspection','keyless','wear','keyless_winding_fault','supports','strong','Wear was found in keyless/winding contact surfaces.'),
  ('keyless_inspection_lever','inspection','keyless','lever_spring','keyless_winding_fault','supports','strong','A lever or spring fault was identified in the keyless works.'),
  ('keyless_inspection_pinion','inspection','keyless','pinion','keyless_winding_fault','supports','strong','A winding/sliding-pinion issue was identified.'),
  ('keyless_inspection_stem','inspection','keyless','stem_crown','keyless_winding_fault','supports','strong','A stem/crown fault was identified during internal inspection.'),
  ('winding_function_smooth','keyless_winding','winding_function','smooth','keyless_winding_fault','weakens','strong','The assembled winding works operate smoothly and positively.'),
  ('winding_function_rough','keyless_winding','winding_function','rough','keyless_winding_fault','supports','strong','Winding remains rough after assembly.'),
  ('winding_function_slips','keyless_winding','winding_function','slips','keyless_winding_fault','supports','strong','Winding engagement remains intermittent or slipping.'),
  ('winding_function_blocks','keyless_winding','winding_function','blocks','keyless_winding_fault','supports','strong','The winding path blocks after assembly.'),
  ('setting_function_smooth','keyless_winding','setting_function','smooth','keyless_winding_fault','weakens','strong','The assembled setting works operate smoothly and positively.'),
  ('setting_function_stiff','keyless_winding','setting_function','stiff','keyless_winding_fault','supports','strong','Setting remains stiff after assembly.'),
  ('setting_function_slips','keyless_winding','setting_function','slips','keyless_winding_fault','supports','strong','Setting still slips or fails to engage.'),
  ('setting_function_blocks','keyless_winding','setting_function','blocks','keyless_winding_fault','supports','strong','The setting path still blocks.'),
  ('cased_only_casing','casing','cased_crown_detail','only_cased','casing_crown_tube_interference','supports','strong','The crown/stem fault appears only after the movement is cased.'),
  ('cased_only_keyless','casing','cased_crown_detail','only_cased','keyless_winding_fault','weakens','strong','A fault that appears only when cased weakens an internal-only keyless explanation.'),
  ('same_uncased_casing','casing','cased_crown_detail','same_uncased','casing_crown_tube_interference','rules_out','strong','The same fault exists uncased, making casing geometry an unlikely sole cause.'),
  ('same_uncased_keyless','casing','cased_crown_detail','same_uncased','keyless_winding_fault','supports','strong','The fault persists uncased, supporting an internal stem/keyless cause.'),
  ('partly_cased_casing','casing','cased_crown_detail','partly_worse_cased','casing_crown_tube_interference','supports','moderate','The symptom worsens when cased, so casing contributes to the fault.'),
  ('partly_cased_keyless','casing','cased_crown_detail','partly_worse_cased','keyless_winding_fault','supports','moderate','The symptom is already present uncased, so an internal contribution remains plausible.'),
  ('inspection_barrel_serviceable','inspection','barrel_mainspring','serviceable','barrel_mainspring_fault','weakens','strong','Detailed inspection found the barrel and mainspring serviceable.'),
  ('inspection_barrel_wear','inspection','barrel_mainspring','wear','barrel_mainspring_fault','supports','moderate','Wear was found in the barrel/mainspring system.'),
  ('inspection_barrel_damaged','inspection','barrel_mainspring','damaged','barrel_mainspring_fault','supports','strong','Damage was found in the barrel/mainspring system.'),
  ('barrel_detail_arbor','inspection','barrel_inspection_detail','arbor_bearing','barrel_mainspring_fault','supports','strong','The barrel arbor/bearing surface was identified as the fault area.'),
  ('barrel_detail_hook','inspection','barrel_inspection_detail','hook','barrel_mainspring_fault','supports','strong','The barrel hook/engagement area was identified.'),
  ('barrel_detail_spring','inspection','barrel_inspection_detail','mainspring','barrel_mainspring_fault','supports','strong','The mainspring itself was identified as the problem area.'),
  ('barrel_condition_serviceable','barrel_mainspring','barrel_condition','serviceable','barrel_mainspring_fault','weakens','strong','Barrel components were found serviceable during assembly.'),
  ('barrel_condition_damage','barrel_mainspring','barrel_condition','damaged','barrel_mainspring_fault','supports','strong','Barrel components are damaged or distorted.'),
  ('spring_serviceable','barrel_mainspring','spring_condition','serviceable','barrel_mainspring_fault','weakens','strong','The mainspring was found serviceable.'),
  ('spring_damaged','barrel_mainspring','spring_condition','cracked_damaged','barrel_mainspring_fault','supports','strong','The mainspring is cracked or damaged.'),
  ('spring_hook_fault','barrel_mainspring','spring_condition','hook_bridle_fault','barrel_mainspring_fault','supports','strong','The spring hook/bridle attachment is faulty.'),
  ('barrel_engagement_smooth','barrel_mainspring','engagement_test','smooth','barrel_mainspring_fault','weakens','strong','Barrel engagement and freedom are smooth after assembly.'),
  ('barrel_engagement_rough','barrel_mainspring','engagement_test','rough','barrel_mainspring_fault','supports','strong','Barrel engagement or freedom remains rough.'),
  ('barrel_engagement_slips','barrel_mainspring','engagement_test','slips','barrel_mainspring_fault','supports','strong','Barrel/mainspring engagement slips under test.'),
  ('barrel_engagement_none','barrel_mainspring','engagement_test','no_engagement','barrel_mainspring_fault','supports','strong','The barrel/mainspring fails to engage.'),
  ('inspection_train_serviceable','inspection','train','serviceable','train_resistance','weakens','strong','Detailed train inspection found wheels, pivots and geometry serviceable.'),
  ('inspection_train_binding','inspection','train','binding','train_resistance','supports','strong','Binding or poor freedom was observed in the train.'),
  ('inspection_train_pivot','inspection','train','pivot_jewel','train_resistance','supports','strong','A train pivot/jewel issue was identified.'),
  ('inspection_train_tooth','inspection','train','tooth_pinion','train_resistance','supports','strong','A wheel-tooth or pinion issue was identified.'),
  ('inspection_train_endshake','inspection','train','endshake','train_resistance','supports','moderate','Train endshake/side-shake is abnormal.'),
  ('train_free','train_test','free_spin','free','train_resistance','weakens','strong','The assembled train spins freely.'),
  ('train_rough','train_test','free_spin','rough','train_resistance','supports','strong','The assembled train is rough or hesitant.'),
  ('train_binds','train_test','free_spin','binds','train_resistance','supports','strong','The assembled train binds.'),
  ('train_no_motion','train_test','free_spin','no_motion','train_resistance','supports','strong','The train has no useful free motion.'),
  ('bridge_seats_free','train_test','bridge_seating','free','train_resistance','weakens','moderate','The bridge/plate seats freely with pivots correctly located.'),
  ('bridge_pressure','train_test','bridge_seating','pressure','train_resistance','supports','strong','The bridge only seats under pressure, indicating geometry or pivot-location resistance.'),
  ('bridge_pivot_miss','train_test','bridge_seating','pivot_not_engaging','train_resistance','supports','strong','A pivot is not engaging its jewel during bridge seating.'),
  ('bridge_misalignment','train_test','bridge_seating','misalignment','train_resistance','supports','strong','Bridge/plate misalignment is suspected.'),
  ('inspection_escape_serviceable','inspection','escapement','serviceable','escapement_fault','weakens','strong','Detailed escapement inspection found the components serviceable.'),
  ('inspection_escape_wheel','inspection','escapement','escape_wheel','escapement_fault','supports','strong','An escape-wheel issue was identified.'),
  ('inspection_pallet_stone','inspection','escapement','pallet_stone','escapement_fault','supports','strong','A pallet-stone issue was identified.'),
  ('inspection_fork_guard','inspection','escapement','fork_guard','escapement_fault','supports','strong','A fork/guard issue was identified.'),
  ('escape_serviceable','escapement','inspect_escape','serviceable','escapement_fault','weakens','moderate','The escape wheel was re-checked and found serviceable.'),
  ('pallet_serviceable','escapement','inspect_pallet','serviceable','escapement_fault','weakens','moderate','The pallet/fork was re-checked and found serviceable.'),
  ('lock_acceptable','escapement','lock_drop','acceptable','escapement_fault','weakens','strong','Lock, drop and action appear acceptable.'),
  ('lock_fails','escapement','lock_drop','fails_lock','escapement_fault','supports','strong','The escapement fails to lock correctly.'),
  ('lock_unsafe','escapement','lock_drop','insufficient','escapement_fault','supports','strong','Lock is insufficient or unsafe.'),
  ('lock_excessive','escapement','lock_drop','excessive','escapement_fault','supports','strong','Lock/drop is excessive.'),
  ('inspection_balance_serviceable_pivot','inspection','balance','serviceable','balance_pivot_jewel_fault','weakens','moderate','General balance inspection found the assembly serviceable.'),
  ('inspection_balance_pivot','inspection','balance','pivot_staff','balance_pivot_jewel_fault','supports','strong','A balance pivot/staff issue was identified.'),
  ('pivot_jewel_serviceable','balance','pivot_jewel_check','serviceable','balance_pivot_jewel_fault','weakens','strong','Balance pivots and jewels were specifically found serviceable.'),
  ('pivot_damage','balance','pivot_jewel_check','pivot_damage','balance_pivot_jewel_fault','supports','strong','Balance pivot/staff damage was observed.'),
  ('balance_jewel_damage','balance','pivot_jewel_check','jewel_damage','balance_pivot_jewel_fault','supports','strong','Balance jewel damage or displacement was observed.'),
  ('balance_endshake','balance','pivot_jewel_check','endshake','balance_pivot_jewel_fault','supports','moderate','Balance endshake/seating is abnormal.'),
  ('balance_freedom_normal_pivot','balance','freedom_endshake','normal','balance_pivot_jewel_fault','weakens','moderate','Balance freedom and endshake are normal after installation.'),
  ('balance_freedom_no_pivot','balance','freedom_endshake','no_freedom','balance_pivot_jewel_fault','supports','moderate','The balance lacks free oscillation; pivot/jewel restriction remains plausible.'),
  ('inspection_balance_serviceable_hair','inspection','balance','serviceable','hairspring_fault','weakens','moderate','General balance/hairspring inspection found the assembly serviceable.'),
  ('inspection_balance_hairspring','inspection','balance','hairspring','hairspring_fault','supports','strong','A hairspring issue was identified.'),
  ('hairspring_free','balance','hairspring_check','free_centered','hairspring_fault','weakens','strong','The hairspring is free and centred with no observed interference.'),
  ('hairspring_touching','balance','hairspring_check','touching','hairspring_fault','supports','strong','The hairspring is touching or interfering.'),
  ('hairspring_deformed','balance','hairspring_check','deformed','hairspring_fault','supports','strong','The hairspring is deformed or has uneven coils.'),
  ('hairspring_stud','balance','hairspring_check','stud_collet','hairspring_fault','supports','strong','A stud/collet issue was identified.'),
  ('hairspring_clearance','balance','hairspring_check','clearance','hairspring_fault','supports','strong','Hairspring/bridge clearance is abnormal.'),
  ('balance_freedom_hairspring','balance','balance_freedom_detail','hairspring','hairspring_fault','supports','strong','The balance freedom issue was localised to hairspring contact or geometry.'),
  ('inspection_balance_serviceable_roller','inspection','balance','serviceable','roller_impulse_fault','weakens','moderate','General balance inspection found the roller/impulse system serviceable.'),
  ('inspection_balance_roller','inspection','balance','roller_impulse','roller_impulse_fault','supports','strong','A roller/impulse-jewel issue was identified.'),
  ('roller_serviceable','balance','roller_check','serviceable','roller_impulse_fault','weakens','strong','The roller and impulse jewel were specifically found serviceable.'),
  ('roller_impulse_jewel','balance','roller_check','impulse_jewel','roller_impulse_fault','supports','strong','An impulse-jewel issue was observed.'),
  ('roller_table','balance','roller_check','roller_table','roller_impulse_fault','supports','strong','A roller-table issue was observed.'),
  ('roller_safety','balance','roller_check','safety_action','roller_impulse_fault','supports','strong','Safety/guard action around the roller is abnormal.'),
  ('lubrication_correct','lubrication_final_assembly','lubrication_visual','correct','lubrication_contamination','weakens','strong','Final lubrication inspection appears correct.'),
  ('lubrication_over','lubrication_final_assembly','lubrication_visual','over_oiled','lubrication_contamination','supports','strong','Over-oiling was observed.'),
  ('lubrication_dry','lubrication_final_assembly','lubrication_visual','dry_point','lubrication_contamination','supports','strong','A required lubrication point appears dry.'),
  ('lubrication_dirty','lubrication_final_assembly','lubrication_visual','contamination','lubrication_contamination','supports','strong','Contamination is present after assembly.'),
  ('lubrication_migration','lubrication_final_assembly','lubrication_visual','migration','lubrication_contamination','supports','strong','Lubricant migration was observed.'),
  ('postclean_contamination','cleaning','post_clean_inspection','contamination_remains','lubrication_contamination','supports','moderate','Contamination remains after the cleaning process.'),
  ('rinse_clean','cleaning','rinse_dry','satisfactory','lubrication_contamination','weakens','moderate','Components were clean, rinsed and dry after cleaning.'),
  ('retention_normal','movement_removal','case_retention','normal','movement_retention_distortion','weakens','moderate','Movement retention was normal and serviceable on removal.'),
  ('retention_distorting','movement_removal','case_retention','distorting','movement_retention_distortion','supports','strong','Existing retention appears to distort the movement.'),
  ('movement_secure','casing','movement_security','secure','movement_retention_distortion','weakens','strong','The movement is secure without distortion after casing.'),
  ('movement_shifts','casing','movement_security','shifts','movement_retention_distortion','supports','strong','The movement shifts in the case.'),
  ('movement_retention_issue','casing','movement_security','retention','movement_retention_distortion','supports','strong','A clamp/ring/spacer retention issue was observed.'),
  ('movement_distortion','casing','movement_security','distortion','movement_retention_distortion','supports','strong','Retention may be distorting the movement.'),
  ('hands_clear','casing','hand_clearance','clear','hand_clearance_fault','weakens','strong','Hands clear each other, the dial and crystal through the full cycle.'),
  ('hands_touch','casing','hand_clearance','hand_hand','hand_clearance_fault','supports','strong','Hand-to-hand contact was observed.'),
  ('hands_dial','casing','hand_clearance','dial','hand_clearance_fault','supports','strong','A hand is contacting the dial or markers.'),
  ('hands_crystal','casing','hand_clearance','crystal','hand_clearance_fault','supports','strong','A hand is contacting the crystal.')
on conflict (rule_key) do update set
  step_key=excluded.step_key, check_key=excluded.check_key, answer_value=excluded.answer_value,
  hypothesis_key=excluded.hypothesis_key, effect=excluded.effect, strength=excluded.strength,
  rationale=excluded.rationale, active=true;

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
        when m.effect = 'supports' then m.weight
        when m.effect = 'weakens' then -m.weight
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
  )
  select
    a.hypothesis_key,
    a.title,
    a.description,
    a.category,
    case
      when a.has_confirm then 'confirmed'
      when a.has_rule_out and a.supports_count = 0 then 'ruled_out'
      when a.score >= 5 then 'strongly_supported'
      when a.score >= 2 then 'supported'
      when a.score <= -3 then 'weak'
      else 'possible'
    end as support_state,
    a.score,
    a.evidence_count,
    a.supports_count,
    a.against_count,
    (a.supports_count > 0 and a.against_count > 0) as contradiction,
    coalesce(a.evidence_for, '[]'::jsonb),
    coalesce(a.evidence_against, '[]'::jsonb)
  from aggregated a
  order by
    case
      when a.has_confirm then 0
      when a.score >= 5 then 1
      when a.score >= 2 then 2
      when a.score > -3 then 3
      when a.has_rule_out and a.supports_count = 0 then 5
      else 4
    end,
    a.score desc,
    a.sequence,
    a.title;
$$;

revoke all on function public.get_work_diagnostic_graph(uuid, uuid) from public, anon;
grant execute on function public.get_work_diagnostic_graph(uuid, uuid) to authenticated;
