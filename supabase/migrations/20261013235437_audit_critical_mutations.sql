create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.log_calibre_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  row_payload jsonb;
  ws_id uuid;
  record_id uuid;
  actor uuid;
begin
  old_payload := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  new_payload := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  if tg_op = 'UPDATE'
     and (old_payload - 'updated_at') is not distinct from (new_payload - 'updated_at') then
    return new;
  end if;

  row_payload := coalesce(new_payload, old_payload);
  ws_id := nullif(row_payload ->> 'workspace_id', '')::uuid;
  record_id := nullif(row_payload ->> 'id', '')::uuid;
  actor := auth.uid();

  insert into public.audit_events (
    workspace_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    actor_id,
    actor_type,
    source,
    device_id
  ) values (
    ws_id,
    tg_table_name,
    record_id,
    lower(tg_op),
    old_payload,
    new_payload,
    actor,
    case when actor is null then 'system' else 'user' end,
    'database_trigger',
    ''
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.log_calibre_audit_event() from public, anon, authenticated;

create or replace trigger audit_items_mutations
after insert or update or delete on public.items
for each row execute function private.log_calibre_audit_event();

create or replace trigger audit_work_records_mutations
after insert or update or delete on public.work_records
for each row execute function private.log_calibre_audit_event();

create or replace trigger audit_cost_entries_mutations
after insert or update or delete on public.cost_entries
for each row execute function private.log_calibre_audit_event();

create or replace trigger audit_valuations_mutations
after insert or update or delete on public.valuations
for each row execute function private.log_calibre_audit_event();

create or replace trigger audit_sales_mutations
after insert or update or delete on public.sales
for each row execute function private.log_calibre_audit_event();

create or replace trigger audit_business_ledger_mutations
after insert or update or delete on public.business_ledger_entries
for each row execute function private.log_calibre_audit_event();
