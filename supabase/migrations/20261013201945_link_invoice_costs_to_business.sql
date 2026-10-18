create or replace function public.capture_acquisition_line_costs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.acquisition_invoices%rowtype;
  v_ratio numeric := 0;
  v_currency text;
  v_purchase numeric := 0;
  v_premium numeric := 0;
  v_postage numeric := 0;
  v_other numeric := 0;
  v_note text;
  v_date date;
begin
  if new.created_item_id is null or old.created_item_id is not distinct from new.created_item_id then
    return new;
  end if;

  select * into v_invoice
  from public.acquisition_invoices
  where id = new.invoice_id
    and workspace_id = new.workspace_id;

  if not found then
    return new;
  end if;

  if coalesce(new.line_total, 0) > 0 and coalesce(v_invoice.subtotal, 0) > 0 then
    v_ratio := new.line_total / v_invoice.subtotal;
  elsif coalesce(new.line_total_aud, 0) > 0 and coalesce(v_invoice.subtotal_aud, 0) > 0 then
    v_ratio := new.line_total_aud / v_invoice.subtotal_aud;
  end if;

  if v_invoice.total_aud is not null or new.line_total_aud is not null then
    v_currency := 'AUD';
    v_purchase := coalesce(new.line_total_aud, case when new.line_total is not null and v_invoice.exchange_rate_to_aud is not null then round(new.line_total * v_invoice.exchange_rate_to_aud, 2) end, 0);
    v_premium := round(coalesce(v_invoice.fees_aud, 0) * v_ratio, 2);
    v_postage := round(coalesce(v_invoice.postage_aud, 0) * v_ratio, 2);
    v_other := round(greatest(coalesce(v_invoice.total_aud, 0) - coalesce(v_invoice.subtotal_aud, 0) - coalesce(v_invoice.fees_aud, 0) - coalesce(v_invoice.postage_aud, 0), 0) * v_ratio, 2);
  else
    v_currency := coalesce(nullif(v_invoice.currency, ''), 'AUD');
    v_purchase := coalesce(new.line_total, 0);
    v_premium := round(coalesce(v_invoice.fees, 0) * v_ratio, 2);
    v_postage := round(coalesce(v_invoice.postage, 0) * v_ratio, 2);
    v_other := round(greatest(coalesce(v_invoice.total, 0) - coalesce(v_invoice.subtotal, 0) - coalesce(v_invoice.fees, 0) - coalesce(v_invoice.postage, 0), 0) * v_ratio, 2);
  end if;

  v_date := coalesce(v_invoice.invoice_date, current_date);
  v_note := concat_ws(' · ',
    'Invoice allocation',
    nullif(btrim(v_invoice.vendor_name), ''),
    case when nullif(btrim(v_invoice.invoice_number), '') is not null then 'Invoice ' || btrim(v_invoice.invoice_number) end,
    case when nullif(btrim(new.lot_number), '') is not null then 'Lot ' || btrim(new.lot_number) end
  );

  if v_purchase > 0 then
    insert into public.cost_entries(workspace_id, item_id, category, amount, currency, incurred_at, notes)
    values(new.workspace_id, new.created_item_id, 'purchase', v_purchase, v_currency, v_date, v_note);
  end if;
  if v_premium > 0 then
    insert into public.cost_entries(workspace_id, item_id, category, amount, currency, incurred_at, notes)
    values(new.workspace_id, new.created_item_id, 'buyer_premium', v_premium, v_currency, v_date, v_note);
  end if;
  if v_postage > 0 then
    insert into public.cost_entries(workspace_id, item_id, category, amount, currency, incurred_at, notes)
    values(new.workspace_id, new.created_item_id, 'postage', v_postage, v_currency, v_date, v_note);
  end if;
  if v_other > 0 then
    insert into public.cost_entries(workspace_id, item_id, category, amount, currency, incurred_at, notes)
    values(new.workspace_id, new.created_item_id, 'other', v_other, v_currency, v_date, v_note || ' · Unclassified invoice charge');
  end if;

  return new;
end;
$$;

drop trigger if exists acquisition_line_costs_after_link on public.acquisition_invoice_lines;
create trigger acquisition_line_costs_after_link
after update of created_item_id on public.acquisition_invoice_lines
for each row
when (new.created_item_id is not null and old.created_item_id is distinct from new.created_item_id)
execute function public.capture_acquisition_line_costs();

