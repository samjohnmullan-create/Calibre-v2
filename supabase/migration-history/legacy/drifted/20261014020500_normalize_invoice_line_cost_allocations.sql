create or replace function private.acquisition_line_cost_allocation(
  p_workspace_id uuid,
  p_invoice_id uuid,
  p_line_id uuid
)
returns table (
  allocation_currency text,
  purchase_amount numeric,
  premium_amount numeric,
  postage_amount numeric,
  other_amount numeric,
  total_allocated numeric,
  allocation_mode text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.acquisition_invoices%rowtype;
  v_line public.acquisition_invoice_lines%rowtype;
  v_sum_lines numeric := 0;
  v_sum_lines_aud numeric := 0;
  v_ratio numeric := 0;
  v_tolerance numeric := 0.05;
  v_gross_lines boolean := false;
  v_subtotal numeric := 0;
  v_fees numeric := 0;
  v_postage numeric := 0;
  v_total numeric := 0;
  v_other numeric := 0;
begin
  select * into v_invoice
  from public.acquisition_invoices
  where workspace_id=p_workspace_id and id=p_invoice_id;
  if not found then raise exception 'Invoice not found'; end if;

  select * into v_line
  from public.acquisition_invoice_lines
  where workspace_id=p_workspace_id and invoice_id=p_invoice_id and id=p_line_id;
  if not found then raise exception 'Invoice line not found'; end if;

  select coalesce(sum(line_total),0), coalesce(sum(line_total_aud),0)
    into v_sum_lines, v_sum_lines_aud
  from public.acquisition_invoice_lines
  where workspace_id=p_workspace_id and invoice_id=p_invoice_id;

  if coalesce(v_invoice.total,0) > 0 then
    v_tolerance := greatest(0.05, abs(v_invoice.total) * 0.005);
    v_gross_lines := abs(v_sum_lines - v_invoice.total) <= v_tolerance
      and (coalesce(v_invoice.subtotal,0) = 0 or abs(v_sum_lines - v_invoice.subtotal) > v_tolerance);
  elsif coalesce(v_invoice.total_aud,0) > 0 then
    v_tolerance := greatest(0.05, abs(v_invoice.total_aud) * 0.005);
    v_gross_lines := abs(v_sum_lines_aud - v_invoice.total_aud) <= v_tolerance
      and (coalesce(v_invoice.subtotal_aud,0) = 0 or abs(v_sum_lines_aud - v_invoice.subtotal_aud) > v_tolerance);
  end if;

  if v_invoice.total_aud is not null or v_line.line_total_aud is not null then
    allocation_currency := 'AUD';
    v_subtotal := coalesce(v_invoice.subtotal_aud, case when coalesce(nullif(v_invoice.currency,''),'AUD')='AUD' then v_invoice.subtotal end, 0);
    v_fees := coalesce(v_invoice.fees_aud, case when coalesce(nullif(v_invoice.currency,''),'AUD')='AUD' then v_invoice.fees end, 0);
    v_postage := coalesce(v_invoice.postage_aud, case when coalesce(nullif(v_invoice.currency,''),'AUD')='AUD' then v_invoice.postage end, 0);
    v_total := coalesce(v_invoice.total_aud, case when coalesce(nullif(v_invoice.currency,''),'AUD')='AUD' then v_invoice.total end, 0);
  else
    allocation_currency := coalesce(nullif(v_invoice.currency,''),'AUD');
    v_subtotal := coalesce(v_invoice.subtotal,0);
    v_fees := coalesce(v_invoice.fees,0);
    v_postage := coalesce(v_invoice.postage,0);
    v_total := coalesce(v_invoice.total,0);
  end if;
  v_other := greatest(v_total - v_subtotal - v_fees - v_postage, 0);

  if v_gross_lines then
    allocation_mode := 'gross_line_totals';
    if coalesce(v_invoice.total,0) > 0 and coalesce(v_line.line_total,0) > 0 then
      v_ratio := v_line.line_total / v_invoice.total;
    elsif coalesce(v_invoice.total_aud,0) > 0 and coalesce(v_line.line_total_aud,0) > 0 then
      v_ratio := v_line.line_total_aud / v_invoice.total_aud;
    end if;
    purchase_amount := round(v_subtotal * v_ratio, 2);
    premium_amount := round(v_fees * v_ratio, 2);
    postage_amount := round(v_postage * v_ratio, 2);
    other_amount := round(v_other * v_ratio, 2);
  else
    allocation_mode := 'net_line_totals';
    if coalesce(v_invoice.subtotal,0) > 0 and coalesce(v_line.line_total,0) > 0 then
      v_ratio := v_line.line_total / v_invoice.subtotal;
    elsif coalesce(v_invoice.subtotal_aud,0) > 0 and coalesce(v_line.line_total_aud,0) > 0 then
      v_ratio := v_line.line_total_aud / v_invoice.subtotal_aud;
    end if;
    if allocation_currency='AUD' then
      purchase_amount := coalesce(
        v_line.line_total_aud,
        case when v_line.line_total is not null and v_invoice.exchange_rate_to_aud is not null then round(v_line.line_total * v_invoice.exchange_rate_to_aud,2) end,
        case when coalesce(nullif(v_invoice.currency,''),'AUD')='AUD' then v_line.line_total end,
        0
      );
    else
      purchase_amount := coalesce(v_line.line_total,0);
    end if;
    premium_amount := round(v_fees * v_ratio, 2);
    postage_amount := round(v_postage * v_ratio, 2);
    other_amount := round(v_other * v_ratio, 2);
  end if;

  total_allocated := round(coalesce(purchase_amount,0)+coalesce(premium_amount,0)+coalesce(postage_amount,0)+coalesce(other_amount,0),2);
  return next;
end;
$$;

revoke all on function private.acquisition_line_cost_allocation(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.capture_acquisition_line_costs()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_invoice public.acquisition_invoices%rowtype;
  v_alloc record;
  v_note text;
  v_date date;
begin
  if new.created_item_id is null or old.created_item_id is not distinct from new.created_item_id then
    return new;
  end if;

  select * into v_invoice
  from public.acquisition_invoices
  where id = new.invoice_id and workspace_id = new.workspace_id;
  if not found then return new; end if;

  select * into v_alloc
  from private.acquisition_line_cost_allocation(new.workspace_id,new.invoice_id,new.id);

  v_date := coalesce(v_invoice.invoice_date,current_date);
  v_note := concat_ws(' · ',
    'Invoice allocation',
    nullif(btrim(v_invoice.vendor_name),''),
    case when nullif(btrim(v_invoice.invoice_number),'') is not null then 'Invoice '||btrim(v_invoice.invoice_number) end,
    case when nullif(btrim(new.lot_number),'') is not null then 'Lot '||btrim(new.lot_number) end,
    case when v_alloc.allocation_mode='gross_line_totals' then 'gross-line normalized' else 'net-line allocated' end
  );

  if coalesce(v_alloc.purchase_amount,0)>0 then
    insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes)
    values(new.workspace_id,new.created_item_id,'purchase',v_alloc.purchase_amount,v_alloc.allocation_currency,v_date,v_note);
  end if;
  if coalesce(v_alloc.premium_amount,0)>0 then
    insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes)
    values(new.workspace_id,new.created_item_id,'buyer_premium',v_alloc.premium_amount,v_alloc.allocation_currency,v_date,v_note);
  end if;
  if coalesce(v_alloc.postage_amount,0)>0 then
    insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes)
    values(new.workspace_id,new.created_item_id,'postage',v_alloc.postage_amount,v_alloc.allocation_currency,v_date,v_note);
  end if;
  if coalesce(v_alloc.other_amount,0)>0 then
    insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes)
    values(new.workspace_id,new.created_item_id,'other',v_alloc.other_amount,v_alloc.allocation_currency,v_date,v_note||' · Unclassified invoice charge');
  end if;

  return new;
