with seed(step_key,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,answer_kind,answer_options,activation_rule,problem_values) as (
values
('intake_fault','review_induction_findings','Review induction findings','Review the induction findings and confirm they describe the active fault state before repair work starts.',10,true,'decision','diagnosis','diagnosis',false,'choice','[{"label":"Findings are clear","value":"clear"},{"label":"More context needed","value":"more_context"},{"label":"Findings conflict","value":"conflict"}]'::jsonb,'{}'::jsonb,'["more_context","conflict"]'::jsonb),
('intake_fault','fault_priority','Choose the fault to solve first','Choose the primary fault path for this repair. Other induction findings remain recorded and are not discarded.',20,true,'decision','diagnosis','diagnosis',false,'choice','[{"label":"Winding / keyless","value":"winding_keyless"},{"label":"Barrel / power","value":"barrel_power"},{"label":"Train","value":"train"},{"label":"Escapement","value":"escapement"},{"label":"Balance / hairspring","value":"balance"},{"label":"Casing / retention","value":"casing"},{"label":"Hands / motion works","value":"hands_motion"},{"label":"Multiple related faults","value":"multiple"},{"label":"Still uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["uncertain"]'::jsonb),
('initial_function','reproduce_fault','Reproduce the reported fault safely','Verify the reported behaviour without forcing the mechanism or adding unnecessary power.',10,true,'inspection','diagnosis','diagnosis',false,'choice','[{"label":"Fault reproduced","value":"reproduced"},{"label":"Intermittent","value":"intermittent"},{"label":"Not reproduced","value":"not_reproduced"},{"label":"Unsafe / inappropriate to test","value":"unsafe"}]'::jsonb,'{}'::jsonb,'["intermittent","not_reproduced","unsafe"]'::jsonb),
('initial_function','fault_state_note','Describe the uncertain fault state','Record what changed, when the symptom appears, or why direct testing is not appropriate.',20,true,'observation','diagnosis','diagnosis',true,'text','[]'::jsonb,'{"parent_key":"reproduce_fault","values":["intermittent","not_reproduced","unsafe"]}'::jsonb,'[]'::jsonb),
('diagnosis','diagnostic_path','Identify the leading fault system','Choose the system best supported by the evidence so far. This is a working diagnosis, not a final conclusion.',10,true,'decision','diagnosis','diagnosis',false,'choice','[{"label":"Internal keyless / winding","value":"internal_keyless"},{"label":"Case / crown / stem alignment","value":"casing_stem"},{"label":"Barrel / mainspring","value":"barrel_power"},{"label":"Train resistance","value":"train"},{"label":"Escapement","value":"escapement"},{"label":"Balance / hairspring","value":"balance"},{"label":"Hands / motion works","value":"hands_motion"},{"label":"Multiple systems","value":"multiple"},{"label":"Still uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["uncertain"]'::jsonb),
('diagnosis','diagnostic_basis','Grade the diagnostic basis','Record how directly the current diagnosis is supported.',20,true,'decision','diagnosis','diagnosis',false,'choice','[{"label":"Direct physical evidence","value":"direct"},{"label":"Several supporting observations","value":"supported"},{"label":"Working hypothesis only","value":"hypothesis"},{"label":"Evidence still insufficient","value":"insufficient"}]'::jsonb,'{}'::jsonb,'["hypothesis","insufficient"]'::jsonb),
('diagnosis','next_discriminating_check','Record the next discriminating check','State the next check that would most efficiently separate the remaining plausible causes.',30,false,'observation','diagnosis','diagnosis',true,'text','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('access','safe_access','Open and support the watch safely','Open the case and support the movement without forcing the stem release, case back or movement retention.',10,true,'action','','',false,'status','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('access','uncased_comparison','Compare the symptom with the movement uncased','Where relevant, compare the reported function with the movement supported clear of the case and crown tube.',20,true,'inspection','diagnosis','casing',false,'choice','[{"label":"Becomes smooth / normal uncased","value":"smooth_uncased"},{"label":"Improves but remains abnormal","value":"improves_uncased"},{"label":"Same fault uncased","value":"same_uncased"},{"label":"Worse uncased","value":"worse_uncased"},{"label":"Not applicable to this fault","value":"na"},{"label":"Comparison uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["improves_uncased","same_uncased","worse_uncased","uncertain"]'::jsonb),
('access','uncased_comparison_detail','Describe the cased / uncased difference','Record exactly which function changes and how.',30,true,'observation','diagnosis','casing',true,'text','[]'::jsonb,'{"parent_key":"uncased_comparison","values":["improves_uncased","same_uncased","worse_uncased","uncertain"]}'::jsonb,'[]'::jsonb),
('targeted_disassembly','target_assembly','Choose the assembly to inspect','Select the assembly implicated by the evidence. Avoid dismantling unrelated systems unless later evidence calls for it.',10,true,'decision','diagnosis','diagnosis',false,'choice','[{"label":"Keyless / winding works","value":"keyless"},{"label":"Barrel / mainspring","value":"barrel"},{"label":"Train","value":"train"},{"label":"Escapement","value":"escapement"},{"label":"Balance / hairspring","value":"balance"},{"label":"Motion works / hands","value":"motion_works"},{"label":"Case / crown / retention","value":"casing"},{"label":"Multiple assemblies","value":"multiple"},{"label":"Still uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["uncertain"]'::jsonb),
('targeted_disassembly','disassemble_target','Disassemble only the implicated assembly','Expose the selected system far enough to inspect it properly, preserving orientation and parts evidence.',20,true,'action','','',false,'status','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('targeted_disassembly','target_condition','Inspect the implicated assembly','Record the directly observed condition after access.',30,true,'inspection','diagnosis','diagnosis',false,'choice','[{"label":"Serviceable / no fault seen","value":"serviceable"},{"label":"Wear","value":"wear"},{"label":"Damage / breakage","value":"damage"},{"label":"Contamination / dried lubricant","value":"contamination"},{"label":"Misalignment / poor seating","value":"misalignment"},{"label":"Loose / insecure component","value":"loose"},{"label":"Condition uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["wear","damage","contamination","misalignment","loose","uncertain"]'::jsonb),
('targeted_disassembly','target_condition_detail','Describe the observed fault','Record the component, contact point or geometry actually observed. Do not infer beyond the visible evidence.',40,true,'observation','diagnosis','diagnosis',true,'text','[]'::jsonb,'{"parent_key":"target_condition","values":["wear","damage","contamination","misalignment","loose","uncertain"]}'::jsonb,'[]'::jsonb),
('repair_parts','repair_path','Choose the repair path','Choose the least invasive path supported by the observed fault.',10,true,'decision','parts','repair',false,'choice','[{"label":"Adjust / correct geometry","value":"adjust"},{"label":"Clean / restore freedom","value":"clean"},{"label":"Reseat / realign","value":"realign"},{"label":"Repair existing part","value":"repair_part"},{"label":"Replace part","value":"replace_part"},{"label":"No repair required","value":"none"},{"label":"Parts required before continuing","value":"needs_parts"},{"label":"Still uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["needs_parts","uncertain"]'::jsonb),
('repair_parts','parts_path','Decide how to source the required part','Record the current sourcing path before the job advances.',20,true,'decision','parts','parts',false,'choice','[{"label":"Part already in stock","value":"in_stock"},{"label":"Order / source replacement","value":"order"},{"label":"Use compatible donor","value":"donor"},{"label":"Research exact part first","value":"research"},{"label":"Part currently unavailable","value":"unavailable"}]'::jsonb,'{"parent_key":"repair_path","values":["replace_part","needs_parts"]}'::jsonb,'["research","unavailable"]'::jsonb),
('repair_parts','perform_repair','Perform the targeted repair','Carry out the approved repair or replacement without expanding the scope unnecessarily.',30,true,'action','','',false,'status','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('repair_parts','repair_result','Check the immediate repair result','Re-test the affected mechanism before cleaning/reassembly hides useful evidence.',40,true,'inspection','diagnosis','repair',false,'choice','[{"label":"Fault corrected","value":"corrected"},{"label":"Improved but not corrected","value":"improved"},{"label":"No meaningful change","value":"no_change"},{"label":"Worse","value":"worse"},{"label":"Not yet verifiable","value":"unverified"}]'::jsonb,'{}'::jsonb,'["improved","no_change","worse","unverified"]'::jsonb),
('repair_parts','repair_result_detail','Describe the unresolved repair result','Record what remains abnormal and what changed after the repair attempt.',50,true,'observation','diagnosis','repair',true,'text','[]'::jsonb,'{"parent_key":"repair_result","values":["improved","no_change","worse","unverified"]}'::jsonb,'[]'::jsonb),
('clean_affected','cleaning_scope','Decide the cleaning scope','Confirm whether the affected assembly needs cleaning before final reassembly.',10,true,'decision','','cleaning',false,'choice','[{"label":"Cleaning required","value":"required"},{"label":"Already clean / no cleaning needed","value":"not_required"},{"label":"Cleaning inappropriate for this repair","value":"inappropriate"},{"label":"Uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["uncertain"]'::jsonb),
('clean_affected','clean_affected_action','Clean the affected assembly','Clean the implicated components using the appropriate method and protect sensitive finishes/materials.',20,true,'action','','',false,'status','[]'::jsonb,'{"parent_key":"cleaning_scope","values":["required"]}'::jsonb,'[]'::jsonb),
('clean_affected','post_clean_condition','Inspect after cleaning','Cleaning can reveal wear or damage that contamination was hiding.',30,true,'inspection','diagnosis','cleaning',false,'choice','[{"label":"Clean and serviceable","value":"serviceable"},{"label":"Contamination remains","value":"contamination"},{"label":"Wear / damage now visible","value":"damage"},{"label":"Condition uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["contamination","damage","uncertain"]'::jsonb),
('clean_affected','post_clean_detail','Describe the post-clean finding','Record the newly visible defect or remaining contamination.',40,true,'observation','diagnosis','cleaning',true,'text','[]'::jsonb,'{"parent_key":"post_clean_condition","values":["contamination","damage","uncertain"]}'::jsonb,'[]'::jsonb),
('reassembly_lubrication','lubrication_basis','Confirm lubrication basis','Use movement-specific guidance where available, otherwise clearly record the general bench practice being used.',10,false,'knowledge','knowledge','lubrication',false,'choice','[{"label":"Movement-specific reference","value":"documented"},{"label":"General bench practice","value":"general"},{"label":"Reference still needed","value":"missing"}]'::jsonb,'{}'::jsonb,'["missing"]'::jsonb),
('reassembly_lubrication','reassemble_affected','Reassemble the affected assembly','Reassemble the repaired system and apply only the lubrication required for that assembly.',20,true,'action','','',false,'status','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('reassembly_lubrication','post_reassembly_freedom','Check freedom after reassembly','Verify the repaired assembly operates freely before moving to full functional verification.',30,true,'inspection','diagnosis','repair',false,'choice','[{"label":"Smooth / correct","value":"smooth"},{"label":"Rough","value":"rough"},{"label":"Binds","value":"binds"},{"label":"Slips / disengages","value":"slips"},{"label":"Uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["rough","binds","slips","uncertain"]'::jsonb),
('reassembly_lubrication','post_reassembly_detail','Narrow the remaining resistance','Record where the remaining abnormality appears after reassembly.',40,true,'observation','diagnosis','repair',true,'text','[]'::jsonb,'{"parent_key":"post_reassembly_freedom","values":["rough","binds","slips","uncertain"]}'::jsonb,'[]'::jsonb),
('functional_verification','original_fault_verification','Re-test the original fault','Compare the original complaint with the repaired state.',10,true,'inspection','diagnosis','verification',false,'choice','[{"label":"Resolved","value":"resolved"},{"label":"Improved but remains","value":"improved"},{"label":"Unchanged","value":"unchanged"},{"label":"Worse","value":"worse"},{"label":"Uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["improved","unchanged","worse","uncertain"]'::jsonb),
('functional_verification','winding_verification','Verify winding','Check winding feel and engagement after the repair.',20,true,'inspection','diagnosis','keyless',false,'choice','[{"label":"Smooth / correct","value":"smooth"},{"label":"Rough","value":"rough"},{"label":"Grinding / crunchy","value":"grinding"},{"label":"Slips / disengages","value":"slips"},{"label":"Blocked","value":"blocked"},{"label":"Not applicable","value":"na"}]'::jsonb,'{}'::jsonb,'["rough","grinding","slips","blocked"]'::jsonb),
('functional_verification','setting_verification','Verify setting','Check setting engagement and feel after the repair.',30,false,'inspection','diagnosis','keyless',false,'choice','[{"label":"Smooth / correct","value":"smooth"},{"label":"Stiff","value":"stiff"},{"label":"Rough","value":"rough"},{"label":"Slips / disengages","value":"slips"},{"label":"Blocked","value":"blocked"},{"label":"Not applicable","value":"na"}]'::jsonb,'{}'::jsonb,'["stiff","rough","slips","blocked"]'::jsonb),
('functional_verification','noise_verification','Verify noise / feel','Check whether the abnormal sound or loose/crunchy feel remains.',40,false,'inspection','diagnosis','verification',false,'choice','[{"label":"Normal","value":"normal"},{"label":"Rough noise / feel","value":"rough"},{"label":"Crunching / scraping","value":"crunching"},{"label":"Loose movement / component feel","value":"loose"},{"label":"Uncertain","value":"uncertain"},{"label":"Not applicable","value":"na"}]'::jsonb,'{}'::jsonb,'["rough","crunching","loose","uncertain"]'::jsonb),
('functional_verification','running_verification','Verify running behaviour','Confirm the movement starts and sustains running after the repair.',50,false,'inspection','diagnosis','verification',false,'choice','[{"label":"Starts and sustains running","value":"sustained"},{"label":"Intermittent","value":"intermittent"},{"label":"Stops","value":"stops"},{"label":"Will not start normally","value":"wont_start"},{"label":"Not applicable","value":"na"}]'::jsonb,'{}'::jsonb,'["intermittent","stops","wont_start"]'::jsonb),
('functional_verification','verification_note','Record any remaining functional concern','Add a concise note if something remains unresolved or behaves differently from induction.',60,false,'observation','diagnosis','verification',true,'text','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('regulation_timing','timing_readiness','Decide whether timing is meaningful','Only time the movement when it runs consistently enough for the result to be useful.',10,true,'decision','timing','timing',false,'choice','[{"label":"Ready for timing","value":"ready"},{"label":"Not running reliably","value":"not_running"},{"label":"Trace / rate unstable","value":"unstable"},{"label":"Timing not required for this repair","value":"not_required"},{"label":"Uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["not_running","unstable","uncertain"]'::jsonb),
('regulation_timing','timing_run','Record timing run','Capture a timing run linked to this repair after functional verification.',20,true,'timing','timing','timing',true,'tool_result','[]'::jsonb,'{"parent_key":"timing_readiness","values":["ready"]}'::jsonb,'[]'::jsonb),
('regulation_timing','timing_review','Review the timing evidence','Classify the saved timing result before deciding whether regulation or further mechanical work is appropriate.',30,true,'decision','diagnosis','timing',false,'choice','[{"label":"Acceptable for this watch","value":"acceptable"},{"label":"Rate issue","value":"rate"},{"label":"Beat error issue","value":"beat_error"},{"label":"Unstable trace / rate","value":"unstable"},{"label":"Large positional spread","value":"positional"},{"label":"Poor signal / low confidence","value":"poor_signal"}]'::jsonb,'{"parent_key":"timing_readiness","values":["ready"]}'::jsonb,'["rate","beat_error","unstable","positional","poor_signal"]'::jsonb),
('regulation_timing','timing_issue_detail','Describe the timing concern','Record the pattern that needs regulation or further diagnosis.',40,true,'observation','diagnosis','timing',true,'text','[]'::jsonb,'{"parent_key":"timing_review","values":["rate","beat_error","unstable","positional","poor_signal"]}'::jsonb,'[]'::jsonb),
('casing_presentation','case_reassembly','Refit movement and case components','Reassemble the case, movement retention, crown/stem and external parts without introducing new load or misalignment.',10,true,'action','','',false,'status','[]'::jsonb,'{}'::jsonb,'[]'::jsonb),
('casing_presentation','cased_function_compare','Compare function after casing','Check whether casing changes the repaired behaviour.',20,true,'inspection','diagnosis','casing',false,'choice','[{"label":"Unchanged / remains correct","value":"unchanged_good"},{"label":"Improves when cased","value":"better_cased"},{"label":"Worse when cased","value":"worse_cased"},{"label":"Problem appears only when cased","value":"only_cased"},{"label":"Uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["better_cased","worse_cased","only_cased","uncertain"]'::jsonb),
('casing_presentation','crown_stem_cased','Verify crown / stem after casing','Confirm winding and setting remain correct with the case fully assembled.',30,true,'inspection','diagnosis','casing',false,'choice','[{"label":"Smooth / correct","value":"smooth"},{"label":"Rough","value":"rough"},{"label":"Grinding / crunchy","value":"grinding"},{"label":"Stiff","value":"stiff"},{"label":"Slips / disengages","value":"slips"},{"label":"Blocks","value":"blocks"},{"label":"Not applicable","value":"na"}]'::jsonb,'{}'::jsonb,'["rough","grinding","stiff","slips","blocks"]'::jsonb),
('casing_presentation','movement_security','Check movement security','Confirm clamps, ring, spacers and case fit hold the movement securely without distortion.',40,true,'inspection','diagnosis','casing',false,'choice','[{"label":"Secure without distortion","value":"secure"},{"label":"Movement shifts","value":"shifts"},{"label":"Retention hardware / spacer issue","value":"retention"},{"label":"Possible distortion under retention","value":"distortion"},{"label":"Uncertain","value":"uncertain"}]'::jsonb,'{}'::jsonb,'["shifts","retention","distortion","uncertain"]'::jsonb),
('casing_presentation','outstanding_external_findings','Review unresolved external findings','Confirm whether an induction finding outside the targeted mechanical repair still needs separate work or disclosure.',50,true,'decision','diagnosis','casing',false,'choice','[{"label":"None outstanding","value":"none"},{"label":"Crystal issue remains","value":"crystal"},{"label":"Case issue remains","value":"case"},{"label":"Dial / hands issue remains","value":"dial_hands"},{"label":"Strap / bracelet issue remains","value":"strap"},{"label":"Other issue remains","value":"other"}]'::jsonb,'{}'::jsonb,'["crystal","case","dial_hands","strap","other"]'::jsonb),
('casing_presentation','presentation_photo','Capture final presentation photo','Capture the repaired watch before Final QC.',60,false,'photo','photo','',true,'status','[]'::jsonb,'{}'::jsonb,'[]'::jsonb)
)
insert into public.work_template_step_checks(
 workspace_id,template_step_id,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,answer_kind,answer_options,activation_rule,problem_values
)
select s.workspace_id,s.id,x.check_key,x.label,x.description,x.sequence,x.required,x.check_type,x.tool_key,x.knowledge_scope,x.evidence_required,x.answer_kind,x.answer_options,x.activation_rule,x.problem_values
from public.work_templates t
join public.work_template_steps s on s.template_id=t.id and s.workspace_id=t.workspace_id
join seed x on x.step_key=s.step_key
where t.slug='mechanical-repair' and t.is_active
on conflict (template_step_id,check_key) do update set
 label=excluded.label,description=excluded.description,sequence=excluded.sequence,required=excluded.required,check_type=excluded.check_type,tool_key=excluded.tool_key,knowledge_scope=excluded.knowledge_scope,evidence_required=excluded.evidence_required,answer_kind=excluded.answer_kind,answer_options=excluded.answer_options,activation_rule=excluded.activation_rule,problem_values=excluded.problem_values;

create or replace function public.attach_plan_final_qc_template()
returns trigger
language plpgsql
set search_path='public'
as $$
declare
  v_template_id uuid;
  v_template_step_id uuid;
begin
  if new.step_key='final_qc' and new.template_step_id is null then
    select a.procedure_template_id,s.id
      into v_template_id,v_template_step_id
    from public.work_plan_actions a
    join public.work_template_steps s
      on s.workspace_id=new.workspace_id
     and s.template_id=a.procedure_template_id
     and s.step_key='final_qc'
    where a.workspace_id=new.workspace_id
      and a.work_id=new.work_id
      and a.procedure_template_id is not null
    order by a.sequence
    limit 1;
    if v_template_step_id is not null then
      new.template_id := v_template_id;
      new.template_step_id := v_template_step_id;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists work_checklist_steps_attach_plan_final_qc on public.work_checklist_steps;
create trigger work_checklist_steps_attach_plan_final_qc
before insert on public.work_checklist_steps
for each row execute function public.attach_plan_final_qc_template();

update public.work_checklist_steps wcs
set template_id=a.procedure_template_id,
    template_step_id=s.id
from public.work_plan_actions a
join public.work_template_steps s
  on s.template_id=a.procedure_template_id
 and s.workspace_id=a.workspace_id
 and s.step_key='final_qc'
where wcs.workspace_id=a.workspace_id
  and wcs.work_id=a.work_id
  and wcs.step_key='final_qc'
  and wcs.template_step_id is null
  and a.procedure_template_id is not null
  and a.sequence=(select min(a2.sequence) from public.work_plan_actions a2 where a2.workspace_id=a.workspace_id and a2.work_id=a.work_id and a2.procedure_template_id is not null);

insert into public.work_step_checks(
 workspace_id,work_id,item_id,checklist_step_id,template_step_check_id,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,answer_kind,answer_options,activation_rule,problem_values,is_active,created_by
)
select wcs.workspace_id,wcs.work_id,wcs.item_id,wcs.id,c.id,c.check_key,c.label,c.description,c.sequence,c.required,c.check_type,c.tool_key,c.knowledge_scope,c.evidence_required,c.answer_kind,c.answer_options,c.activation_rule,c.problem_values,(c.activation_rule='{}'::jsonb),wcs.created_by
from public.work_checklist_steps wcs
join public.work_template_step_checks c on c.template_step_id=wcs.template_step_id
where wcs.template_step_id is not null
  and wcs.status not in ('done','na')
on conflict (checklist_step_id,check_key) do nothing;

update public.work_step_checks child
set parent_check_id=parent.id
from public.work_step_checks parent
where child.workspace_id=parent.workspace_id
  and child.checklist_step_id=parent.checklist_step_id
  and child.activation_rule<>'{}'::jsonb
  and child.activation_rule->>'parent_key'=parent.check_key
  and child.parent_check_id is null;
