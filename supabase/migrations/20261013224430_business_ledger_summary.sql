create or replace function public.business_ledger_summary(p_workspace_id uuid)
returns table (
  operating_expenses_aud numeric,
  capital_expenses_aud numeric,
  other_expenses_aud numeric,
  income_aud numeric,
  net_cash_impact_aud numeric,
  missing_aud_count bigint,
  entry_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with ledger as (
    select
      entry_type,
      treatment,
      case when currency = 'AUD' then amount else amount_aud end as aud_value
    from public.business_ledger_entries
    where workspace_id = p_workspace_id
  )
  select
    coalesce(sum(aud_value) filter (where entry_type = 'expense' and treatment = 'operating'), 0::numeric),
    coalesce(sum(aud_value) filter (where entry_type = 'expense' and treatment = 'capital'), 0::numeric),
    coalesce(sum(aud_value) filter (where entry_type = 'expense' and treatment = 'other'), 0::numeric),
    coalesce(sum(aud_value) filter (where entry_type = 'income'), 0::numeric),
    coalesce(sum(aud_value) filter (where entry_type = 'income'), 0::numeric)
      - coalesce(sum(aud_value) filter (where entry_type = 'expense'), 0::numeric),
    count(*) filter (where aud_value is null)::bigint,
    count(*)::bigint
  from ledger;
$$;

grant execute on function public.business_ledger_summary(uuid) to authenticated;

create index if not exists business_ledger_workspace_type_date_idx
  on public.business_ledger_entries (workspace_id, entry_type, occurred_at desc, created_at desc);
