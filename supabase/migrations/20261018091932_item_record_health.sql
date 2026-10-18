-- Canonical, type-aware Item record health. Calculated from source records rather than stored percentages.

create or replace view public.item_record_health
with (security_invoker = true)
as
with facts as (
  select
    i.workspace_id,
    i.id as item_id,
    i.item_number,
    i.type,
    i.purpose,
    i.status,
    i.title,
    i.storage_location_id,
    exists (
      select 1 from public.item_identity x
      where x.workspace_id = i.workspace_id and x.item_id = i.id
    ) as has_identity,
    exists (
      select 1 from public.media_assets m
      where m.workspace_id = i.workspace_id and m.item_id = i.id
    ) as has_media,
    exists (
      select 1 from public.passports p
      where p.workspace_id = i.workspace_id and p.item_id = i.id
    ) as has_passport,
    exists (
      select 1 from public.valuations v
      where v.workspace_id = i.workspace_id and v.item_id = i.id
    ) as has_valuation,
    (
      exists (
        select 1 from public.cost_entries c
        where c.workspace_id = i.workspace_id
          and c.item_id = i.id
          and c.category = 'purchase'
          and c.amount is not null
      )
      or exists (
        select 1 from public.purchase_item_links pil
        where pil.workspace_id = i.workspace_id
          and pil.item_id = i.id
          and (
            coalesce(pil.allocated_purchase_cost_aud, 0) <> 0
            or pil.purchase_cost_entry_id is not null
          )
      )
    ) as has_acquisition_cost,
    (i.type in ('watch', 'clock')) as passport_applicable,
    (i.purpose in ('resale', 'collection')) as valuation_applicable,
    (i.purpose in ('resale', 'collection', 'donor')) as acquisition_cost_applicable
  from public.items i
  where i.archived_at is null
),
weighted as (
  select
    f.*,
    (15 + 25 + 20
      + case when passport_applicable then 20 else 0 end
      + case when valuation_applicable then 10 else 0 end
      + case when acquisition_cost_applicable then 10 else 0 end
    )::integer as max_points,
    (
      case when has_identity then 15 else 0 end
      + case when storage_location_id is not null then 25 else 0 end
      + case when has_media then 20 else 0 end
      + case when passport_applicable and has_passport then 20 else 0 end
      + case when valuation_applicable and has_valuation then 10 else 0 end
      + case when acquisition_cost_applicable and has_acquisition_cost then 10 else 0 end
    )::integer as earned_points
  from facts f
)
select
  w.workspace_id,
  w.item_id,
  w.item_number,
  w.type,
  w.purpose,
  w.status,
  w.title,
  w.storage_location_id,
  w.has_identity,
  (w.storage_location_id is not null) as has_location,
  w.has_media,
  w.has_passport,
  w.has_valuation,
  w.has_acquisition_cost,
  w.passport_applicable,
  w.valuation_applicable,
  w.acquisition_cost_applicable,
  w.earned_points,
  w.max_points,
  round(w.earned_points * 100.0 / nullif(w.max_points, 0))::integer as completion_pct,
  array_remove(array[
    case when not w.has_identity then 'identity' end,
    case when w.storage_location_id is null then 'location' end,
    case when not w.has_media then 'photos' end,
    case when w.passport_applicable and not w.has_passport then 'passport' end,
    case when w.valuation_applicable and not w.has_valuation then 'valuation' end,
    case when w.acquisition_cost_applicable and not w.has_acquisition_cost then 'acquisition_cost' end
  ]::text[], null) as missing_keys,
  array_remove(array[
    case when not w.has_identity then 'identity' end,
    case when w.storage_location_id is null then 'physical location' end,
    case when not w.has_media then 'photos' end,
    case when w.passport_applicable and not w.has_passport then 'Passport' end,
    case when w.valuation_applicable and not w.has_valuation then 'valuation' end,
    case when w.acquisition_cost_applicable and not w.has_acquisition_cost then 'purchase cost' end
  ]::text[], null) as missing_labels,
  case
    when w.earned_points = w.max_points then 'complete'
    when round(w.earned_points * 100.0 / nullif(w.max_points, 0)) >= 80 then 'good'
    when round(w.earned_points * 100.0 / nullif(w.max_points, 0)) >= 50 then 'needs_attention'
    else 'incomplete'
  end as health_state
from weighted w;

revoke all on table public.item_record_health from public, anon;
grant select on table public.item_record_health to authenticated;

comment on view public.item_record_health is
  'Calculated Item completeness/readiness. Criteria are type- and purpose-aware; source facts remain canonical.';
