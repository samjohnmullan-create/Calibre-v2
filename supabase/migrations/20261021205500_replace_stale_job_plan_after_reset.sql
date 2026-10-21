-- Allow a freshly re-induced Work to replace the zero-progress checklist left by a workshop reset.
-- The previous plan is preserved in Work history; checklist execution rows are only retired when
-- every existing checklist step is still not_started.

create or replace function public.apply_work_job_plan(
  p_workspace_id uuid,
  p_work_id uuid,
  p_actions text[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records%rowtype;
  v_action text;
  v_count integer := 0;
  v_final_label text;
  v_final_description text;
  v_previous_actions jsonb := '[]'::jsonb;
  v_previous_checklist_count integer := 0;
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

  foreach v_action in array p_actions loop
    if v_action <> all(array[
      'mechanical_service','repair_fault','regulation_timing','crystal_replacement','case_clean',
      'dial_hands','strap_bracelet','movement_replacement','restoration','further_diagnosis',
      'listing_prep','sell_as_is','donor','other'
    ]::text[]) then
      raise exception 'Unsupported planned action: %', v_action;
    end if;
  end loop;

  -- A workshop restart intentionally retains the old plan until induction is completed again.
  -- At that point job_plan_status is ready, while the retained checklist has been reset to
  -- not_started. Treat that exact state as a safe replacement boundary rather than an error.
  if exists (
    select 1 from public.work_checklist_steps
    where workspace_id = p_workspace_id and work_id = p_work_id
  ) then
    if v_work.job_plan_status = 'ready'
       and not exists (
         select 1 from public.work_checklist_steps
         where workspace_id = p_workspace_id
           and work_id = p_work_id
           and status <> 'not_started'
       ) then
      select count(*) into v_previous_checklist_count
      from public.work_checklist_steps
      where workspace_id = p_workspace_id and work_id = p_work_id;

      select coalesce(jsonb_agg(
        jsonb_build_object(
          'action_key', action_key,
          'label', label,
          'sequence', sequence,
          'status', status,
          'procedure_template_id', procedure_template_id
        ) order by sequence
      ), '[]'::jsonb)
      into v_previous_actions
      from public.work_plan_actions
      where workspace_id = p_workspace_id and work_id = p_work_id;

      insert into public.work_events(
        workspace_id, work_id, item_id, event_type, summary, details
      ) values (
        p_workspace_id,
        p_work_id,
        v_work.item_id,
        'job_plan_replaced',
        'Previous job plan retired after workshop reset',
        jsonb_build_object(
          'previous_actions', v_previous_actions,
          'previous_checklist_steps', v_previous_checklist_count,
          'replacement_actions', to_jsonb(p_actions),
          'reason', 'Workshop was reset and re-induced before a new job plan was selected'
        )
      );

      -- Step checks cascade; media links to retired checklist steps are safely set null by FK.
      delete from public.work_checklist_steps
      where workspace_id = p_workspace_id and work_id = p_work_id;

      -- Preserve plan-action rows for auditability and reactivate only actions selected below.
      update public.work_plan_actions
      set status = 'cancelled', updated_at = now()
      where workspace_id = p_workspace_id
        and work_id = p_work_id
        and status <> 'cancelled';
    else
      raise exception 'This Work already has checklist progress. Restart the workshop before replacing its job plan';
    end if;
  end if;

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
  on conflict (work_id, action_key) do update
    set label = excluded.label,
        sequence = excluded.sequence,
        procedure_template_id = excluded.procedure_template_id,
        status = 'planned',
        notes = '',
        updated_at = now();

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
    (a.sequence * 1000) + s.sequence,
    s.required
  from public.work_plan_actions a
  join public.work_template_steps s
    on s.workspace_id = p_workspace_id and s.template_id = a.procedure_template_id
  where a.workspace_id = p_workspace_id
    and a.work_id = p_work_id
    and a.status = 'planned'
    and s.step_key <> 'final_qc'
  order by a.sequence, s.sequence;

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
    and a.procedure_template_id is null;

  if p_actions <@ array['sell_as_is','donor']::text[] then
    v_final_label := 'Disposition review';
    v_final_description := 'Confirm the final disposition, required disclosures, evidence and inventory/financial history before closing Work.';
  else
    v_final_label := 'Final QC';
    v_final_description := 'Compare finished function, condition and timing against the induction baseline. Confirm required evidence and unresolved findings before closing Work.';
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
      next_action = coalesce((
        select label from public.work_checklist_steps
        where workspace_id = p_workspace_id and work_id = p_work_id
          and status not in ('done','na')
        order by sequence limit 1
      ), 'Review job plan'),
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_work_id;

  insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details)
  values (
    p_workspace_id, p_work_id, v_work.item_id,
    'job_plan_applied',
    case when v_previous_checklist_count > 0 then 'Replacement job plan created after workshop reset' else 'Job plan created after induction' end,
    jsonb_build_object(
      'actions', to_jsonb(p_actions),
      'checklist_steps', v_count,
      'replaced_previous_plan', v_previous_checklist_count > 0
    )
  );

  return v_count;
end;
$function$;

revoke all on function public.apply_work_job_plan(uuid, uuid, text[]) from public, anon;
grant execute on function public.apply_work_job_plan(uuid, uuid, text[]) to authenticated;
