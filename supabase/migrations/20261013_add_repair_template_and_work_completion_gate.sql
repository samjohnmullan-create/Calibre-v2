-- Add a targeted repair workflow and enforce required checklist completion before Work can be closed.

insert into public.work_templates (workspace_id, slug, name, work_type, version, description, is_active)
select w.id, 'mechanical-repair', 'Mechanical repair', 'repair', 1,
       'Targeted mechanical repair workflow with diagnosis, repair evidence, reassembly, verification and QC.', true
from public.workspaces w
on conflict (workspace_id, slug, version) do nothing;

insert into public.work_template_steps (workspace_id, template_id, step_key, section_key, label, description, sequence, required)
select t.workspace_id, t.id, s.step_key, s.section_key, s.label, s.description, s.sequence, s.required
from public.work_templates t
cross join (values
  ('intake_fault','intake','Intake & reported fault','Record symptoms, presented condition and what is known before intervention.',10,true),
  ('initial_function','intake','Initial functional checks','Check winding, setting, running, hands, complications and timing where safe and useful.',20,false),
  ('diagnosis','diagnosis','Diagnosis','Identify the fault or narrow it to a documented working diagnosis before repair.',30,true),
  ('access','disassembly','Case / movement access','Open and remove the movement or relevant assembly safely; record notable findings.',40,true),
  ('targeted_disassembly','disassembly','Targeted disassembly','Disassemble only what is needed for the repair while recording related defects.',50,true),
  ('repair_parts','repair','Repair / replace parts','Carry out the repair or replacement and record parts used, donor source and fit evidence where relevant.',60,true),
  ('clean_affected','repair','Clean affected assemblies','Clean affected components/assemblies where the repair requires it.',70,false),
  ('reassembly_lubrication','assembly','Reassembly & lubrication','Reassemble affected systems and lubricate appropriately for the work performed.',80,true),
  ('functional_verification','verification','Functional verification','Verify the repaired function and check for secondary faults introduced or uncovered during work.',90,true),
  ('regulation_timing','verification','Regulation / timing','Regulate and capture timing evidence where applicable to the repaired movement.',100,false),
  ('casing_presentation','verification','Casing & presentation','Case the movement and verify controls, hands, clearance and presentation.',110,true),
  ('final_qc','qc','Final QC','Confirm repaired function, cleanliness, controls and any applicable timing/QC requirements before completion.',120,true)
) as s(step_key,section_key,label,description,sequence,required)
where t.slug='mechanical-repair' and t.version=1
on conflict (template_id, step_key) do nothing;

create or replace function public.enforce_work_completion_gate()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status = 'on_bench' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'complete' and old.status is distinct from 'complete' then
    if exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = new.workspace_id
        and s.work_id = new.id
    ) and exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = new.workspace_id
        and s.work_id = new.id
        and s.required
        and s.status not in ('done','na')
    ) then
      raise exception 'Complete all required checklist steps before closing this Work record';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists work_records_completion_gate on public.work_records;
create trigger work_records_completion_gate
before update on public.work_records
for each row execute function public.enforce_work_completion_gate();
