create or replace function public.find_owned_compatibility_candidates(
  p_workspace_id uuid,
  p_item_id uuid,
  p_part_type text default null,
  p_limit integer default 30
)
returns table (
  candidate_kind text,
  candidate_id uuid,
  part_id uuid,
  donor_item_id uuid,
  label text,
  detail text,
  part_type text,
  quantity numeric,
  condition text,
  evidence_tier text,
  evidence_label text,
  score integer,
  confidence numeric,
  source_kind text,
  modification_required boolean,
  donor_value numeric,
  donor_currency text,
  economic_note text,
  target_movement_id uuid,
  candidate_movement_id uuid,
  reasons text[]
)
language sql
stable
security invoker
set search_path = public
as $$
with target as (
  select
    i.id as item_id,
    p.knowledge_movement_id as movement_id,
    km.maker,
    km.calibre,
    km.calibre_family
  from items i
  left join passports p
    on p.workspace_id = i.workspace_id and p.item_id = i.id
  left join knowledge_movements km on km.id = p.knowledge_movement_id
  where i.workspace_id = p_workspace_id
    and i.id = p_item_id
    and i.archived_at is null
    and exists (
      select 1 from workspace_members wm
      where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
    )
),
bench as (
  select distinct on (pf.part_id)
    pf.part_id,
    pf.result,
    pf.modification_required,
    pf.evidence_note,
    pf.verified_at
  from part_fit_verifications pf
  join target t on true
  where pf.workspace_id = p_workspace_id
    and (
      (t.movement_id is not null and pf.knowledge_movement_id = t.movement_id)
      or pf.item_id = p_item_id
    )
  order by pf.part_id, pf.verified_at desc
),
part_direct as (
  select
    pa.part_id,
    max(pa.confidence) as confidence,
    bool_or(pa.verification_status = 'confirmed') as confirmed,
    bool_or(pa.evidence_class in ('manufacturer','documented','catalogue')) as documented,
    string_agg(distinct nullif(pa.evidence_class,''), ', ') as evidence_classes
  from part_applications pa
  join target t on true
  where pa.workspace_id = p_workspace_id
    and (
      (t.movement_id is not null and pa.knowledge_movement_id = t.movement_id)
      or (
        t.movement_id is not null
        and lower(pa.movement_maker) = lower(t.maker)
        and lower(pa.calibre) = lower(t.calibre)
      )
    )
  group by pa.part_id
),
knowledge_direct as (
  select
    pr.id as part_ref_id,
    max(kpa.confidence) as confidence,
    bool_or(kpa.verification_status = 'confirmed') as confirmed,
    bool_or(kpa.evidence_class in ('manufacturer','documented','catalogue')) as documented,
    string_agg(distinct nullif(kpa.evidence_class,''), ', ') as evidence_classes
  from knowledge_part_refs pr
  join knowledge_part_applications kpa on kpa.part_ref_id = pr.id
  join target t on kpa.movement_id = t.movement_id
  group by pr.id
),
compatible_movements as (
  select
    case when kce.movement_a_id = t.movement_id then kce.movement_b_id else kce.movement_a_id end as movement_id,
    max(kce.confidence) as confidence,
    bool_or(kce.modification_required) as modification_required,
    bool_or(kce.evidence_grade in ('manufacturer','documented','catalogue','confirmed')) as documented,
    string_agg(distinct nullif(kce.status,''), ', ') as statuses
  from knowledge_compatibility_edges kce
  join target t on t.movement_id is not null
    and (kce.movement_a_id = t.movement_id or kce.movement_b_id = t.movement_id)
  group by 1
),
part_via_compatible as (
  select
    p.id as part_id,
    max(coalesce(kpa.confidence, cm.confidence)) as confidence,
    bool_or(cm.modification_required) as modification_required,
    bool_or(cm.documented and kpa.evidence_class in ('manufacturer','documented','catalogue')) as documented,
    string_agg(distinct (km.maker || ' ' || km.calibre), ', ') as via_movements
  from parts p
  join knowledge_part_applications kpa on kpa.part_ref_id = p.knowledge_part_ref_id
  join compatible_movements cm on cm.movement_id = kpa.movement_id
  join knowledge_movements km on km.id = kpa.movement_id
  where p.workspace_id = p_workspace_id
  group by p.id
),
part_family as (
  select
    p.id as part_id,
    max(kpa.confidence) as confidence,
    string_agg(distinct (km.maker || ' ' || km.calibre), ', ') as family_movements
  from parts p
  join knowledge_part_applications kpa on kpa.part_ref_id = p.knowledge_part_ref_id
  join knowledge_movements km on km.id = kpa.movement_id
  join target t on t.movement_id is not null
    and t.calibre_family <> ''
    and km.calibre_family = t.calibre_family
  where p.workspace_id = p_workspace_id
  group by p.id
),
owned_parts as (
  select
    'owned_part'::text as candidate_kind,
    p.id as candidate_id,
    p.id as part_id,
    p.donor_item_id,
    coalesce(nullif(p.manufacturer,'' ) || ' ', '') || p.description as label,
    nullif(p.reference,'') as detail,
    p.part_type,
    p.quantity,
    p.condition,
    case
      when b.result = 'confirmed' then 'confirmed'
      when pd.confirmed or kd.confirmed then 'confirmed'
      when pd.documented or kd.documented then 'documented'
      when pvc.documented then 'documented'
      when pvc.part_id is not null then 'candidate'
      when pf.part_id is not null then 'family_lead'
      else 'unverified'
    end as evidence_tier,
    case
      when b.result = 'confirmed' then 'Calibre Verified bench fit'
      when pd.confirmed then 'Confirmed owned-part application'
      when kd.confirmed then 'Confirmed Knowledge application'
      when pd.documented then 'Documented owned-part application'
      when kd.documented then 'Documented Knowledge application'
      when pvc.documented then 'Documented through compatible movement'
      when pvc.part_id is not null then 'Compatibility candidate'
      when pf.part_id is not null then 'Same-family lead only'
      else 'No compatibility evidence'
    end as evidence_label,
    case
      when b.result = 'confirmed' then 100
      when pd.confirmed then 96
      when kd.confirmed then 94
      when pd.documented then 90
      when kd.documented then 88
      when pvc.documented then 72
      when pvc.part_id is not null then 58
      when pf.part_id is not null then 34
      else 5
    end as score,
    coalesce(pd.confidence, kd.confidence, pvc.confidence, pf.confidence) as confidence,
    case
      when b.result = 'confirmed' then 'bench'
      when pd.part_id is not null then 'owned_application'
      when kd.part_ref_id is not null then 'knowledge_application'
      when pvc.part_id is not null then 'compatibility_edge'
      when pf.part_id is not null then 'family_relationship'
      else 'inventory_only'
    end as source_kind,
    coalesce(b.modification_required, pvc.modification_required, false) as modification_required,
    null::numeric as donor_value,
    null::text as donor_currency,
    case when p.donor_item_id is not null then 'Already removed from donor Item #' || di.item_number::text else '' end as economic_note,
    t.movement_id as target_movement_id,
    null::uuid as candidate_movement_id,
    array_remove(array[
      case when b.result = 'confirmed' then 'Bench-confirmed on this movement/item' end,
      case when pd.part_id is not null then 'Owned application record matches target movement' end,
      case when kd.part_ref_id is not null then 'Knowledge part reference applies to target movement' end,
      case when pvc.part_id is not null then 'Part applies to a movement linked by compatibility evidence' end,
      case when pf.part_id is not null then 'Part appears on another movement in the same calibre family — verify exact fit' end,
      case when coalesce(b.modification_required, pvc.modification_required, false) then 'Modification may be required' end
    ], null)::text[] as reasons
  from parts p
  join target t on true
  left join bench b on b.part_id = p.id and b.result <> 'rejected'
  left join part_direct pd on pd.part_id = p.id
  left join knowledge_direct kd on kd.part_ref_id = p.knowledge_part_ref_id
  left join part_via_compatible pvc on pvc.part_id = p.id
  left join part_family pf on pf.part_id = p.id
  left join items di on di.id = p.donor_item_id and di.workspace_id = p.workspace_id
  where p.workspace_id = p_workspace_id
    and p.quantity > 0
    and (p_part_type is null or trim(p_part_type) = '' or lower(p.part_type) like '%' || lower(trim(p_part_type)) || '%')
    and not exists (
      select 1 from bench bx where bx.part_id = p.id and bx.result = 'rejected'
    )
),
donor_values as (
  select distinct on (v.item_id)
    v.item_id,
    coalesce(v.target_value, v.expected_value, v.high_value, v.low_value) as value,
    v.currency
  from valuations v
  where v.workspace_id = p_workspace_id
  order by v.item_id, v.valued_at desc
),
donor_candidates as (
  select
    'donor_item'::text as candidate_kind,
    di.id as candidate_id,
    null::uuid as part_id,
    di.id as donor_item_id,
    '#' || di.item_number::text || ' · ' || di.title as label,
    trim(concat_ws(' ', dp.movement_maker, dp.calibre)) as detail,
    'donor movement'::text as part_type,
    1::numeric as quantity,
    di.status as condition,
    case
      when dp.knowledge_movement_id = t.movement_id then 'confirmed'
      when ce.documented then 'documented'
      when ce.movement_id is not null then 'candidate'
      when dkm.calibre_family <> '' and dkm.calibre_family = t.calibre_family then 'family_lead'
      else 'unverified'
    end as evidence_tier,
    case
      when dp.knowledge_movement_id = t.movement_id then 'Same identified movement'
      when ce.documented then 'Documented compatible movement'
      when ce.movement_id is not null then 'Movement compatibility candidate'
      when dkm.calibre_family <> '' and dkm.calibre_family = t.calibre_family then 'Same-family donor lead only'
      else 'Donor movement not linked'
    end as evidence_label,
    case
      when dp.knowledge_movement_id = t.movement_id then 92
      when ce.documented then 70
      when ce.movement_id is not null then 54
      when dkm.calibre_family <> '' and dkm.calibre_family = t.calibre_family then 30
      else 4
    end as score,
    ce.confidence,
    case
      when dp.knowledge_movement_id = t.movement_id then 'same_movement'
      when ce.movement_id is not null then 'compatibility_edge'
      when dkm.calibre_family <> '' and dkm.calibre_family = t.calibre_family then 'family_relationship'
      else 'inventory_only'
    end as source_kind,
    coalesce(ce.modification_required, false) as modification_required,
    dv.value as donor_value,
    coalesce(dv.currency, 'AUD') as donor_currency,
    case
      when dv.value is not null then 'Donor has recorded value ' || dv.currency || ' ' || trim(to_char(dv.value, 'FM999999990.00')) || ' — compare economics before stripping'
      else 'No donor valuation recorded — compare completeness/value before stripping'
    end as economic_note,
    t.movement_id as target_movement_id,
    dp.knowledge_movement_id as candidate_movement_id,
    array_remove(array[
      case when dp.knowledge_movement_id = t.movement_id then 'Donor has the same identified movement' end,
      case when ce.documented then 'Knowledge Engine contains documented movement compatibility' end,
      case when ce.movement_id is not null and not ce.documented then 'Knowledge Engine contains candidate movement compatibility' end,
      case when dkm.calibre_family <> '' and dkm.calibre_family = t.calibre_family and ce.movement_id is null then 'Same family only — not proof of part interchange' end,
      case when ce.modification_required then 'Compatibility evidence says modification may be required' end
    ], null)::text[] as reasons
  from items di
  join target t on true
  left join passports dp on dp.workspace_id = di.workspace_id and dp.item_id = di.id
  left join knowledge_movements dkm on dkm.id = dp.knowledge_movement_id
  left join lateral (
    select
      case when kce.movement_a_id = t.movement_id then kce.movement_b_id else kce.movement_a_id end as movement_id,
      kce.confidence,
      kce.modification_required,
      (kce.evidence_grade in ('manufacturer','documented','catalogue','confirmed')) as documented
    from knowledge_compatibility_edges kce
    where t.movement_id is not null
      and dp.knowledge_movement_id is not null
      and (
        (kce.movement_a_id = t.movement_id and kce.movement_b_id = dp.knowledge_movement_id)
        or (kce.movement_b_id = t.movement_id and kce.movement_a_id = dp.knowledge_movement_id)
      )
    order by
      (kce.evidence_grade in ('manufacturer','documented','catalogue','confirmed')) desc,
      kce.confidence desc nulls last
    limit 1
  ) ce on true
  left join donor_values dv on dv.item_id = di.id
  where di.workspace_id = p_workspace_id
    and di.purpose = 'donor'
    and di.archived_at is null
    and di.id <> p_item_id
)
select * from (
  select * from owned_parts
  union all
  select * from donor_candidates
) ranked
where target_movement_id is not null
order by score desc, candidate_kind, label
limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

grant execute on function public.find_owned_compatibility_candidates(uuid, uuid, text, integer) to authenticated;
