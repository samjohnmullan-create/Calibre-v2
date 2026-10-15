alter table public.items
  add column if not exists data_mode text not null default 'real';

alter table public.work_records
  add column if not exists data_mode text not null default 'real';

alter table public.items
  drop constraint if exists items_data_mode_check;
alter table public.items
  add constraint items_data_mode_check check (data_mode in ('real','test'));

alter table public.work_records
  drop constraint if exists work_records_data_mode_check;
alter table public.work_records
  add constraint work_records_data_mode_check check (data_mode in ('real','test'));

comment on column public.items.data_mode is
  'real = production business record; test = demo/test Item excluded from learning, reporting and public publication sources.';
comment on column public.work_records.data_mode is
  'real = production workshop history; test = demo/test Work excluded from learning, reporting and public history sources while remaining fully usable for workflow testing.';

create index if not exists items_workspace_data_mode_idx
  on public.items(workspace_id,data_mode)
  where archived_at is null;
create index if not exists work_records_workspace_data_mode_idx
  on public.work_records(workspace_id,data_mode,status);

create or replace function public.set_work_data_mode(
  p_workspace_id uuid,
  p_work_id uuid,
  p_data_mode text
)
returns public.work_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_before text;
  v_work public.work_records;
begin
  if p_data_mode not in ('real','test') then
    raise exception 'Unsupported data mode';
  end if;

  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select data_mode into v_before
  from public.work_records
  where workspace_id=p_workspace_id and id=p_work_id
  for update;
  if not found then raise exception 'Work not found'; end if;

  update public.work_records
  set data_mode=p_data_mode,
      updated_at=now()
  where workspace_id=p_workspace_id and id=p_work_id
  returning * into v_work;

  if v_before is distinct from p_data_mode then
    insert into public.work_events(workspace_id,work_id,item_id,event_type,summary,details,actor_id,actor_type)
    values (
      v_work.workspace_id,
      v_work.id,
      v_work.item_id,
      'data_mode_changed',
      'Work data mode changed from ' || v_before || ' to ' || p_data_mode,
      jsonb_build_object('from',v_before,'to',p_data_mode),
      (select auth.uid()),
      case when (select auth.uid()) is null then 'system' else 'user' end
    );
  end if;

  return v_work;
end;
$$;

revoke all on function public.set_work_data_mode(uuid,uuid,text) from public;
revoke all on function public.set_work_data_mode(uuid,uuid,text) from anon;
grant execute on function public.set_work_data_mode(uuid,uuid,text) to authenticated;

create or replace function public.start_work(
  p_workspace_id uuid,
  p_item_id uuid,
  p_type text default 'assessment'::text,
  p_title text default null::text,
  p_template_id uuid default null::uuid
)
returns public.work_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work public.work_records;
  v_title text;
  v_data_mode text;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select data_mode into v_data_mode
  from public.items
  where workspace_id = p_workspace_id and id = p_item_id;
  if not found then raise exception 'Item not found'; end if;

  if p_type <> all(array['inspection','service','repair','restoration','cleaning','assessment','photography','listing_prep','qc','other']::text[]) then
    raise exception 'Unsupported Work type';
  end if;

  v_title := coalesce(nullif(btrim(p_title),''), 'Workshop job');

  insert into public.work_records (
    workspace_id,item_id,type,title,status,template_id,
    induction_status,induction_version,job_plan_status,next_action,data_mode
  ) values (
    p_workspace_id,p_item_id,p_type,v_title,'queued',null,
    'pending',1,'pending','Start workshop induction',coalesce(v_data_mode,'real')
  ) returning * into v_work;

  perform public.initialize_work_induction(p_workspace_id,v_work.id);

  insert into public.work_events(workspace_id,work_id,item_id,event_type,summary,details)
  values (
    p_workspace_id,v_work.id,p_item_id,
    'work_started','Workshop job created — induction required',
    jsonb_build_object('work_type',p_type,'induction_version',1,'requested_template_id',p_template_id,'data_mode',v_work.data_mode)
  );

  return v_work;
end;
$$;

revoke all on function public.start_work(uuid,uuid,text,text,uuid) from public;
revoke all on function public.start_work(uuid,uuid,text,text,uuid) from anon;
grant execute on function public.start_work(uuid,uuid,text,text,uuid) to authenticated;

create or replace view public.real_items
with (security_invoker=true)
as
select *
from public.items
where data_mode='real';

create or replace view public.real_work_records
with (security_invoker=true)
as
select *
from public.work_records
where data_mode='real';

create or replace view public.real_work_sessions
with (security_invoker=true)
as
select s.*
from public.work_sessions s
join public.work_records w
  on w.workspace_id=s.workspace_id and w.id=s.work_id
where w.data_mode='real';

revoke all on public.real_items from anon;
revoke all on public.real_work_records from anon;
revoke all on public.real_work_sessions from anon;
grant select on public.real_items to authenticated;
grant select on public.real_work_records to authenticated;
grant select on public.real_work_sessions to authenticated;

comment on view public.real_items is
  'Canonical Item source for business learning/reporting/publication. Test Items are excluded.';
comment on view public.real_work_records is
  'Canonical Work source for Workshop Memory, workshop analytics and public service history. Test Work is excluded.';
comment on view public.real_work_sessions is
  'Canonical bench-time source for analytics/economics. Sessions belonging to test Work are excluded.';

create or replace view public.workbench_jobs
with (security_invoker = true)
as
select
  w.id,
  w.workspace_id,
  w.item_id,
  w.work_number,
  w.type,
  w.title,
  w.status,
  w.waiting_reason,
  w.priority,
  case
    when w.status='complete' then 'Complete'
    when w.status='cancelled' then 'Cancelled'
    else coalesce(nba.title,'Review Work')
  end as next_action,
  w.blocker,
  w.diagnosis,
  w.opened_at,
  w.completed_at,
  i.item_number,
  i.title as item_title,
  i.type as item_type,
  w.data_mode,
  i.data_mode as item_data_mode
from public.work_records w
join public.items i
  on i.workspace_id=w.workspace_id and i.id=w.item_id
left join lateral (
  select a.title
  from public.get_work_next_best_action(w.workspace_id,w.id) a
  limit 1
) nba on true
where i.archived_at is null;

revoke all on public.workbench_jobs from anon;
grant select on public.workbench_jobs to authenticated;

-- This Work has explicitly been used as the current workflow mock-up.
update public.work_records
set data_mode='test',updated_at=now()
where id='f4700e63-2694-47d4-a05d-6ee85f5ccf4d'::uuid
  and workspace_id='607010b8-5220-4084-848b-7da0aa1bc866'::uuid;
