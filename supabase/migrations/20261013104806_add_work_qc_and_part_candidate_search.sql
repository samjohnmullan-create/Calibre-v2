alter table public.work_records
  add column if not exists completion_summary text not null default '';

create table if not exists public.work_qc_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  check_key text not null,
  label text not null,
  required boolean not null default true,
  status text not null default 'pending',
  result_text text not null default '',
  evidence_note text not null default '',
  media_asset_id uuid null references public.media_assets(id) on delete set null,
  checked_by uuid null references auth.users(id) on delete set null default auth.uid(),
  checked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_qc_checks_status_check check (status in ('pending','passed','failed','na')),
  constraint work_qc_checks_key_check check (btrim(check_key) <> ''),
  constraint work_qc_checks_label_check check (btrim(label) <> ''),
  constraint work_qc_checks_work_fkey foreign key (workspace_id, work_id)
    references public.work_records(workspace_id, id) on delete cascade,
  constraint work_qc_checks_item_fkey foreign key (workspace_id, item_id)
    references public.items(workspace_id, id) on delete cascade,
  constraint work_qc_checks_unique unique (workspace_id, work_id, check_key)
);

alter table public.work_qc_checks enable row level security;

revoke all on table public.work_qc_checks from anon;
grant select, insert, update, delete on table public.work_qc_checks to authenticated;

drop policy if exists work_qc_checks_select on public.work_qc_checks;
create policy work_qc_checks_select on public.work_qc_checks
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_qc_checks.workspace_id
    and m.user_id = (select auth.uid())
));

drop policy if exists work_qc_checks_insert on public.work_qc_checks;
create policy work_qc_checks_insert on public.work_qc_checks
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_qc_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));

drop policy if exists work_qc_checks_update on public.work_qc_checks;
create policy work_qc_checks_update on public.work_qc_checks
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_qc_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_qc_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));

drop policy if exists work_qc_checks_delete on public.work_qc_checks;
create policy work_qc_checks_delete on public.work_qc_checks
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_qc_checks.workspace_id
    and m.user_id = (select auth.uid())
    and m.role in ('owner','editor')
));

create index if not exists work_qc_checks_workspace_work_idx
  on public.work_qc_checks(workspace_id, work_id, status);
create index if not exists work_qc_checks_media_asset_idx
  on public.work_qc_checks(media_asset_id) where media_asset_id is not null;

create or replace function public.initialize_work_qc(
  p_workspace_id uuid,
  p_work_id uuid
)
returns integer
language plpgsql
security invoker
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
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work
  from public.work_records
  where id = p_work_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Work record not found'; end if;

  select count(*) into v_before from public.work_qc_checks
  where workspace_id=p_workspace_id and work_id=p_work_id;

  insert into public.work_qc_checks(workspace_id,work_id,item_id,check_key,label,required)
  values
    (p_workspace_id,p_work_id,v_work.item_id,'final_visual','Final visual inspection',true),
    (p_workspace_id,p_work_id,v_work.item_id,'functions','Winding, setting and operating functions',true)
  on conflict (workspace_id,work_id,check_key) do nothing;

  if v_work.type in ('service','repair','restoration','cleaning') then
    insert into public.work_qc_checks(workspace_id,work_id,item_id,check_key,label,required)
    values
      (p_workspace_id,p_work_id,v_work.item_id,'case_assembly','Case, crown and caseback assembly',true),
      (p_workspace_id,p_work_id,v_work.item_id,'cleanliness','Final cleanliness and presentation',true)
    on conflict (workspace_id,work_id,check_key) do nothing;
  end if;

  if v_work.type in ('service','repair','restoration') then
    insert into public.work_qc_checks(workspace_id,work_id,item_id,check_key,label,required)
    values (p_workspace_id,p_work_id,v_work.item_id,'final_timing','Final timing / running result recorded',true)
    on conflict (workspace_id,work_id,check_key) do nothing;
  end if;

  if v_work.type in ('repair','restoration') then
    insert into public.work_qc_checks(workspace_id,work_id,item_id,check_key,label,required)
    values (p_workspace_id,p_work_id,v_work.item_id,'repair_outcome','Repair outcome verified',true)
    on conflict (workspace_id,work_id,check_key) do nothing;
  end if;

  select count(*) into v_after from public.work_qc_checks
  where workspace_id=p_workspace_id and work_id=p_work_id;
  return v_after-v_before;
end;
$$;
revoke execute on function public.initialize_work_qc(uuid,uuid) from public, anon;
grant execute on function public.initialize_work_qc(uuid,uuid) to authenticated;

create or replace function public.search_parts_for_need(
  p_workspace_id uuid,
  p_need_id uuid,
  p_query text default ''
)
returns table (
  part_id uuid,
  part_type text,
  manufacturer text,
  reference text,
  description text,
  condition text,
  stock_quantity numeric,
  reserved_quantity numeric,
  available_quantity numeric,
  unit_cost numeric,
  currency text,
  donor_item_id uuid,
  match_score integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_need public.work_part_needs;
  v_q text := lower(btrim(coalesce(p_query,'')));
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid()
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_need from public.work_part_needs
  where id=p_need_id and workspace_id=p_workspace_id;
  if not found then raise exception 'Part need not found'; end if;

  return query
  select p.id,p.part_type,p.manufacturer,p.reference,p.description,p.condition,
         p.quantity,
         coalesce(r.reserved,0),
         greatest(p.quantity-coalesce(r.reserved,0),0),
         p.unit_cost,p.currency,p.donor_item_id,
         (case
            when lower(btrim(p.part_type)) = lower(btrim(v_need.part_type)) and btrim(v_need.part_type)<>'' then 100
            when btrim(v_need.part_type)<>'' and lower(p.part_type) like '%'||lower(btrim(v_need.part_type))||'%' then 70
            else 0
          end
          + case when v_q<>'' and lower(concat_ws(' ',p.manufacturer,p.reference,p.description,p.part_type)) like '%'||v_q||'%' then 25 else 0 end)::integer as score
  from public.parts p
  left join lateral (
    select sum(a.quantity) as reserved
    from public.part_allocations a
    where a.workspace_id=p_workspace_id and a.part_id=p.id and a.status='reserved'
  ) r on true
  where p.workspace_id=p_workspace_id
    and p.quantity-coalesce(r.reserved,0) > 0
    and (
      (btrim(v_need.part_type)<>'' and lower(p.part_type) like '%'||lower(btrim(v_need.part_type))||'%')
      or (v_q<>'' and lower(concat_ws(' ',p.manufacturer,p.reference,p.description,p.part_type)) like '%'||v_q||'%')
      or (btrim(v_need.part_type)='' and v_q='')
    )
  order by score desc, p.manufacturer, p.reference, p.description
  limit 40;
end;
$$;
revoke execute on function public.search_parts_for_need(uuid,uuid,text) from public, anon;
grant execute on function public.search_parts_for_need(uuid,uuid,text) to authenticated;

create or replace function public.enforce_work_completion_gate()
returns trigger
language plpgsql
security invoker
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