end;
$$;

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
    where workspace_id=p_workspace_id and invoice_id=p_invoice_id and include_on_import=true
    order by line_number nulls last,created_at
  loop
    select * into v_alloc
    from private.acquisition_line_cost_allocation(p_workspace_id,p_invoice_id,v_line.id);

    insert into public.purchase_lots (
      workspace_id,purchase_id,invoice_line_id,lot_number,title,description,category,
      quantity_expected,quantity_received,amount,currency,amount_aud,shared_cost_override_aud,notes
    ) values (
      p_workspace_id,v_purchase_id,v_line.id,coalesce(v_line.lot_number,''),
      coalesce(nullif(btrim(v_line.proposed_title),''),nullif(btrim(v_line.raw_text),''),'Imported invoice line'),
      coalesce(v_line.raw_text,''),'item',greatest(coalesce(v_line.quantity,1),1),0,
      case when v_alloc.allocation_currency=coalesce(nullif(v_invoice.currency,''),'AUD') then v_alloc.purchase_amount else v_line.line_total end,
      coalesce(nullif(v_invoice.currency,''),'AUD'),
      case when v_alloc.allocation_currency='AUD' then v_alloc.purchase_amount else null end,
      case when v_alloc.allocation_currency='AUD' then nullif(coalesce(v_alloc.premium_amount,0)+coalesce(v_alloc.postage_amount,0)+coalesce(v_alloc.other_amount,0),0) else null end,
      concat_ws(' · ','Imported from invoice intake',nullif(v_line.review_note,''),v_alloc.allocation_mode)
    )
    on conflict (workspace_id,invoice_line_id) do update set
      purchase_id=excluded.purchase_id,lot_number=excluded.lot_number,title=excluded.title,
      description=excluded.description,quantity_expected=excluded.quantity_expected,amount=excluded.amount,
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

