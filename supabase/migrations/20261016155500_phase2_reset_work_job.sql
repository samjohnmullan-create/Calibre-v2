create or replace function public.reset_work_job(
  p_workspace_id uuid,
  p_work_id uuid,
  p_mode text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work public.work_records%rowtype;
  v_actor uuid := (select auth.uid());
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_event_type text;
  v_summary text;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = v_actor
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if p_mode not in ('procedure','workshop','test_clear') then
    raise exception 'Unsupported reset mode';
  end if;

  select * into v_work
  from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id
  for update;

  if not found then
    raise exception 'Work record not found';
  end if;

  if p_mode = 'test_clear' and v_work.data_mode <> 'test' then
    raise exception 'Clear Test/Demo is only available for test Work';
  end if;

  select jsonb_build_object(
    'reset_at', v_now,
    'mode', p_mode,
    'reason', nullif(trim(coalesce(p_reason,'')), ''),
    'work', jsonb_build_object(
      'status', v_work.status,
      'waiting_reason', v_work.waiting_reason,
      'blocker', v_work.blocker,
      'diagnosis', v_work.diagnosis,
      'repair_performed', v_work.repair_performed,
      'notes', v_work.notes,
      'completion_summary', v_work.completion_summary,
      'induction_status', v_work.induction_status,
      'job_plan_status', v_work.job_plan_status,
      'started_at', v_work.started_at,
      'completed_at', v_work.completed_at
    ),
    'induction_checks', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'label',label,'status',status,'notes',notes) order by sequence)
      from public.work_induction_checks
      where workspace_id=p_workspace_id and work_id=p_work_id
    ), '[]'::jsonb),
    'checklist_steps', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'label',label,'status',status,'notes',notes,'blocked_reason',blocked_reason,'started_at',started_at,'completed_at',completed_at) order by sequence)
      from public.work_checklist_steps
      where workspace_id=p_workspace_id and work_id=p_work_id
    ), '[]'::jsonb),
    'step_checks', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'label',label,'status',status,'result_text',result_text,'answer_value',answer_value,'problem_finding_id',problem_finding_id) order by sequence)
      from public.work_step_checks
      where workspace_id=p_workspace_id and work_id=p_work_id
    ), '[]'::jsonb),
    'component_states', coalesce((
      select jsonb_agg(jsonb_build_object('component',component_label,'state',state,'location',location,'notes',notes) order by sequence,component_label)
      from public.work_component_states
      where workspace_id=p_workspace_id and work_id=p_work_id
    ), '[]'::jsonb),
    'qc_checks', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'label',label,'status',status,'result_text',result_text,'evidence_note',evidence_note,'media_asset_id',media_asset_id) order by label)
      from public.work_qc_checks
      where workspace_id=p_workspace_id and work_id=p_work_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  update public.work_session_segments
  set ended_at = coalesce(ended_at, v_now), ended_by = coalesce(ended_by, v_actor)
  where workspace_id=p_workspace_id and work_id=p_work_id and ended_at is null;

  update public.work_sessions
  set ended_at = coalesce(ended_at, v_now),
      paused_at = null,
      ended_by = coalesce(ended_by, v_actor),
      note = trim(concat_ws(' · ', nullif(note,''), 'Closed by ' || replace(p_mode,'_',' ') || ' reset')),
      updated_at = v_now
  where workspace_id=p_workspace_id and work_id=p_work_id and ended_at is null;

  if p_mode in ('procedure','workshop') then
    update public.work_checklist_steps
    set status='not_started', notes='', blocked_reason='', started_at=null, completed_at=null, updated_at=v_now
    where workspace_id=p_workspace_id and work_id=p_work_id;

    update public.work_step_checks
    set status='not_started', result_text='', answer_value='', problem_finding_id=null,
        started_at=null, completed_at=null, completed_by=null, updated_at=v_now
    where workspace_id=p_workspace_id and work_id=p_work_id;

    update public.work_qc_checks
    set status='pending', result_text='', evidence_note='', media_asset_id=null,
        checked_by=null, checked_at=null, updated_at=v_now
    where workspace_id=p_workspace_id and work_id=p_work_id;

    update public.work_records
    set status='ready', waiting_reason=null, blocker='', completed_at=null,
        repair_performed='', completion_summary='', next_action='', updated_at=v_now
    where workspace_id=p_workspace_id and id=p_work_id;

    if p_mode = 'workshop' then
      update public.work_induction_checks
      set status='pending', notes='', updated_at=v_now
      where workspace_id=p_workspace_id and work_id=p_work_id;

      delete from public.work_component_states
      where workspace_id=p_workspace_id and work_id=p_work_id;

      update public.work_findings
      set status='not_actioned', updated_at=v_now
      where workspace_id=p_workspace_id and work_id=p_work_id and status in ('open','accepted');

      update public.part_allocations
      set status='released', released_at=coalesce(released_at,v_now), updated_at=v_now
      where workspace_id=p_workspace_id and work_record_id=p_work_id and status='reserved';

      update public.work_part_needs
      set status='cancelled', updated_at=v_now
      where workspace_id=p_workspace_id and work_record_id=p_work_id and status in ('open','reserved');

      update public.work_records
      set diagnosis='', notes='', started_at=null,
          induction_status='pending', induction_started_at=null, induction_completed_at=null,
          updated_at=v_now
      where workspace_id=p_workspace_id and id=p_work_id;

      v_event_type := 'workshop_restarted';
      v_summary := 'Workshop restarted from induction';
    else
      v_event_type := 'procedure_restarted';
      v_summary := 'Guided procedure restarted';
    end if;

    insert into public.work_events(workspace_id,work_id,item_id,event_type,summary,details,actor_id,actor_type)
    values (
      p_workspace_id,p_work_id,v_work.item_id,v_event_type,
      case when nullif(trim(coalesce(p_reason,'')),'') is null then v_summary else v_summary || ' · ' || trim(p_reason) end,
      jsonb_build_object('source','reset_job','reset_snapshot',v_snapshot),v_actor,'user'
    );
  else
    delete from public.cost_entries where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.research_requests where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.measurements where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.timing_runs where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.part_fit_evidence where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_qc_checks where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_component_states where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_part_needs where workspace_id=p_workspace_id and work_record_id=p_work_id;
    delete from public.work_plan_revisions where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_reasoning_runs where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_diagnostic_hypotheses where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_checklist_steps where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_plan_actions where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_findings where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_induction_checks where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_sessions where workspace_id=p_workspace_id and work_id=p_work_id;
    delete from public.work_events where workspace_id=p_workspace_id and work_id=p_work_id;

    update public.media_assets
    set work_id=null, work_checklist_step_id=null
    where workspace_id=p_workspace_id and work_id=p_work_id;

    update public.work_records
    set status='ready', waiting_reason=null, blocker='', next_action='',
        diagnosis='', repair_performed='', notes='', completion_summary='',
        started_at=null, completed_at=null,
        induction_status='pending', induction_started_at=null, induction_completed_at=null,
        job_plan_status='pending', updated_at=v_now
    where workspace_id=p_workspace_id and id=p_work_id;

    insert into public.work_events(workspace_id,work_id,item_id,event_type,summary,details,actor_id,actor_type)
    values (
      p_workspace_id,p_work_id,v_work.item_id,'test_work_cleared',
      case when nullif(trim(coalesce(p_reason,'')),'') is null then 'Test/Demo Work cleared' else 'Test/Demo Work cleared · ' || trim(p_reason) end,
      jsonb_build_object('source','reset_job','aggressive',true,'uploaded_media_retained_on_item',true),v_actor,'user'
    );
  end if;

  return jsonb_build_object(
    'mode', p_mode,
    'work_id', p_work_id,
    'data_mode', v_work.data_mode,
    'reset_at', v_now,
    'audit_preserved', p_mode <> 'test_clear'
  );
end;
$$;

revoke all on function public.reset_work_job(uuid,uuid,text,text) from public;
grant execute on function public.reset_work_job(uuid,uuid,text,text) to authenticated;