with linked as (
  select
    ail.workspace_id,
    ail.created_item_id as item_id,
    ail.line_total,
    ail.line_total_aud,
    ail.lot_number,
    ai.vendor_name,
    ai.invoice_number,
    ai.invoice_date,
    ai.currency,
    ai.subtotal,
    ai.fees,
    ai.postage,
    ai.total,
    ai.subtotal_aud,
    ai.fees_aud,
    ai.postage_aud,
    ai.total_aud,
    ai.exchange_rate_to_aud,
    case
      when coalesce(ail.line_total,0) > 0 and coalesce(ai.subtotal,0) > 0 then ail.line_total / ai.subtotal
      when coalesce(ail.line_total_aud,0) > 0 and coalesce(ai.subtotal_aud,0) > 0 then ail.line_total_aud / ai.subtotal_aud
      else 0
    end as ratio
  from public.acquisition_invoice_lines ail
  join public.acquisition_invoices ai
    on ai.id = ail.invoice_id and ai.workspace_id = ail.workspace_id
  where ail.created_item_id is not null
), allocated as (
  select workspace_id, item_id, 'purchase'::text as category,
    case when total_aud is not null or line_total_aud is not null
      then coalesce(line_total_aud, case when line_total is not null and exchange_rate_to_aud is not null then round(line_total * exchange_rate_to_aud,2) end, 0)
      else coalesce(line_total,0) end as amount,
    case when total_aud is not null or line_total_aud is not null then 'AUD' else coalesce(nullif(currency,''),'AUD') end as cost_currency,
    coalesce(invoice_date,current_date) as incurred_at,
    concat_ws(' · ','Invoice allocation',nullif(btrim(vendor_name),''),case when nullif(btrim(invoice_number),'') is not null then 'Invoice '||btrim(invoice_number) end,case when nullif(btrim(lot_number),'') is not null then 'Lot '||btrim(lot_number) end) as note
  from linked
  union all
  select workspace_id, item_id, 'buyer_premium',
    round(case when total_aud is not null then coalesce(fees_aud,0) else coalesce(fees,0) end * ratio,2),
    case when total_aud is not null then 'AUD' else coalesce(nullif(currency,''),'AUD') end,
    coalesce(invoice_date,current_date),
    concat_ws(' · ','Invoice allocation',nullif(btrim(vendor_name),''),case when nullif(btrim(invoice_number),'') is not null then 'Invoice '||btrim(invoice_number) end,case when nullif(btrim(lot_number),'') is not null then 'Lot '||btrim(lot_number) end)
  from linked
  union all
  select workspace_id, item_id, 'postage',
    round(case when total_aud is not null then coalesce(postage_aud,0) else coalesce(postage,0) end * ratio,2),
    case when total_aud is not null then 'AUD' else coalesce(nullif(currency,''),'AUD') end,
    coalesce(invoice_date,current_date),
    concat_ws(' · ','Invoice allocation',nullif(btrim(vendor_name),''),case when nullif(btrim(invoice_number),'') is not null then 'Invoice '||btrim(invoice_number) end,case when nullif(btrim(lot_number),'') is not null then 'Lot '||btrim(lot_number) end)
  from linked
  union all
  select workspace_id, item_id, 'other',
    round(greatest(
      case when total_aud is not null
        then coalesce(total_aud,0)-coalesce(subtotal_aud,0)-coalesce(fees_aud,0)-coalesce(postage_aud,0)
        else coalesce(total,0)-coalesce(subtotal,0)-coalesce(fees,0)-coalesce(postage,0)
      end, 0) * ratio,2),
    case when total_aud is not null then 'AUD' else coalesce(nullif(currency,''),'AUD') end,
    coalesce(invoice_date,current_date),
    concat_ws(' · ','Invoice allocation',nullif(btrim(vendor_name),''),case when nullif(btrim(invoice_number),'') is not null then 'Invoice '||btrim(invoice_number) end,case when nullif(btrim(lot_number),'') is not null then 'Lot '||btrim(lot_number) end) || ' · Unclassified invoice charge'
  from linked
)
insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes)
select a.workspace_id,a.item_id,a.category,a.amount,a.cost_currency,a.incurred_at,a.note
from allocated a
where a.amount > 0
  and not exists (
    select 1 from public.cost_entries ce
    where ce.workspace_id=a.workspace_id
      and ce.item_id=a.item_id
      and ce.category=a.category
      and ce.notes=a.note
  );