create or replace function public.stamp_work_qc_signoff()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status = 'pending' then
    new.checked_at := null;
    new.checked_by := null;
  elsif tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.checked_at is null
     or new.checked_by is null then
    if auth.uid() is null then
      raise exception 'QC sign-off requires an authenticated user';
    end if;
    new.checked_at := now();
    new.checked_by := auth.uid();
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists work_qc_checks_signoff_stamp on public.work_qc_checks;
create trigger work_qc_checks_signoff_stamp
before insert or update of status on public.work_qc_checks
for each row execute function public.stamp_work_qc_signoff();

create or replace function public.enforce_work_completion_gate()
returns trigger
language plpgsql
set search_path = public
as $function$
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
      raise exception 'Complete all required checklist steps before closing this Work record';
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
        where q.workspace_id=new.workspace_id and q.work_id=new.id
      ) then
        raise exception 'Prepare and complete QC before closing this Work record';
      end if;
      if exists (
        select 1 from public.work_qc_checks q
        where q.workspace_id=new.workspace_id and q.work_id=new.id
          and q.required and q.status not in ('passed','na')
      ) then
        raise exception 'Pass or mark N/A on all required QC checks before closing this Work record';
      end if;
      if exists (
        select 1 from public.work_qc_checks q
        where q.workspace_id=new.workspace_id and q.work_id=new.id
          and q.required and q.status in ('passed','na')
          and (q.checked_by is null or q.checked_at is null)
      ) then
        raise exception 'Required QC checks must be signed off by an authenticated user';
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
$function$;