delete from public.cost_entries ce
using public.acquisition_invoice_lines ail, public.acquisition_invoices ai
where ail.workspace_id=ai.workspace_id
  and ail.invoice_id=ai.id
  and ail.created_item_id=ce.item_id
  and ail.workspace_id=ce.workspace_id
  and ai.extraction_status='imported'
  and ce.notes like 'Invoice allocation%';

do $$
declare
  r record;
  a record;
  v_note text;
  v_date date;
begin
  for r in
    select ail.*, ai.vendor_name, ai.invoice_number, ai.invoice_date
    from public.acquisition_invoice_lines ail
    join public.acquisition_invoices ai on ai.workspace_id=ail.workspace_id and ai.id=ail.invoice_id
    where ai.extraction_status='imported' and ail.created_item_id is not null
  loop
    select * into a from private.acquisition_line_cost_allocation(r.workspace_id,r.invoice_id,r.id);
    v_date := coalesce(r.invoice_date,current_date);
    v_note := concat_ws(' · ','Invoice allocation',nullif(btrim(r.vendor_name),''),case when nullif(btrim(r.invoice_number),'') is not null then 'Invoice '||btrim(r.invoice_number) end,case when nullif(btrim(r.lot_number),'') is not null then 'Lot '||btrim(r.lot_number) end,case when a.allocation_mode='gross_line_totals' then 'gross-line normalized' else 'net-line allocated' end);
    if coalesce(a.purchase_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'purchase',a.purchase_amount,a.allocation_currency,v_date,v_note); end if;
    if coalesce(a.premium_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'buyer_premium',a.premium_amount,a.allocation_currency,v_date,v_note); end if;
    if coalesce(a.postage_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'postage',a.postage_amount,a.allocation_currency,v_date,v_note); end if;
    if coalesce(a.other_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'other',a.other_amount,a.allocation_currency,v_date,v_note||' · Unclassified invoice charge'); end if;
  end loop;
end $$;

select private.sync_acquisition_invoice_purchase(ai.workspace_id,ai.id)
from public.acquisition_invoices ai
where ai.extraction_status='imported';
