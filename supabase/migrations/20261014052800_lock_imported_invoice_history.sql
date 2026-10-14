create or replace function private.prevent_imported_invoice_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.extraction_status = 'imported' then
    raise exception 'Imported acquisition invoices are read-only history';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_imported_invoice_line_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_status text;
begin
  v_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;

  select ai.extraction_status
    into v_status
  from public.acquisition_invoices ai
  where ai.id = v_invoice_id;

  if v_status = 'imported' then
    raise exception 'Lines belonging to an imported acquisition invoice are read-only history';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists acquisition_invoices_lock_imported on public.acquisition_invoices;
create trigger acquisition_invoices_lock_imported
before update or delete on public.acquisition_invoices
for each row execute function private.prevent_imported_invoice_mutation();

drop trigger if exists acquisition_invoice_lines_lock_imported on public.acquisition_invoice_lines;
create trigger acquisition_invoice_lines_lock_imported
before insert or update or delete on public.acquisition_invoice_lines
for each row execute function private.prevent_imported_invoice_line_mutation();
