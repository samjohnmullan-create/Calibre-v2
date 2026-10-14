create or replace function public.infer_parts_waiting_reason()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status = 'waiting'
     and coalesce(new.waiting_reason, '') = ''
     and exists (
       select 1
       from public.work_part_needs n
       where n.workspace_id = new.workspace_id
         and n.work_record_id = new.id
         and n.status in ('open','reserved')
     ) then
    new.waiting_reason := 'parts';
    if btrim(coalesce(new.blocker, '')) = '' then
      new.blocker := 'Waiting for parts';
    end if;
    if btrim(coalesce(new.next_action, '')) = '' then
      new.next_action := 'Source required parts';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists work_records_infer_parts_waiting on public.work_records;
create trigger work_records_infer_parts_waiting
before update of status, waiting_reason on public.work_records
for each row execute function public.infer_parts_waiting_reason();

create or replace function public.attach_parts_reason_to_waiting_work()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status in ('open','reserved') then
    update public.work_records
    set waiting_reason = 'parts',
        blocker = case when btrim(coalesce(blocker, '')) = '' then 'Waiting for parts' else blocker end,
        next_action = case when btrim(coalesce(next_action, '')) = '' then 'Source required parts' else next_action end
    where workspace_id = new.workspace_id
      and id = new.work_record_id
      and status = 'waiting'
      and coalesce(waiting_reason, '') = '';
  end if;

  return new;
end;
$function$;

drop trigger if exists work_part_needs_attach_waiting_reason on public.work_part_needs;
create trigger work_part_needs_attach_waiting_reason
after insert on public.work_part_needs
for each row execute function public.attach_parts_reason_to_waiting_work();
