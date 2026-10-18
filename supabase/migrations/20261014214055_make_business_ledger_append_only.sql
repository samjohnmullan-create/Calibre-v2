-- Business Ledger history is accounting evidence.
-- Existing rows are immutable; corrections are represented by linked reversal rows.

alter table public.business_ledger_entries
  add column if not exists reversal_of_entry_id uuid references public.business_ledger_entries(id) on delete restrict,
  add column if not exists reversal_reason text not null default '';

create unique index if not exists business_ledger_entries_one_reversal_idx
  on public.business_ledger_entries (reversal_of_entry_id)
  where reversal_of_entry_id is not null;

create index if not exists business_ledger_entries_reversal_lookup_idx
  on public.business_ledger_entries (workspace_id, reversal_of_entry_id)
  where reversal_of_entry_id is not null;

create or replace function public.guard_business_ledger_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Business Ledger history cannot be deleted. Reverse the entry instead.';
  end if;

  raise exception 'Business Ledger history is immutable. Reverse the entry and add the corrected record instead.';
end;
$$;

revoke all on function public.guard_business_ledger_history() from public, anon, authenticated;

create trigger business_ledger_entries_immutable
before update or delete on public.business_ledger_entries
for each row execute function public.guard_business_ledger_history();

create or replace function public.reverse_business_ledger_entry(
  p_workspace_id uuid,
  p_entry_id uuid,
  p_reason text default ''
)
returns public.business_ledger_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_original public.business_ledger_entries%rowtype;
  v_reversal public.business_ledger_entries%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_original
  from public.business_ledger_entries
  where workspace_id = p_workspace_id
    and id = p_entry_id
  for share;

  if not found then
    raise exception 'Ledger entry not found';
  end if;

  if v_original.reversal_of_entry_id is not null then
    raise exception 'A reversal entry cannot itself be reversed';
  end if;

  if v_original.purchase_id is not null or btrim(coalesce(v_original.external_key, '')) <> '' then
    raise exception 'Source-linked ledger entries must be corrected at their source record';
  end if;

  if exists (
    select 1
    from public.business_ledger_entries r
    where r.workspace_id = p_workspace_id
      and r.reversal_of_entry_id = p_entry_id
  ) then
    raise exception 'This ledger entry has already been reversed';
  end if;

  insert into public.business_ledger_entries (
    workspace_id, entry_type, treatment, category, description, amount, currency,
    amount_aud, occurred_at, vendor, reference, notes, purchase_id, external_key,
    created_by, reversal_of_entry_id, reversal_reason
  ) values (
    p_workspace_id,
    case when v_original.entry_type = 'expense' then 'income' else 'expense' end,
    v_original.treatment, v_original.category,
    'Reversal: ' || v_original.description,
    v_original.amount, v_original.currency, v_original.amount_aud, current_date,
    v_original.vendor, v_original.reference,
    case when v_reason = '' then 'Reversal of ledger entry ' || v_original.id::text
         else 'Reversal of ledger entry ' || v_original.id::text || '. Reason: ' || v_reason end,
    null, 'ledger-reversal:' || v_original.id::text, auth.uid(), v_original.id, v_reason
  ) returning * into v_reversal;

  return v_reversal;
end;
$$;

revoke all on function public.reverse_business_ledger_entry(uuid, uuid, text) from public, anon;
grant execute on function public.reverse_business_ledger_entry(uuid, uuid, text) to authenticated;
