create index if not exists business_ledger_entries_created_by_idx
  on public.business_ledger_entries(created_by)
  where created_by is not null;
