create or replace function private.refresh_purchase_invoice_reconciliation(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases%rowtype;
  v_invoice public.acquisition_invoices%rowtype;
  v_line_total numeric;
  v_component_total numeric;
  v_parts text[] := array[]::text[];
  v_basis_note text := null;
  v_note text := '';
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id;

  if not found or v_purchase.invoice_id is null then
    return;
  end if;

  select * into v_invoice
  from public.acquisition_invoices
  where id = v_purchase.invoice_id;

  if not found then
    return;
  end if;

  select coalesce(sum(coalesce(line_total_aud, 0)), 0)
  into v_line_total
  from public.acquisition_invoice_lines
  where invoice_id = v_invoice.id;

  v_component_total := coalesce(v_invoice.subtotal_aud, 0)
    + coalesce(v_invoice.fees_aud, 0)
    + coalesce(v_invoice.postage_aud, 0);

  if v_invoice.total_aud is not null
     and (v_invoice.subtotal_aud is not null or v_invoice.fees_aud is not null or v_invoice.postage_aud is not null)
     and abs(v_component_total - v_invoice.total_aud) > 0.005 then
    v_parts := array_append(
      v_parts,
      format(
        'Captured source components total AUD %s while the source states AUD %s (gap %sAUD %s).',
        to_char(v_component_total, 'FM999999990.00'),
        to_char(v_invoice.total_aud, 'FM999999990.00'),
        case when v_component_total - v_invoice.total_aud > 0 then '+' else '' end,
        to_char(v_component_total - v_invoice.total_aud, 'FM999999990.00')
      )
    );
  end if;

  if v_invoice.total_aud is not null
     and v_purchase.amount_aud is not null
     and abs(v_purchase.amount_aud - v_invoice.total_aud) > 0.005 then
    v_parts := array_append(
      v_parts,
      format(
        'Purchase total AUD %s differs from the source invoice total AUD %s by %sAUD %s.',
        to_char(v_purchase.amount_aud, 'FM999999990.00'),
        to_char(v_invoice.total_aud, 'FM999999990.00'),
        case when v_purchase.amount_aud - v_invoice.total_aud > 0 then '+' else '' end,
        to_char(v_purchase.amount_aud - v_invoice.total_aud, 'FM999999990.00')
      )
    );
  end if;

  if v_line_total > 0 and v_invoice.subtotal_aud is not null then
    if abs(v_line_total - v_invoice.subtotal_aud) <= 0.005 then
      v_basis_note := 'Invoice line totals match the subtotal, so fees/postage sit outside the line values and are allocated separately.';
    elsif abs(v_line_total - (coalesce(v_invoice.subtotal_aud,0) + coalesce(v_invoice.fees_aud,0))) <= 0.005 then
      v_basis_note := 'Invoice line totals already include captured fees, so those fees must not be added a second time.';
    elsif v_invoice.total_aud is not null and abs(v_line_total - v_invoice.total_aud) <= 0.005 then
      v_basis_note := 'Invoice line totals already reconcile to the stated invoice total.';
    end if;
  end if;

  if array_length(v_parts, 1) is not null then
    v_note := 'Source reconciliation: ' || array_to_string(v_parts, ' ');
    if v_basis_note is not null then
      v_note := v_note || ' ' || v_basis_note;
    end if;
    v_note := v_note || ' Original source values are preserved; Calibre has not silently corrected the document.';
  end if;

  update public.purchases
  set discrepancy_note = v_note
  where id = p_purchase_id
    and (discrepancy_note = '' or discrepancy_note like 'Source reconciliation:%')
    and discrepancy_note is distinct from v_note;
end;
$$;

create or replace function private.refresh_purchase_invoice_reconciliation_from_purchase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_purchase_invoice_reconciliation(new.id);
  return new;
end;
$$;

create or replace function private.refresh_purchase_invoice_reconciliation_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.id, old.id);
  v_purchase_id uuid;
begin
  for v_purchase_id in
    select id from public.purchases where invoice_id = v_invoice_id
  loop
    perform private.refresh_purchase_invoice_reconciliation(v_purchase_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_purchase_invoice_reconciliation_from_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_purchase_id uuid;
begin
  for v_purchase_id in
    select id from public.purchases where invoice_id = v_invoice_id
  loop
    perform private.refresh_purchase_invoice_reconciliation(v_purchase_id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchases_refresh_invoice_reconciliation on public.purchases;
create trigger purchases_refresh_invoice_reconciliation
after insert or update of invoice_id, amount_aud
on public.purchases
for each row
execute function private.refresh_purchase_invoice_reconciliation_from_purchase();

drop trigger if exists acquisition_invoices_refresh_purchase_reconciliation on public.acquisition_invoices;
create trigger acquisition_invoices_refresh_purchase_reconciliation
after update of subtotal_aud, fees_aud, postage_aud, total_aud
on public.acquisition_invoices
for each row
execute function private.refresh_purchase_invoice_reconciliation_from_invoice();

drop trigger if exists acquisition_invoice_lines_refresh_purchase_reconciliation on public.acquisition_invoice_lines;
create trigger acquisition_invoice_lines_refresh_purchase_reconciliation
after insert or update of line_total_aud or delete
on public.acquisition_invoice_lines
for each row
execute function private.refresh_purchase_invoice_reconciliation_from_line();

do $$
declare
  v_purchase_id uuid;
begin
  for v_purchase_id in select id from public.purchases where invoice_id is not null
  loop
    perform private.refresh_purchase_invoice_reconciliation(v_purchase_id);
  end loop;
end;
$$;