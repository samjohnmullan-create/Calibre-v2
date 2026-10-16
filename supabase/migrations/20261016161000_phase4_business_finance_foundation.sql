create or replace view public.business_item_finance
with (security_invoker = true)
as
with direct_costs as (
  select
    ce.workspace_id,
    ce.item_id,
    coalesce(sum(ce.amount) filter (where ce.currency = 'AUD'), 0::numeric) as direct_cost_aud,
    count(*) filter (where ce.currency <> 'AUD')::bigint as unconverted_direct_cost_count
  from public.cost_entries ce
  group by ce.workspace_id, ce.item_id
),
used_parts as (
  select
    pa.workspace_id,
    pa.item_id,
    coalesce(sum(pa.quantity * coalesce(p.unit_cost, 0)) filter (where p.currency = 'AUD'), 0::numeric) as used_parts_cost_aud,
    count(*) filter (where p.currency <> 'AUD' and p.unit_cost is not null)::bigint as unconverted_part_cost_count,
    count(*)::bigint as used_part_lines
  from public.part_allocations pa
  join public.work_records wr
    on wr.workspace_id = pa.workspace_id
   and wr.id = pa.work_record_id
   and wr.data_mode = 'real'
  join public.parts p
    on p.workspace_id = pa.workspace_id
   and p.id = pa.part_id
  where pa.status = 'used'
  group by pa.workspace_id, pa.item_id
),
bench_time as (
  select
    seg.workspace_id,
    seg.item_id,
    coalesce(sum(extract(epoch from (seg.ended_at - seg.started_at))) filter (where seg.ended_at is not null), 0::numeric) as bench_seconds
  from public.work_session_segments seg
  join public.work_records wr
    on wr.workspace_id = seg.workspace_id
   and wr.id = seg.work_id
   and wr.data_mode = 'real'
  group by seg.workspace_id, seg.item_id
)
select
  e.workspace_id,
  e.item_id,
  e.item_number,
  e.title,
  e.type,
  e.purpose,
  e.status,
  e.acquired_at,
  e.created_at,
  e.age_days,
  coalesce(dc.direct_cost_aud, 0::numeric) as direct_cost_aud,
  coalesce(up.used_parts_cost_aud, 0::numeric) as used_parts_cost_aud,
  coalesce(dc.direct_cost_aud, 0::numeric) + coalesce(up.used_parts_cost_aud, 0::numeric) as capital_invested_aud,
  coalesce(dc.unconverted_direct_cost_count, 0::bigint) as unconverted_direct_cost_count,
  coalesce(up.unconverted_part_cost_count, 0::bigint) as unconverted_part_cost_count,
  coalesce(up.used_part_lines, 0::bigint) as used_part_lines,
  coalesce(bt.bench_seconds, 0::numeric) as bench_seconds,
  round(coalesce(bt.bench_seconds, 0::numeric) / 3600.0, 2) as bench_hours,
  e.valuation_id,
  e.expected_value,
  e.target_value,
  e.valuation_currency,
  e.sale_id,
  e.sale_status,
  e.channel,
  e.sale_price,
  e.sale_currency,
  e.sold_at,
  e.marketplace_fees,
  e.shipping_to_buyer,
  e.net_proceeds_aud,
  case
    when e.net_proceeds_aud is not null then
      e.net_proceeds_aud - coalesce(dc.direct_cost_aud, 0::numeric) - coalesce(up.used_parts_cost_aud, 0::numeric)
    else null::numeric
  end as realised_profit_before_labour_aud,
  case
    when e.net_proceeds_aud is not null and coalesce(bt.bench_seconds, 0) > 0 then
      round((e.net_proceeds_aud - coalesce(dc.direct_cost_aud, 0::numeric) - coalesce(up.used_parts_cost_aud, 0::numeric)) / (bt.bench_seconds / 3600.0), 2)
    else null::numeric
  end as realised_profit_per_bench_hour_aud,
  case
    when e.valuation_currency = 'AUD' and e.target_value is not null then
      e.target_value - coalesce(dc.direct_cost_aud, 0::numeric) - coalesce(up.used_parts_cost_aud, 0::numeric)
    else null::numeric
  end as potential_profit_before_labour_aud,
  case
    when e.valuation_currency = 'AUD' and e.target_value is not null and coalesce(bt.bench_seconds, 0) > 0 then
      round((e.target_value - coalesce(dc.direct_cost_aud, 0::numeric) - coalesce(up.used_parts_cost_aud, 0::numeric)) / (bt.bench_seconds / 3600.0), 2)
    else null::numeric
  end as potential_profit_per_bench_hour_aud,
  case
    when (coalesce(dc.direct_cost_aud, 0::numeric) + coalesce(up.used_parts_cost_aud, 0::numeric)) > 0
      and e.net_proceeds_aud is not null then
      round(((e.net_proceeds_aud - coalesce(dc.direct_cost_aud, 0::numeric) - coalesce(up.used_parts_cost_aud, 0::numeric)) / (coalesce(dc.direct_cost_aud, 0::numeric) + coalesce(up.used_parts_cost_aud, 0::numeric))) * 100, 1)
    when (coalesce(dc.direct_cost_aud, 0::numeric) + coalesce(up.used_parts_cost_aud, 0::numeric)) > 0
      and e.valuation_currency = 'AUD' and e.target_value is not null then
      round(((e.target_value - coalesce(dc.direct_cost_aud, 0::numeric) - coalesce(up.used_parts_cost_aud, 0::numeric)) / (coalesce(dc.direct_cost_aud, 0::numeric) + coalesce(up.used_parts_cost_aud, 0::numeric))) * 100, 1)
    else null::numeric
  end as capital_return_pct
