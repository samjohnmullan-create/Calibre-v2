-- Part fit learning: preserve donor/source movement snapshots and learn component-specific compatibility without creating generic movement edges.

alter table public.part_fit_verifications
  add column if not exists source_donor_item_id uuid null references public.items(id) on delete set null,
  add column if not exists source_knowledge_movement_id uuid null references public.knowledge_movements(id) on delete set null,
  add column if not exists source_movement_maker text not null default '',
  add column if not exists source_calibre text not null default '',
  add column if not exists target_movement_maker text not null default '',
  add column if not exists target_calibre text not null default '',
  add column if not exists part_type_snapshot text not null default '';

create index if not exists part_fit_verifications_source_donor_idx
  on public.part_fit_verifications (source_donor_item_id)
  where source_donor_item_id is not null;
create index if not exists part_fit_verifications_source_movement_idx
  on public.part_fit_verifications (source_knowledge_movement_id)
  where source_knowledge_movement_id is not null;
create index if not exists part_fit_verifications_learning_idx
  on public.part_fit_verifications (
    workspace_id,
    knowledge_movement_id,
    source_knowledge_movement_id,
    part_type_snapshot,
    verified_at desc
  );

create or replace function public.record_part_fit_feedback(
  p_workspace_id uuid,
  p_part_id uuid,
  p_item_id uuid,
  p_work_record_id uuid,
  p_result text,
  p_note text default '',
  p_modification_required boolean default false,
  p_measured_values jsonb default '{}'::jsonb
)
returns public.part_fit_verifications
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_part public.parts;
  v_target_passport public.passports;
  v_source_passport public.passports;
  v_verification public.part_fit_verifications;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any (array['owner'::text, 'editor'::text])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if p_result not in ('confirmed', 'rejected', 'conditional') then
    raise exception 'Fit result must be confirmed, rejected, or conditional';
  end if;

  if p_result in ('rejected', 'conditional') and btrim(coalesce(p_note, '')) = '' then
    raise exception 'A note is required for rejected or conditional fit evidence';
  end if;

  if p_measured_values is null or jsonb_typeof(p_measured_values) <> 'object' then
    raise exception 'Measured values must be a JSON object';
  end if;

  select * into v_part
  from public.parts
  where workspace_id = p_workspace_id
    and id = p_part_id
    and archived_at is null;

  if not found then
    raise exception 'Part not found in this workspace';
  end if;

  if not exists (
    select 1 from public.items
    where workspace_id = p_workspace_id
      and id = p_item_id
      and archived_at is null
  ) then
    raise exception 'Target Item not found in this workspace';
  end if;

  if not exists (
    select 1 from public.work_records
    where workspace_id = p_workspace_id
      and id = p_work_record_id
      and item_id = p_item_id
  ) then
    raise exception 'Work record does not belong to the target Item';
  end if;

  if not exists (
    select 1
    from public.part_allocations pa
    where pa.workspace_id = p_workspace_id
      and pa.part_id = p_part_id
      and pa.work_record_id = p_work_record_id
      and pa.item_id = p_item_id
      and pa.status in ('reserved', 'used')
  ) then
    raise exception 'Part must be reserved or used on this Work job before fit evidence can be recorded';
  end if;

  select * into v_target_passport
  from public.passports
  where workspace_id = p_workspace_id
    and item_id = p_item_id;

  if v_part.donor_item_id is not null then
    select * into v_source_passport
    from public.passports
    where workspace_id = p_workspace_id
      and item_id = v_part.donor_item_id;
  end if;

  insert into public.part_fit_verifications (
    workspace_id,
    part_id,
    knowledge_movement_id,
    item_id,
    work_record_id,
    result,
    modification_required,
    evidence_note,
    measured_values,
    verified_by,
    verified_at,
    source_donor_item_id,
    source_knowledge_movement_id,
    source_movement_maker,
    source_calibre,
    target_movement_maker,
    target_calibre,
    part_type_snapshot
  ) values (
    p_workspace_id,
    p_part_id,
    v_target_passport.knowledge_movement_id,
    p_item_id,
    p_work_record_id,
    p_result,
    coalesce(p_modification_required, false),
    btrim(coalesce(p_note, '')),
    p_measured_values,
    (select auth.uid()),
    now(),
    v_part.donor_item_id,
    v_source_passport.knowledge_movement_id,
    coalesce(v_source_passport.movement_maker, ''),
    coalesce(v_source_passport.calibre, ''),
    coalesce(v_target_passport.movement_maker, ''),
    coalesce(v_target_passport.calibre, ''),
    coalesce(v_part.part_type, '')
  ) returning * into v_verification;

  return v_verification;
end;
$function$;

