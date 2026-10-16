create or replace function public.business_deeper_analytics(p_workspace_id uuid)
returns table(
  completed_work_count bigint,
  avg_turnaround_days numeric,
  median_turnaround_days numeric,
  avg_bench_hours_per_completed_work numeric,
  stale_unlisted_capital_aud numeric,
  stale_unlisted_items bigint,
  valued_active_items bigint,
  active_items_with_bench_time bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with member as (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  ),
  completed as (
    select
      wr.id,
      greatest(0::numeric, (extract(epoch from (wr.completed_at - wr.opened_at)) / 86400.0)::numeric) as turnaround_days
    from public.work_records wr
    where wr.workspace_id = p_workspace_id
      and wr.data_mode = 'real'
      and wr.status = 'complete'
      and wr.completed_at is not null
      and wr.opened_at is not null
      and exists (select 1 from member)
  ),
  completed_bench as (
    select
      c.id,
      (coalesce(sum(extract(epoch from (seg.ended_at - seg.started_at))) filter (where seg.ended_at is not null), 0)::numeric / 3600.0)::numeric as bench_hours
    from completed c
    left join public.work_session_segments seg
      on seg.workspace_id = p_workspace_id
     and seg.work_id = c.id
    group by c.id
  ),
  finance as (
    select bif.*
    from public.business_item_finance bif
    where bif.workspace_id = p_workspace_id
      and exists (select 1 from member)
  ),
  active as (
    select *
    from finance
    where status <> 'sold'
      and coalesce(sale_status, '') <> 'sold'
  )
  select
    (select count(*) from completed)::bigint,
    round(coalesce((select avg(turnaround_days) from completed), 0::numeric), 1),
    round(coalesce((select percentile_cont(0.5) within group (order by turnaround_days)::numeric from completed), 0::numeric), 1),
    round(coalesce((select avg(bench_hours) from completed_bench), 0::numeric), 2),
    coalesce((select sum(capital_invested_aud) from active where age_days >= 90 and coalesce(sale_status, '') <> 'listed'), 0::numeric),
    (select count(*) from active where age_days >= 90 and coalesce(sale_status, '') <> 'listed')::bigint,
    (select count(*) from active where valuation_currency = 'AUD' and target_value is not null)::bigint,
    (select count(*) from active where bench_hours > 0)::bigint;
$$;

revoke all on function public.business_deeper_analytics(uuid) from public;
revoke all on function public.business_deeper_analytics(uuid) from anon;
grant execute on function public.business_deeper_analytics(uuid) to authenticated;

comment on function public.business_deeper_analytics(uuid) is 'Phase 4 deterministic Business Intelligence summary. Real data only; Test/Demo is excluded by source views/filters.';
