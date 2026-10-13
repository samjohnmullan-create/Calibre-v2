create table if not exists public.business_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entry_type text not null default 'expense' check (entry_type in ('expense','income')),
  treatment text not null default 'operating' check (treatment in ('operating','capital','other')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AUD',
  amount_aud numeric(12,2) check (amount_aud is null or amount_aud >= 0),
  occurred_at date not null default current_date,
  vendor text not null default '',
  reference text not null default '',
  notes text not null default '',
  purchase_id uuid references public.purchases(id) on delete set null,
  external_key text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_entries_currency_nonempty check (length(trim(currency)) > 0),
  constraint business_ledger_entries_category_nonempty check (length(trim(category)) > 0),
  constraint business_ledger_entries_description_nonempty check (length(trim(description)) > 0),
  constraint business_ledger_entries_aud_consistent check (currency <> 'AUD' or amount_aud is null or amount_aud = amount)
);

create index if not exists business_ledger_entries_workspace_date_idx
  on public.business_ledger_entries(workspace_id, occurred_at desc, created_at desc);
create index if not exists business_ledger_entries_workspace_category_idx
  on public.business_ledger_entries(workspace_id, category);
create index if not exists business_ledger_entries_purchase_idx
  on public.business_ledger_entries(purchase_id)
  where purchase_id is not null;
create unique index if not exists business_ledger_entries_external_key_uq
  on public.business_ledger_entries(workspace_id, external_key)
  where external_key <> '';

alter table public.business_ledger_entries enable row level security;

revoke all on table public.business_ledger_entries from anon, authenticated;
grant select, insert, update, delete on table public.business_ledger_entries to authenticated;

create policy business_ledger_entries_select
  on public.business_ledger_entries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = business_ledger_entries.workspace_id
        and m.user_id = (select auth.uid())
    )
  );

create policy business_ledger_entries_insert
  on public.business_ledger_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = business_ledger_entries.workspace_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner','editor')
    )
  );

create policy business_ledger_entries_update
  on public.business_ledger_entries
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = business_ledger_entries.workspace_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner','editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = business_ledger_entries.workspace_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner','editor')
    )
  );

create policy business_ledger_entries_delete
  on public.business_ledger_entries
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = business_ledger_entries.workspace_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner','editor')
    )
  );