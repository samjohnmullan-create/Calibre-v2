create or replace function public.apply_work_job_plan(p_workspace_id uuid, p_work_id uuid, p_actions text[])
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_work public.work_records%rowtype;
  v_action text;
  v_count integer := 0;
  v_final_label text;
  v_final_description text;
  v_has_service boolean := false;
  v_has_repair boolean := false;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id;
  if not found then raise exception 'Work record not found'; end if;

  if v_work.induction_status not in ('complete','legacy_skipped') then
    raise exception 'Complete Workshop Induction before creating the job plan';
  end if;
  if v_work.job_plan_status = 'applied' then
    raise exception 'This Work already has an applied job plan';
  end if;
  if coalesce(cardinality(p_actions),0) = 0 then
    raise exception 'Choose at least one planned action';
  end if;
  if exists (select 1 from public.work_checklist_steps where workspace_id = p_workspace_id and work_id = p_work_id) then
    raise exception 'A checklist already exists for this Work';
  end if;

  foreach v_action in array p_actions loop
    if v_action <> all(array[
      'mechanical_service','repair_fault','regulation_timing','crystal_replacement','case_clean',
      'dial_hands','strap_bracelet','movement_replacement','restoration','further_diagnosis',
      'listing_prep','sell_as_is','donor','other'
    ]::text[]) then
      raise exception 'Unsupported planned action: %', v_action;
    end if;
  end loop;

  v_has_service := 'mechanical_service' = any(p_actions);
  v_has_repair := 'repair_fault' = any(p_actions);

  insert into public.work_plan_actions (
    workspace_id, work_id, item_id, action_key, label, sequence, procedure_template_id
  )
  select
    p_workspace_id,
    v_work.id,
    v_work.item_id,
    a.action_key,
    case a.action_key
      when 'mechanical_service' then 'Full mechanical service'
      when 'repair_fault' then 'Repair fault'
      when 'regulation_timing' then 'Regulation / timing'
      when 'crystal_replacement' then 'Crystal replacement'
      when 'case_clean' then 'Case clean / polish'
      when 'dial_hands' then 'Dial / hand work'
      when 'strap_bracelet' then 'Strap / bracelet'
      when 'movement_replacement' then 'Movement replacement'
      when 'restoration' then 'Restoration'
      when 'further_diagnosis' then 'Further diagnosis'
      when 'listing_prep' then 'Prepare for sale'
      when 'sell_as_is' then 'No repair / sell as-is'
      when 'donor' then 'Convert to donor'
      else 'Other workshop work'
    end,
    (a.ordinality::integer * 10),
    (
      select wt.id
      from public.work_templates wt
      where wt.workspace_id = p_workspace_id
        and wt.is_active
        and wt.slug = case a.action_key
          when 'mechanical_service' then 'mechanical-service'
          when 'repair_fault' then 'mechanical-repair'
          else '__no_procedure__'
        end
      order by wt.version desc
      limit 1
    )
  from unnest(p_actions) with ordinality as a(action_key, ordinality)
  on conflict (work_id, action_key) do nothing;

  if v_has_service then
    update public.work_plan_actions
    set notes = case action_key
      when 'repair_fault' then 'Included within Full mechanical service; only additional diagnosis and repair checkpoints are generated.'
      when 'regulation_timing' then 'Included within Full mechanical service regulation stage.'
      else notes
    end,
    updated_at = now()
    where workspace_id = p_workspace_id
      and work_id = p_work_id
      and action_key in ('repair_fault','regulation_timing');
  elsif v_has_repair and 'regulation_timing' = any(p_actions) then
    update public.work_plan_actions
    set notes = 'Included within Repair fault regulation/timing stage.',
        updated_at = now()
    where workspace_id = p_workspace_id
      and work_id = p_work_id
      and action_key = 'regulation_timing';
  end if;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id, plan_action_id, phase,
    step_key, section_key, label, description, sequence, required
  )
  select
    p_workspace_id,
    v_work.id,
    v_work.item_id,
    a.procedure_template_id,
    s.id,
    a.id,
    'procedure',
    a.action_key || ':' || s.step_key,
    s.section_key,
    s.label,
    s.description,
    case
      when v_has_service and a.action_key = 'repair_fault' and s.step_key = 'diagnosis' then 10061
      when v_has_service and a.action_key = 'repair_fault' and s.step_key = 'repair_parts' then 10062
      else (a.sequence * 1000) + s.sequence
    end,
    s.required
  from public.work_plan_actions a
  join public.work_template_steps s
    on s.workspace_id = p_workspace_id and s.template_id = a.procedure_template_id
  where a.workspace_id = p_workspace_id
    and a.work_id = p_work_id
    and a.status = 'planned'
    and s.step_key <> 'final_qc'
    and (
      a.action_key <> 'repair_fault'
      or not v_has_service
      or s.step_key in ('diagnosis','repair_parts')
    )
  order by
    case
      when v_has_service and a.action_key = 'repair_fault' and s.step_key = 'diagnosis' then 10061
      when v_has_service and a.action_key = 'repair_fault' and s.step_key = 'repair_parts' then 10062
      else (a.sequence * 1000) + s.sequence
    end;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id, plan_action_id, phase,
    step_key, section_key, label, description, sequence, required
  )
  select
    p_workspace_id,
    v_work.id,
    v_work.item_id,
    null,
    null,
    a.id,
    'procedure',
    a.action_key || ':complete',
    'planned_work',
    a.label,
    case a.action_key
      when 'regulation_timing' then 'Complete the planned regulation/timing work and capture timing evidence.'
      when 'crystal_replacement' then 'Complete the crystal replacement and capture fit/presentation evidence.'
      when 'case_clean' then 'Complete the planned case clean/polish without altering finishes beyond the intended scope.'
      when 'dial_hands' then 'Complete the planned dial/hand work and confirm alignment and clearance.'
      when 'strap_bracelet' then 'Complete the strap/bracelet work and confirm secure attachment.'
      when 'movement_replacement' then 'Complete the movement replacement and confirm winding, setting, fit and casing.'
      when 'restoration' then 'Complete the agreed restoration scope and capture evidence of the result.'
      when 'further_diagnosis' then 'Investigate the induction findings and record a diagnosis before deciding further work.'
      when 'listing_prep' then 'Complete sale preparation, presentation and required listing evidence.'
      when 'sell_as_is' then 'Record the as-is decision, unresolved findings and sale disclosure requirements.'
      when 'donor' then 'Record the donor decision and preserve the Item cost/history before harvesting any parts.'
      else 'Complete this planned action and record the result.'
    end,
    (a.sequence * 1000) + 500,
    true
  from public.work_plan_actions a
  where a.workspace_id = p_workspace_id
    and a.work_id = p_work_id
    and a.status = 'planned'
    and a.procedure_template_id is null
    and not (
      a.action_key = 'regulation_timing'
      and (v_has_service or v_has_repair)
    );

  if p_actions <@ array['sell_as_is','donor']::text[] then
    v_final_label := 'Disposition review';
    v_final_description := 'Confirm the final disposition, required disclosures, evidence and inventory/financial history before closing Work.';
  else
    v_final_label := 'Final Verification';
    v_final_description := 'Compare finished function, condition and timing against the induction baseline. Confirm required evidence and unresolved findings before Release.';
  end if;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id, plan_action_id, phase,
    step_key, section_key, label, description, sequence, required
  ) values (
    p_workspace_id, v_work.id, v_work.item_id, null, null, null, 'final_qc',
    'final_qc', 'qc', v_final_label, v_final_description, 900000, true
  );

  select count(*) into v_count
  from public.work_checklist_steps
  where workspace_id = p_workspace_id and work_id = p_work_id;

  update public.work_records
  set job_plan_status = 'applied',
      type = case
        when 'mechanical_service' = any(p_actions) then 'service'
        when 'repair_fault' = any(p_actions) or 'crystal_replacement' = any(p_actions) or 'movement_replacement' = any(p_actions) then 'repair'
        when 'restoration' = any(p_actions) then 'restoration'
        when 'case_clean' = any(p_actions) then 'cleaning'
        when 'further_diagnosis' = any(p_actions) then 'assessment'
        when 'listing_prep' = any(p_actions) then 'listing_prep'
        else type
      end,
      status = case when status = 'queued' then 'ready' else status end,
      next_action = '',
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_work_id;

  insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details)
  values (
    p_workspace_id, p_work_id, v_work.item_id,
    'job_plan_applied', 'Job plan created after induction',
    jsonb_build_object('actions', to_jsonb(p_actions), 'checklist_steps', v_count, 'composite_plan_normalized', true)
  );

  return v_count;
end;
$function$;
