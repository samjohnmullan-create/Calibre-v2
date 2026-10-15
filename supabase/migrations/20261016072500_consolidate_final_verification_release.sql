-- Final Verification owns the actual workshop tests. work_qc_checks now owns only the final Release sign-off.

update public.work_template_steps
set label = 'Final Verification',
    description = case when btrim(coalesce(description,'')) = '' then 'Verify final function, timing, presentation, unresolved issues and required evidence before release.' else description end
where step_key = 'final_qc';

update public.work_checklist_steps s
set label = 'Final Verification',
    updated_at = now()
where s.step_key = 'final_qc'
  and exists (
    select 1 from public.work_records w
    where w.id = s.work_id
      and w.workspace_id = s.workspace_id
      and w.status not in ('complete','cancelled')
  );

-- Preserve legacy QC rows as history, but stop asking the user to repeat
-- tests already owned by the structured Final Verification procedure.
update public.work_qc_checks q
set required = false,
    updated_at = now()
where q.check_key <> 'release_signoff'
  and q.required
  and exists (
    select 1 from public.work_records w
    where w.id = q.work_id
      and w.workspace_id = q.workspace_id
      and w.status not in ('complete','cancelled')
  );

insert into public.work_qc_checks(workspace_id,work_id,item_id,check_key,label,required)
select w.workspace_id,w.id,w.item_id,'release_signoff','Release sign-off — Final Verification reviewed',true
from public.work_records w
where w.status not in ('complete','cancelled')
  and w.type in ('inspection','service','repair','restoration','cleaning','assessment')
on conflict (workspace_id,work_id,check_key) do update
set label = excluded.label,
    required = true,
    updated_at = now();

create or replace function public.initialize_work_qc(p_workspace_id uuid, p_work_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_work public.work_records;
  v_before integer;
  v_after integer;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work
  from public.work_records
  where id = p_work_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Work record not found'; end if;

  select count(*) into v_before
  from public.work_qc_checks
  where workspace_id=p_workspace_id and work_id=p_work_id;

  if v_work.type in ('inspection','service','repair','restoration','cleaning','assessment') then
    insert into public.work_qc_checks(workspace_id,work_id,item_id,check_key,label,required)
    values (p_workspace_id,p_work_id,v_work.item_id,'release_signoff','Release sign-off — Final Verification reviewed',true)
    on conflict (workspace_id,work_id,check_key) do update
    set label = excluded.label,
        required = true,
        updated_at = now();
  end if;

  select count(*) into v_after
  from public.work_qc_checks
  where workspace_id=p_workspace_id and work_id=p_work_id;

  return v_after-v_before;
end;
$$;

comment on function public.initialize_work_qc(uuid,uuid) is
  'Prepares the final Release sign-off. Functional, timing and presentation tests belong to the structured Final Verification procedure and are not duplicated here.';

create or replace function public.enforce_work_completion_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'on_bench' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'qc' and old.status is distinct from 'qc'
     and new.type in ('inspection','service','repair','restoration','cleaning','assessment') then
    perform public.initialize_work_qc(new.workspace_id,new.id);
  end if;

  if new.status = 'complete' and old.status is distinct from 'complete' then
    if exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = new.workspace_id and s.work_id = new.id
    ) and exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = new.workspace_id and s.work_id = new.id
        and s.required and s.status not in ('done','na')
    ) then
      raise exception 'Complete all required procedure and Final Verification stages before closing this Work record';
    end if;

    if exists (
      select 1 from public.work_part_needs n
      where n.workspace_id=new.workspace_id and n.work_record_id=new.id
        and n.status in ('open','reserved')
    ) then
      raise exception 'Resolve or cancel all open part requirements before closing this Work record';
    end if;

    if new.type in ('inspection','service','repair','restoration','cleaning','assessment') then
      if not exists (
        select 1 from public.work_qc_checks q
        where q.workspace_id=new.workspace_id
          and q.work_id=new.id
          and q.check_key='release_signoff'
          and q.required
      ) then
        raise exception 'Prepare the Release sign-off before closing this Work record';
      end if;

      if exists (
        select 1 from public.work_qc_checks q
        where q.workspace_id=new.workspace_id
          and q.work_id=new.id
          and q.check_key='release_signoff'
          and q.required
          and q.status <> 'passed'
      ) then
        raise exception 'Approve the Release sign-off after reviewing Final Verification before closing this Work record';
      end if;

      if exists (
        select 1 from public.work_qc_checks q
        where q.workspace_id=new.workspace_id
          and q.work_id=new.id
          and q.check_key='release_signoff'
          and q.required
          and (q.checked_by is null or q.checked_at is null)
      ) then
        raise exception 'Release sign-off must be approved by an authenticated user';
      end if;

      if btrim(coalesce(new.completion_summary,''))='' then
        raise exception 'Add a completion summary before closing this Work record';
      end if;
    end if;

    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.enforce_work_completion_gate() is
  'Completion gate: required procedure/Final Verification stages, parts, signed Release approval and a completion summary must be clear before Work can close.';
