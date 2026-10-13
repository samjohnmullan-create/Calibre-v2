create or replace view public.business_item_economics
with (security_invoker = true)
as
select
  i.workspace_id,
  i.id as item_id,
  i.item_number,
  i.title,
  i.type,
  i.purpose,
  i.status,
  i.acquired_at,
  i.created_at,
  coalesce(c.total_cost_aud, 0::numeric) as invested_aud,
  v.id as valuation_id,
  v.low_value,
  v.expected_value,
  v.high_value,
  v.target_value,
  v.minimum_value,
  v.currency as valuation_currency,
  v.confidence as valuation_confidence,
  v.basis as valuation_basis,
  v.valued_at,
  s.id as sale_id,
  s.status as sale_status,
  s.channel,
  s.listing_title,
  s.asking_price,
  s.sale_price,
  s.currency as sale_currency,
  s.listed_at,
  s.sold_at,
  s.marketplace_fees,
  s.shipping_to_buyer,
  case
    when s.status = 'sold' and s.currency = 'AUD' and s.sale_price is not null
      then s.sale_price - coalesce(s.marketplace_fees, 0) - coalesce(s.shipping_to_buyer, 0)
    else null
  end as net_proceeds_aud,
  case
    when s.status = 'sold' and s.currency = 'AUD' and s.sale_price is not null
      then s.sale_price - coalesce(s.marketplace_fees, 0) - coalesce(s.shipping_to_buyer, 0) - coalesce(c.total_cost_aud, 0)
    else null
  end as realised_profit_aud,
  case
    when v.currency = 'AUD' and v.target_value is not null
      then v.target_value - coalesce(c.total_cost_aud, 0)
    else null
  end as potential_profit_aud,
  greatest(0, current_date - coalesce(i.acquired_at, i.created_at::date))::integer as age_days
from public.items i
left join lateral (
  select sum(ce.amount) filter (where ce.currency = 'AUD') as total_cost_aud
  from public.cost_entries ce
  where ce.workspace_id = i.workspace_id
    and ce.item_id = i.id
) c on true
left join lateral (
  select val.*
  from public.valuations val
  where val.workspace_id = i.workspace_id
    and val.item_id = i.id
  order by val.valued_at desc, val.created_at desc, val.id desc
  limit 1
) v on true
left join lateral (
  select sale.*
  from public.sales sale
  where sale.workspace_id = i.workspace_id
    and sale.item_id = i.id
  order by sale.created_at desc, sale.id desc
  limit 1
) s on true
where i.archived_at is null;

grant select on public.business_item_economics to authenticated;

create or replace function public.business_summary(p_workspace_id uuid)
returns table (
  stock_count bigint,
  stock_invested_aud numeric,
  target_value_aud numeric,
  expected_value_aud numeric,
  potential_gross_aud numeric,
  valued_stock_count bigint,
  ready_count bigint,
  listed_count bigint,
  needs_valuation_count bigint,
  aged_stock_count bigint,
  sold_count bigint,
  sold_revenue_aud numeric,
  realised_profit_aud numeric,
  active_offer_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with econ as (
    select * from public.business_item_economics where workspace_id = p_workspace_id
  ),
  stock as (
    select * from econ where status <> 'sold' and coalesce(sale_status, '') <> 'sold'
  ),
  sold as (
    select * from econ where status = 'sold' or sale_status = 'sold'
  )
  select
    (select count(*) from stock)::bigint,
    coalesce((select sum(invested_aud) from stock), 0::numeric),
    coalesce((select sum(target_value) from stock where valuation_currency = 'AUD'), 0::numeric),
    coalesce((select sum(expected_value) from stock where valuation_currency = 'AUD'), 0::numeric),
    coalesce((select sum(target_value - invested_aud) from stock where valuation_currency = 'AUD' and target_value is not null), 0::numeric),
    (select count(*) from stock where valuation_currency = 'AUD' and target_value is not null)::bigint,
    (select count(*) from stock where status = 'ready_for_sale')::bigint,
    (select count(*) from econ where status = 'listed' or sale_status = 'listed')::bigint,
    (select count(*) from stock where valuation_id is null)::bigint,
    (select count(*) from stock where age_days >= 90)::bigint,
    (select count(*) from sold)::bigint,
    coalesce((select sum(sale_price) from sold where sale_currency = 'AUD' and sale_price is not null), 0::numeric),
    coalesce((select sum(realised_profit_aud) from sold where realised_profit_aud is not null), 0::numeric),
    (select count(*)::bigint from public.offers o where o.workspace_id = p_workspace_id and o.status = 'received');
$$;

grant execute on function public.business_summary(uuid) to authenticated;

create index if not exists valuations_workspace_item_valued_idx
  on public.valuations (workspace_id, item_id, valued_at desc, created_at desc);
create index if not exists sales_workspace_item_created_idx
  on public.sales (workspace_id, item_id, created_at desc);
create index if not exists offers_workspace_status_idx
  on public.offers (workspace_id, status);
create index if not exists cost_entries_workspace_item_currency_idx
  on public.cost_entries (workspace_id, item_id, currency);
