alter table public.purchases
  add constraint purchases_workspace_invoice_uq unique (workspace_id, invoice_id);

alter table public.purchase_lots
  add column if not exists invoice_line_id uuid null references public.acquisition_invoice_lines(id) on delete set null;

alter table public.purchase_lots
  add constraint purchase_lots_workspace_invoice_line_uq unique (workspace_id, invoice_line_id);

create or replace function private.sync_acquisition_invoice_purchase(
  p_workspace_id uuid,
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.acquisition_invoices%rowtype;
  v_line public.acquisition_invoice_lines%rowtype;
  v_purchase_id uuid;
  v_lot_id uuid;
  v_ratio numeric;
  v_line_aud numeric;
  v_fees_aud numeric;
  v_postage_aud numeric;
  v_other_aud numeric;
  v_shared_aud numeric;
  v_received integer;
begin
  select * into v_invoice
  from public.acquisition_invoices
  where workspace_id = p_workspace_id and id = p_invoice_id;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.extraction_status <> 'imported' then
    return null;
  end if;

  insert into public.purchases (
    workspace_id, vendor_name, channel, external_order_id, description, category,
    amount, currency, status, ordered_at, invoice_id, amount_aud,
    exchange_rate_to_aud, exchange_rate_date, notes
  ) values (
    p_workspace_id,
    coalesce(v_invoice.vendor_name, ''),
    'Invoice import',
    coalesce(v_invoice.invoice_number, ''),
    concat_ws(' · ', nullif(btrim(v_invoice.vendor_name), ''), case when nullif(btrim(v_invoice.invoice_number), '') is not null then 'Invoice ' || btrim(v_invoice.invoice_number) end),
    'item',
    v_invoice.total,
    coalesce(nullif(v_invoice.currency, ''), 'AUD'),
    'delivered',
    v_invoice.invoice_date,
    v_invoice.id,
    v_invoice.total_aud,
    v_invoice.exchange_rate_to_aud,
    v_invoice.exchange_rate_date,
    'Created automatically from completed invoice intake.'
  )
  on conflict (workspace_id, invoice_id) do update set
    vendor_name = excluded.vendor_name,
    channel = excluded.channel,
    external_order_id = excluded.external_order_id,
    description = excluded.description,
    amount = excluded.amount,
    currency = excluded.currency,
    ordered_at = excluded.ordered_at,
    amount_aud = excluded.amount_aud,
    exchange_rate_to_aud = excluded.exchange_rate_to_aud,
    exchange_rate_date = excluded.exchange_rate_date,
    updated_at = now()
  returning id into v_purchase_id;

  for v_line in
    select *
    from public.acquisition_invoice_lines
    where workspace_id = p_workspace_id
      and invoice_id = p_invoice_id
      and include_on_import = true
    order by line_number nulls last, created_at
  loop
    v_ratio := 0;
    if coalesce(v_line.line_total, 0) > 0 and coalesce(v_invoice.subtotal, 0) > 0 then
      v_ratio := v_line.line_total / v_invoice.subtotal;
    elsif coalesce(v_line.line_total_aud, 0) > 0 and coalesce(v_invoice.subtotal_aud, 0) > 0 then
      v_ratio := v_line.line_total_aud / v_invoice.subtotal_aud;
    end if;

    v_line_aud := coalesce(
      v_line.line_total_aud,
      case when v_line.line_total is not null and v_invoice.exchange_rate_to_aud is not null then round(v_line.line_total * v_invoice.exchange_rate_to_aud, 2) end,
      case when coalesce(nullif(v_invoice.currency, ''), 'AUD') = 'AUD' then v_line.line_total end
    );

    v_fees_aud := coalesce(v_invoice.fees_aud, case when coalesce(nullif(v_invoice.currency, ''), 'AUD') = 'AUD' then v_invoice.fees end, 0);
    v_postage_aud := coalesce(v_invoice.postage_aud, case when coalesce(nullif(v_invoice.currency, ''), 'AUD') = 'AUD' then v_invoice.postage end, 0);
    v_other_aud := greatest(
      coalesce(v_invoice.total_aud, case when coalesce(nullif(v_invoice.currency, ''), 'AUD') = 'AUD' then v_invoice.total end, 0)
      - coalesce(v_invoice.subtotal_aud, case when coalesce(nullif(v_invoice.currency, ''), 'AUD') = 'AUD' then v_invoice.subtotal end, 0)
      - v_fees_aud
      - v_postage_aud,
      0
    );
    v_shared_aud := round((v_fees_aud + v_postage_aud + v_other_aud) * v_ratio, 2);

    insert into public.purchase_lots (
      workspace_id, purchase_id, invoice_line_id, lot_number, title, description,
      category, quantity_expected, quantity_received, amount, currency,
      amount_aud, shared_cost_override_aud, notes
    ) values (
      p_workspace_id,
      v_purchase_id,
      v_line.id,
      coalesce(v_line.lot_number, ''),
      coalesce(nullif(btrim(v_line.proposed_title), ''), nullif(btrim(v_line.raw_text), ''), 'Imported invoice line'),
      coalesce(v_line.raw_text, ''),
      'item',
      greatest(coalesce(v_line.quantity, 1), 1),
      0,
      v_line.line_total,
      coalesce(nullif(v_invoice.currency, ''), 'AUD'),
      v_line_aud,
      nullif(v_shared_aud, 0),
      concat_ws(' · ', 'Imported from invoice intake', nullif(v_line.review_note, ''))
    )
    on conflict (workspace_id, invoice_line_id) do update set
      purchase_id = excluded.purchase_id,
      lot_number = excluded.lot_number,
      title = excluded.title,
      description = excluded.description,
      quantity_expected = excluded.quantity_expected,
      amount = excluded.amount,
      currency = excluded.currency,
      amount_aud = excluded.amount_aud,
      shared_cost_override_aud = excluded.shared_cost_override_aud,
      updated_at = now()
    returning id into v_lot_id;

    if v_line.created_item_id is not null then
      insert into public.purchase_item_links (
        workspace_id, purchase_id, purchase_lot_id, item_id,
        allocated_purchase_cost_aud, allocated_shared_cost_aud
      ) values (
        p_workspace_id,
        v_purchase_id,
        v_lot_id,
        v_line.created_item_id,
        v_line_aud,
        nullif(v_shared_aud, 0)
      )
      on conflict (workspace_id, item_id) do nothing;
    end if;

    select count(*)::integer into v_received
    from public.purchase_item_links
    where workspace_id = p_workspace_id and purchase_lot_id = v_lot_id;

    update public.purchase_lots
    set quantity_received = least(quantity_expected, v_received),
        updated_at = now()
    where workspace_id = p_workspace_id and id = v_lot_id;
  end loop;

  perform public.recalculate_purchase_receiving(p_workspace_id, v_purchase_id);
  return v_purchase_id;
end;
$$;

revoke all on function private.sync_acquisition_invoice_purchase(uuid, uuid) from public, anon, authenticated;

create or replace function private.sync_imported_invoice_purchase_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.extraction_status = 'imported' and old.extraction_status is distinct from new.extraction_status then
    perform private.sync_acquisition_invoice_purchase(new.workspace_id, new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.sync_imported_invoice_purchase_trigger() from public, anon, authenticated;

drop trigger if exists acquisition_invoice_sync_purchase_after_import on public.acquisition_invoices;
create trigger acquisition_invoice_sync_purchase_after_import
after update of extraction_status on public.acquisition_invoices
for each row
execute function private.sync_imported_invoice_purchase_trigger();

select private.sync_acquisition_invoice_purchase(ai.workspace_id, ai.id)
from public.acquisition_invoices ai
where ai.extraction_status = 'imported';
