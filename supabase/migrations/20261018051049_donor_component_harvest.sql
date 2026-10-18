-- Donor harvest/depletion: preserve component condition evidence while moving a physically removed component into Parts.

alter table public.item_component_assessments
  add column if not exists inventory_state text not null default 'installed',
  add column if not exists harvested_part_id uuid null references public.parts(id),
  add column if not exists harvested_at timestamptz null,
  add column if not exists harvested_by uuid null references auth.users(id);

alter table public.item_component_assessments
  drop constraint if exists item_component_assessments_inventory_state_check;
alter table public.item_component_assessments
  add constraint item_component_assessments_inventory_state_check
  check (inventory_state = any (array['installed'::text, 'harvested'::text]));

alter table public.item_component_assessments
  drop constraint if exists item_component_assessments_harvest_consistency_check;
alter table public.item_component_assessments
  add constraint item_component_assessments_harvest_consistency_check
  check (
    (inventory_state = 'installed' and harvested_part_id is null and harvested_at is null)
    or
    (inventory_state = 'harvested' and harvested_part_id is not null and harvested_at is not null)
  );

create unique index if not exists item_component_assessments_harvested_part_uidx
  on public.item_component_assessments (harvested_part_id)
  where harvested_part_id is not null;

create index if not exists item_component_assessments_inventory_state_idx
  on public.item_component_assessments (workspace_id, item_id, inventory_state);

create or replace function public.harvest_item_component(
  p_workspace_id uuid,
  p_item_id uuid,
  p_component_key text,
  p_component_label text,
  p_storage_location_id uuid default null,
  p_unit_cost numeric default null,
  p_currency text default 'AUD',
  p_note text default ''
)
returns public.parts
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_item public.items;
  v_passport public.passports;
  v_assessment public.item_component_assessments;
  v_part public.parts;
  v_component_label text;
  v_provenance text;
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

  if btrim(coalesce(p_component_key, '')) = '' then
    raise exception 'Component key is required';
  end if;
  if btrim(coalesce(p_component_label, '')) = '' then
    raise exception 'Component label is required';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Allocated cost cannot be negative';
  end if;
  if btrim(coalesce(p_currency, '')) = '' then
    raise exception 'Currency is required';
  end if;

  select * into v_item
  from public.items
  where workspace_id = p_workspace_id
    and id = p_item_id
  for update;

  if not found then
    raise exception 'Donor Item not found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Archived Items cannot be harvested';
  end if;
  if v_item.purpose <> 'donor' then
    raise exception 'Only donor Items can be harvested';
  end if;

  if p_storage_location_id is not null and not exists (
    select 1
    from public.storage_locations sl
    where sl.workspace_id = p_workspace_id
      and sl.id = p_storage_location_id
  ) then
    raise exception 'Storage location not found in this workspace';
  end if;

  select * into v_assessment
  from public.item_component_assessments
  where workspace_id = p_workspace_id
    and item_id = p_item_id
    and component_key = p_component_key
  for update;

  if not found then
    insert into public.item_component_assessments (
      workspace_id,
      item_id,
      component_key,
      component_label,
      condition,
      confidence,
      inventory_state,
      assessed_at,
      updated_at
    ) values (
      p_workspace_id,
      p_item_id,
      p_component_key,
      btrim(p_component_label),
      'untested',
      'unknown',
      'installed',
      now(),
      now()
    ) returning * into v_assessment;
  end if;

  if v_assessment.inventory_state = 'harvested' then
    raise exception 'This component has already been harvested';
  end if;
  if v_assessment.condition = 'missing' then
    raise exception 'A component recorded as missing cannot be harvested';
  end if;

  select * into v_passport
  from public.passports
  where workspace_id = p_workspace_id
    and item_id = p_item_id;

  v_component_label := coalesce(nullif(btrim(v_assessment.component_label), ''), btrim(p_component_label));
  v_provenance := 'Harvested from donor Item #' || v_item.item_number::text || ' · ' || v_item.title;
  if v_passport.item_id is not null then
    if btrim(coalesce(v_passport.movement_maker, '')) <> '' then
      v_provenance := v_provenance || ' · ' || v_passport.movement_maker;
    end if;
    if btrim(coalesce(v_passport.calibre, '')) <> '' then
      v_provenance := v_provenance || ' ' || v_passport.calibre;
    end if;
  end if;

  insert into public.parts (
    workspace_id,
    part_type,
    manufacturer,
    reference,
    description,
    condition,
    quantity,
    unit_cost,
    currency,
    storage_location_id,
    donor_item_id,
    notes,
    provenance_type,
    provenance_note
  ) values (
    p_workspace_id,
    p_component_key,
    coalesce(v_passport.movement_maker, ''),
    coalesce(v_passport.calibre, ''),
    v_component_label,
    case when v_assessment.condition in ('untested', 'unknown') then '' else v_assessment.condition end,
    1,
    p_unit_cost,
    upper(btrim(p_currency)),
    p_storage_location_id,
    p_item_id,
    coalesce(p_note, ''),
    'donor',
    v_provenance || case
      when btrim(coalesce(v_assessment.evidence_note, '')) <> '' then ' · Source assessment: ' || v_assessment.evidence_note
      else ''
    end
  ) returning * into v_part;

  update public.item_component_assessments
  set inventory_state = 'harvested',
      harvested_part_id = v_part.id,
      harvested_at = now(),
      harvested_by = (select auth.uid()),
      updated_at = now()
  where id = v_assessment.id;

  return v_part;
end;
$function$;

revoke execute on function public.harvest_item_component(uuid, uuid, text, text, uuid, numeric, text, text) from public, anon;
grant execute on function public.harvest_item_component(uuid, uuid, text, text, uuid, numeric, text, text) to authenticated;
