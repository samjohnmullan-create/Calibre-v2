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
  v_alloc record;
  v_received integer;
begin
  select * into v_invoice
  from public.acquisition_invoices
  where workspace_id=p_workspace_id and id=p_invoice_id;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.extraction_status <> 'imported' then return null; end if;

  insert into public.purchases (
    workspace_id,vendor_name,channel,external_order_id,description,category,
    amount,currency,status,ordered_at,invoice_id,amount_aud,
    exchange_rate_to_aud,exchange_rate_date,notes
  ) values (
    p_workspace_id,coalesce(v_invoice.vendor_name,''),'Invoice import',coalesce(v_invoice.invoice_number,''),
    concat_ws(' · ',nullif(btrim(v_invoice.vendor_name),''),case when nullif(btrim(v_invoice.invoice_number),'') is not null then 'Invoice '||btrim(v_invoice.invoice_number) end),
    'item',v_invoice.total,coalesce(nullif(v_invoice.currency,''),'AUD'),'delivered',v_invoice.invoice_date,v_invoice.id,
    v_invoice.total_aud,v_invoice.exchange_rate_to_aud,v_invoice.exchange_rate_date,'Created automatically from completed invoice intake.'
  )
  on conflict (workspace_id,invoice_id) do update set
    vendor_name=excluded.vendor_name,channel=excluded.channel,external_order_id=excluded.external_order_id,
    description=excluded.description,amount=excluded.amount,currency=excluded.currency,ordered_at=excluded.ordered_at,
    amount_aud=excluded.amount_aud,exchange_rate_to_aud=excluded.exchange_rate_to_aud,
    exchange_rate_date=excluded.exchange_rate_date,updated_at=now()
  returning id into v_purchase_id;

  for v_line in
    select * from public.acquisition_invoice_lines
    where workspace_id=p_workspace_id and invoice_id=p_invoice_id
    order by line_number nulls last,created_at,id
  loop
    select * into v_alloc
    from private.acquisition_line_cost_allocation(p_workspace_id,p_invoice_id,v_line.id);

    insert into public.purchase_lots (
      workspace_id,purchase_id,invoice_line_id,lot_number,title,description,category,
      quantity_expected,quantity_received,amount,currency,amount_aud,shared_cost_override_aud,notes
    ) values (
      p_workspace_id,v_purchase_id,v_line.id,coalesce(v_line.lot_number,''),
      coalesce(nullif(btrim(v_line.proposed_title),''),nullif(btrim(v_line.raw_text),''),'Imported invoice line'),
      coalesce(v_line.raw_text,''),
      case when v_line.include_on_import then 'item' else 'other' end,
      greatest(coalesce(v_line.quantity,1),1),0,
      case when v_alloc.allocation_currency=coalesce(nullif(v_invoice.currency,''),'AUD') then v_alloc.purchase_amount else v_line.line_total end,
      coalesce(nullif(v_invoice.currency,''),'AUD'),
      case when v_alloc.allocation_currency='AUD' then v_alloc.purchase_amount else null end,
      case when v_alloc.allocation_currency='AUD' then nullif(coalesce(v_alloc.premium_amount,0)+coalesce(v_alloc.postage_amount,0)+coalesce(v_alloc.other_amount,0),0) else null end,
      concat_ws(' · ','Imported from invoice intake',case when not v_line.include_on_import then 'Not auto-imported; classify during receiving' end,nullif(v_line.review_note,''),v_alloc.allocation_mode)
    )
    on conflict (workspace_id,invoice_line_id) do update set
      purchase_id=excluded.purchase_id,lot_number=excluded.lot_number,title=excluded.title,
      description=excluded.description,
      category=case when public.purchase_lots.category='other' or excluded.category='item' then excluded.category else public.purchase_lots.category end,
      quantity_expected=excluded.quantity_expected,amount=excluded.amount,
      currency=excluded.currency,amount_aud=excluded.amount_aud,shared_cost_override_aud=excluded.shared_cost_override_aud,
      notes=excluded.notes,updated_at=now()
    returning id into v_lot_id;

    if v_line.created_item_id is not null then
      insert into public.purchase_item_links (
        workspace_id,purchase_id,purchase_lot_id,item_id,allocated_purchase_cost_aud,allocated_shared_cost_aud
      ) values (
        p_workspace_id,v_purchase_id,v_lot_id,v_line.created_item_id,
        case when v_alloc.allocation_currency='AUD' then v_alloc.purchase_amount else null end,
        case when v_alloc.allocation_currency='AUD' then nullif(coalesce(v_alloc.premium_amount,0)+coalesce(v_alloc.postage_amount,0)+coalesce(v_alloc.other_amount,0),0) else null end
      )
      on conflict (workspace_id,item_id) do update set
        allocated_purchase_cost_aud=excluded.allocated_purchase_cost_aud,
        allocated_shared_cost_aud=excluded.allocated_shared_cost_aud
      where public.purchase_item_links.purchase_id=excluded.purchase_id
        and public.purchase_item_links.purchase_lot_id=excluded.purchase_lot_id;
    end if;

    select count(*)::integer into v_received
    from public.purchase_item_links
    where workspace_id=p_workspace_id and purchase_lot_id=v_lot_id;

    update public.purchase_lots
    set quantity_received=least(quantity_expected,v_received),updated_at=now()
    where workspace_id=p_workspace_id and id=v_lot_id;
  end loop;

  perform public.recalculate_purchase_receiving(p_workspace_id,v_purchase_id);
  return v_purchase_id;
end;
$$;

select private.sync_acquisition_invoice_purchase(ai.workspace_id,ai.id)
from public.acquisition_invoices ai
where ai.extraction_status='imported';
