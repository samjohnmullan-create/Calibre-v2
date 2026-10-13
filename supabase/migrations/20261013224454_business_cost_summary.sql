create or replace function public.business_cost_summary(p_workspace_id uuid)
returns table (
  category text,
  currency text,
  total_amount numeric,
  entry_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    ce.category,
    ce.currency,
    coalesce(sum(ce.amount), 0::numeric) as total_amount,
    count(*)::bigint as entry_count
  from public.cost_entries ce
  where ce.workspace_id = p_workspace_id
  group by ce.category, ce.currency
  order by sum(ce.amount) desc, ce.category, ce.currency;
$$;

grant execute on function public.business_cost_summary(uuid) to authenticated;

create index if not exists cost_entries_workspace_incurred_idx
  on public.cost_entries (workspace_id, incurred_at desc, created_at desc);
