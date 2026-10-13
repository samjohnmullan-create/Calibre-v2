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
    coalesce((select sum(target_value) from stock where valuation_currency = 'AUD'), 0::numeric)
      - coalesce((select sum(invested_aud) from stock), 0::numeric),
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
