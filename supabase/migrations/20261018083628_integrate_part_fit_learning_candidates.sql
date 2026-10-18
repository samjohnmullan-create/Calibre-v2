-- Feed component-specific workshop fit learning into owned-parts ranking without creating generic movement compatibility edges.

create or replace function public.find_owned_compatibility_candidates_v2(
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
as $function$
with target as (
  select p.knowledge_movement_id
  from public.items i
  left join public.passports p
    on p.workspace_id = i.workspace_id and p.item_id = i.id
  where i.workspace_id = p_workspace_id
    and i.id = p_item_id
    and i.archived_at is null
),
base as (
  select *
  from public.find_owned_compatibility_candidates(
    p_workspace_id,
    p_item_id,
    p_part_type,
    100
  )
),
learning as (
  select *
  from public.find_component_fit_learning_candidates(
    p_workspace_id,
    p_item_id,
    p_part_type
  )
),
base_enriched as (
  select
    b.candidate_kind,
    b.candidate_id,
    b.part_id,
    b.donor_item_id,
    b.label,
    b.detail,
    b.part_type,
    b.quantity,
    b.condition,
    case
      when b.candidate_kind <> 'owned_part' or l.part_id is null then b.evidence_tier
      when b.evidence_tier in ('confirmed', 'documented') then b.evidence_tier
      when l.fit_state in ('confirmed', 'conditional') then 'candidate'
      when l.fit_state = 'mixed' then 'family_lead'
      else 'unverified'
    end as evidence_tier,
    case
      when b.candidate_kind <> 'owned_part' or l.part_id is null then b.evidence_label
      when b.evidence_tier in ('confirmed', 'documented') then b.evidence_label
      else l.evidence_label
    end as evidence_label,
    case
      when b.candidate_kind <> 'owned_part' or l.part_id is null then b.score
      when b.evidence_tier in ('confirmed', 'documented') then b.score
      when l.fit_state = 'rejected' then 0
      else greatest(b.score, l.score)
    end::integer as score,
    case
      when b.candidate_kind <> 'owned_part' or l.part_id is null then b.confidence
      when b.evidence_tier in ('confirmed', 'documented') then coalesce(b.confidence, l.confidence)
      else l.confidence
    end as confidence,
    case
      when b.candidate_kind <> 'owned_part' or l.part_id is null then b.source_kind
      when b.evidence_tier in ('confirmed', 'documented') then b.source_kind
      when l.fit_state = 'rejected' then 'workshop_fit_conflict'
      else 'workshop_fit_lineage'
    end as source_kind,
    (coalesce(b.modification_required, false) or coalesce(l.modification_required, false)) as modification_required,
    b.donor_value,
    b.donor_currency,
    b.economic_note,
    b.target_movement_id,
    b.candidate_movement_id,
    coalesce(b.reasons, '{}'::text[])
      || coalesce(l.reasons, '{}'::text[])
      || case
          when l.fit_state in ('rejected', 'mixed') and b.evidence_tier in ('confirmed', 'documented')
            then array['Workshop fit history conflicts with stronger documentary evidence — inspect both before use']::text[]
          else '{}'::text[]
         end as reasons
  from base b
  left join learning l on l.part_id = b.part_id
),
learning_only as (
  select
    'owned_part'::text as candidate_kind,
    p.id as candidate_id,
    p.id as part_id,
    p.donor_item_id,
    coalesce(nullif(p.manufacturer, '') || ' ', '') || coalesce(nullif(p.description, ''), p.part_type) as label,
    nullif(p.reference, '') as detail,
    p.part_type,
    p.quantity,
    p.condition,
    case
      when l.fit_state in ('confirmed', 'conditional') then 'candidate'
      when l.fit_state = 'mixed' then 'family_lead'
      else 'unverified'
    end as evidence_tier,
    l.evidence_label,
    l.score,
    l.confidence,
    case when l.fit_state = 'rejected' then 'workshop_fit_conflict' else 'workshop_fit_lineage' end as source_kind,
    l.modification_required,
    null::numeric as donor_value,
    null::text as donor_currency,
    'Harvested from donor Item #' || di.item_number::text || ' · learned evidence is component-specific' as economic_note,
    t.knowledge_movement_id as target_movement_id,
    dp.knowledge_movement_id as candidate_movement_id,
    l.reasons
  from learning l
  join public.parts p
    on p.workspace_id = p_workspace_id
   and p.id = l.part_id
   and p.archived_at is null
   and p.quantity > 0
  join public.items di
    on di.workspace_id = p.workspace_id
   and di.id = p.donor_item_id
  left join public.passports dp
    on dp.workspace_id = p.workspace_id
   and dp.item_id = p.donor_item_id
  left join target t on true
  where not exists (select 1 from base b where b.part_id = l.part_id)
),
ranked as (
  select * from base_enriched
  union all
  select * from learning_only
)
select *
from ranked
order by score desc, candidate_kind, label
limit greatest(1, least(coalesce(p_limit, 30), 100));
$function$;

revoke execute on function public.find_owned_compatibility_candidates_v2(uuid, uuid, text, integer) from public, anon;
grant execute on function public.find_owned_compatibility_candidates_v2(uuid, uuid, text, integer) to authenticated;