from public.business_item_economics e
join public.items i
  on i.workspace_id = e.workspace_id
 and i.id = e.item_id
left join direct_costs dc on dc.workspace_id = e.workspace_id and dc.item_id = e.item_id
left join used_parts up on up.workspace_id = e.workspace_id and up.item_id = e.item_id
left join bench_time bt on bt.workspace_id = e.workspace_id and bt.item_id = e.item_id
where i.data_mode = 'real';

grant select on public.business_item_finance to authenticated;
revoke all on public.business_item_finance from anon;

create or replace function public.business_finance_summary(p_workspace_id uuid)
returns table (
  active_items bigint,
  stock_capital_aud numeric,
  stock_target_value_aud numeric,
  stock_potential_profit_aud numeric,
  stock_bench_hours numeric,
  aged_capital_aud numeric,
  sold_items bigint,
  realised_profit_before_labour_aud numeric,
  sold_bench_hours numeric,
  realised_profit_per_bench_hour_aud numeric,
  missing_conversion_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with member as (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  ),
  finance as (
    select bif.*
    from public.business_item_finance bif
    where bif.workspace_id = p_workspace_id
      and exists (select 1 from member)
  ),
  stock as (
    select * from finance
    where status <> 'sold' and coalesce(sale_status, '') <> 'sold'
  ),
  sold as (
    select * from finance
    where status = 'sold' or sale_status = 'sold'
  )
  select
    (select count(*) from stock)::bigint,
    coalesce((select sum(capital_invested_aud) from stock), 0::numeric),
    coalesce((select sum(target_value) from stock where valuation_currency = 'AUD'), 0::numeric),
    coalesce((select sum(potential_profit_before_labour_aud) from stock where potential_profit_before_labour_aud is not null), 0::numeric),
    coalesce((select sum(bench_hours) from stock), 0::numeric),
    coalesce((select sum(capital_invested_aud) from stock where age_days >= 90), 0::numeric),
    (select count(*) from sold)::bigint,
    coalesce((select sum(realised_profit_before_labour_aud) from sold where realised_profit_before_labour_aud is not null), 0::numeric),
    coalesce((select sum(bench_hours) from sold), 0::numeric),
    case
      when coalesce((select sum(bench_hours) from sold), 0) > 0 then
        round(coalesce((select sum(realised_profit_before_labour_aud) from sold where realised_profit_before_labour_aud is not null), 0) / (select sum(bench_hours) from sold), 2)
      else null::numeric
    end,
    coalesce((select sum(unconverted_direct_cost_count + unconverted_part_cost_count) from finance), 0)::bigint;
$function$;

revoke all on function public.business_finance_summary(uuid) from public, anon;
grant execute on function public.business_finance_summary(uuid) to authenticated;