revoke execute on function public.record_part_fit_feedback(uuid, uuid, uuid, uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.record_part_fit_feedback(uuid, uuid, uuid, uuid, text, text, boolean, jsonb) to authenticated;

create or replace function public.find_component_fit_learning_candidates(
  p_workspace_id uuid,
  p_item_id uuid,
  p_part_type text default null
)
returns table (
  part_id uuid,
  fit_state text,
  successful_fits integer,
  conditional_fits integer,
  rejected_fits integer,
  latest_verified_at timestamptz,
  score integer,
  confidence numeric,
  modification_required boolean,
  evidence_label text,
  reasons text[]
)
language sql
stable
security invoker
set search_path = public
as $function$
with target as (
  select
    p.knowledge_movement_id,
    lower(btrim(coalesce(p.movement_maker, ''))) as maker,
    lower(btrim(coalesce(p.calibre, ''))) as calibre
  from public.items i
  left join public.passports p
    on p.workspace_id = i.workspace_id and p.item_id = i.id
  where i.workspace_id = p_workspace_id
    and i.id = p_item_id
    and i.archived_at is null
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = (select auth.uid())
    )
),
candidate_parts as (
  select
    prt.id as part_id,
    lower(btrim(coalesce(prt.part_type, ''))) as part_type,
    dp.knowledge_movement_id as source_movement_id,
    lower(btrim(coalesce(dp.movement_maker, ''))) as source_maker,
    lower(btrim(coalesce(dp.calibre, ''))) as source_calibre
  from public.parts prt
  left join public.passports dp
    on dp.workspace_id = prt.workspace_id and dp.item_id = prt.donor_item_id
  where prt.workspace_id = p_workspace_id
    and prt.archived_at is null
    and prt.quantity > 0
    and prt.donor_item_id is not null
    and (p_part_type is null or btrim(p_part_type) = '' or lower(prt.part_type) like '%' || lower(btrim(p_part_type)) || '%')
),
history as (
  select
    cp.part_id,
    count(*) filter (where pf.result = 'confirmed')::integer as successful_fits,
    count(*) filter (where pf.result = 'conditional')::integer as conditional_fits,
    count(*) filter (where pf.result = 'rejected')::integer as rejected_fits,
    max(pf.verified_at) as latest_verified_at,
    bool_or(pf.modification_required) filter (where pf.result in ('confirmed', 'conditional')) as modification_required
  from candidate_parts cp
  join target t on true
  join public.part_fit_verifications pf
    on pf.workspace_id = p_workspace_id
   and lower(btrim(coalesce(pf.part_type_snapshot, ''))) = cp.part_type
   and (
      (t.knowledge_movement_id is not null and pf.knowledge_movement_id = t.knowledge_movement_id)
      or (
        t.maker <> '' and t.calibre <> ''
        and lower(btrim(coalesce(pf.target_movement_maker, ''))) = t.maker
        and lower(btrim(coalesce(pf.target_calibre, ''))) = t.calibre
      )
   )
   and (
      (cp.source_movement_id is not null and pf.source_knowledge_movement_id = cp.source_movement_id)
      or (
        cp.source_maker <> '' and cp.source_calibre <> ''
        and lower(btrim(coalesce(pf.source_movement_maker, ''))) = cp.source_maker
        and lower(btrim(coalesce(pf.source_calibre, ''))) = cp.source_calibre
      )
   )
  group by cp.part_id
),
classified as (
  select
    h.*,
    case
      when h.successful_fits > 0 and h.rejected_fits = 0 then 'confirmed'
      when h.successful_fits = 0 and h.conditional_fits > 0 and h.rejected_fits = 0 then 'conditional'
      when h.successful_fits = 0 and h.conditional_fits = 0 and h.rejected_fits > 0 then 'rejected'
      else 'mixed'
    end as fit_state
  from history h
)
select
  c.part_id,
  c.fit_state,
  c.successful_fits,
  c.conditional_fits,
  c.rejected_fits,
  c.latest_verified_at,
  case c.fit_state
    when 'confirmed' then 86
    when 'conditional' then 62
    when 'mixed' then 38
    else 0
  end as score,
  case
    when (c.successful_fits + c.conditional_fits + c.rejected_fits) = 0 then 0::numeric
    else round((c.successful_fits + (c.conditional_fits * 0.5))::numeric / (c.successful_fits + c.conditional_fits + c.rejected_fits)::numeric, 2)
  end as confidence,
  coalesce(c.modification_required, false) as modification_required,
  case c.fit_state
    when 'confirmed' then 'Calibre workshop-proven component lineage'
    when 'conditional' then 'Calibre workshop conditional component fit'
    when 'rejected' then 'Calibre workshop rejected this component lineage'
    else 'Mixed Calibre workshop fit history'
  end as evidence_label,
  array_remove(array[
    case when c.successful_fits > 0 then c.successful_fits::text || ' successful workshop fit' || case when c.successful_fits = 1 then '' else 's' end end,
    case when c.conditional_fits > 0 then c.conditional_fits::text || ' conditional workshop fit' || case when c.conditional_fits = 1 then '' else 's' end end,
    case when c.rejected_fits > 0 then c.rejected_fits::text || ' rejected workshop fit' || case when c.rejected_fits = 1 then '' else 's' end end,
    'Component-specific evidence only — this does not prove whole-movement interchangeability'
  ], null)::text[] as reasons
from classified c;
$function$;

revoke execute on function public.find_component_fit_learning_candidates(uuid, uuid, text) from public, anon;
grant execute on function public.find_component_fit_learning_candidates(uuid, uuid, text) to authenticated;

