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
  v_position integer := 0;
  v_line_count integer := 0;
  v_prior_purchase numeric := 0;
  v_prior_fees numeric := 0;
  v_prior_postage numeric := 0;
  v_prior_other numeric := 0;
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

  select rn, cnt into v_position, v_line_count
  from (
    select id,
           row_number() over (order by line_number nulls last, created_at, id)::integer as rn,
           count(*) over ()::integer as cnt
    from public.acquisition_invoice_lines
    where workspace_id=p_workspace_id and invoice_id=p_invoice_id
  ) ranked
  where id=p_line_id;

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
    if coalesce(v_sum_lines,0)>0 and coalesce(v_line.line_total,0)>0 then
      v_ratio := v_line.line_total / v_sum_lines;
    elsif coalesce(v_sum_lines_aud,0)>0 and coalesce(v_line.line_total_aud,0)>0 then
      v_ratio := v_line.line_total_aud / v_sum_lines_aud;
    end if;

    if v_position = v_line_count and v_line_count > 1 then
      if coalesce(v_sum_lines,0)>0 then
        select
          coalesce(sum(round(v_subtotal * coalesce(line_total,0) / v_sum_lines,2)),0),
          coalesce(sum(round(v_fees * coalesce(line_total,0) / v_sum_lines,2)),0),
          coalesce(sum(round(v_postage * coalesce(line_total,0) / v_sum_lines,2)),0),
          coalesce(sum(round(v_other * coalesce(line_total,0) / v_sum_lines,2)),0)
        into v_prior_purchase,v_prior_fees,v_prior_postage,v_prior_other
        from public.acquisition_invoice_lines
        where workspace_id=p_workspace_id and invoice_id=p_invoice_id and id<>p_line_id;
      else
        select
          coalesce(sum(round(v_subtotal * coalesce(line_total_aud,0) / nullif(v_sum_lines_aud,0),2)),0),
          coalesce(sum(round(v_fees * coalesce(line_total_aud,0) / nullif(v_sum_lines_aud,0),2)),0),
          coalesce(sum(round(v_postage * coalesce(line_total_aud,0) / nullif(v_sum_lines_aud,0),2)),0),
          coalesce(sum(round(v_other * coalesce(line_total_aud,0) / nullif(v_sum_lines_aud,0),2)),0)
        into v_prior_purchase,v_prior_fees,v_prior_postage,v_prior_other
        from public.acquisition_invoice_lines
        where workspace_id=p_workspace_id and invoice_id=p_invoice_id and id<>p_line_id;
      end if;
      purchase_amount := round(v_subtotal-v_prior_purchase,2);
      premium_amount := round(v_fees-v_prior_fees,2);
      postage_amount := round(v_postage-v_prior_postage,2);
      other_amount := round(v_other-v_prior_other,2);
    else
      purchase_amount := round(v_subtotal*v_ratio,2);
      premium_amount := round(v_fees*v_ratio,2);
      postage_amount := round(v_postage*v_ratio,2);
      other_amount := round(v_other*v_ratio,2);
    end if;
  else
    allocation_mode := 'net_line_totals';
    if coalesce(v_invoice.subtotal,0)>0 and coalesce(v_line.line_total,0)>0 then
      v_ratio := v_line.line_total/v_invoice.subtotal;
    elsif coalesce(v_invoice.subtotal_aud,0)>0 and coalesce(v_line.line_total_aud,0)>0 then
      v_ratio := v_line.line_total_aud/v_invoice.subtotal_aud;
    end if;

    if allocation_currency='AUD' then
      purchase_amount := coalesce(v_line.line_total_aud,case when v_line.line_total is not null and v_invoice.exchange_rate_to_aud is not null then round(v_line.line_total*v_invoice.exchange_rate_to_aud,2) end,case when coalesce(nullif(v_invoice.currency,''),'AUD')='AUD' then v_line.line_total end,0);
    else
      purchase_amount := coalesce(v_line.line_total,0);
    end if;

    if v_position=v_line_count and v_line_count>1 then
      select
        coalesce(sum(round(v_fees * coalesce(line_total,0) / nullif(v_invoice.subtotal,0),2)),0),
        coalesce(sum(round(v_postage * coalesce(line_total,0) / nullif(v_invoice.subtotal,0),2)),0),
        coalesce(sum(round(v_other * coalesce(line_total,0) / nullif(v_invoice.subtotal,0),2)),0)
      into v_prior_fees,v_prior_postage,v_prior_other
      from public.acquisition_invoice_lines
      where workspace_id=p_workspace_id and invoice_id=p_invoice_id and id<>p_line_id;
      premium_amount := round(v_fees-v_prior_fees,2);
      postage_amount := round(v_postage-v_prior_postage,2);
      other_amount := round(v_other-v_prior_other,2);
    else
      premium_amount := round(v_fees*v_ratio,2);
      postage_amount := round(v_postage*v_ratio,2);
      other_amount := round(v_other*v_ratio,2);
    end if;
  end if;

  total_allocated := round(coalesce(purchase_amount,0)+coalesce(premium_amount,0)+coalesce(postage_amount,0)+coalesce(other_amount,0),2);
  return next;
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
    select ail.*,ai.vendor_name,ai.invoice_number,ai.invoice_date
    from public.acquisition_invoice_lines ail
    join public.acquisition_invoices ai on ai.workspace_id=ail.workspace_id and ai.id=ail.invoice_id
    where ai.extraction_status='imported' and ail.created_item_id is not null
  loop
    select * into a from private.acquisition_line_cost_allocation(r.workspace_id,r.invoice_id,r.id);
    v_date:=coalesce(r.invoice_date,current_date);
    v_note:=concat_ws(' · ','Invoice allocation',nullif(btrim(r.vendor_name),''),case when nullif(btrim(r.invoice_number),'') is not null then 'Invoice '||btrim(r.invoice_number) end,case when nullif(btrim(r.lot_number),'') is not null then 'Lot '||btrim(r.lot_number) end,case when a.allocation_mode='gross_line_totals' then 'gross-line normalized' else 'net-line allocated' end);
    if coalesce(a.purchase_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'purchase',a.purchase_amount,a.allocation_currency,v_date,v_note); end if;
    if coalesce(a.premium_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'buyer_premium',a.premium_amount,a.allocation_currency,v_date,v_note); end if;
    if coalesce(a.postage_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'postage',a.postage_amount,a.allocation_currency,v_date,v_note); end if;
    if coalesce(a.other_amount,0)>0 then insert into public.cost_entries(workspace_id,item_id,category,amount,currency,incurred_at,notes) values(r.workspace_id,r.created_item_id,'other',a.other_amount,a.allocation_currency,v_date,v_note||' · Unclassified invoice charge'); end if;
  end loop;
end $$;

select private.sync_acquisition_invoice_purchase(ai.workspace_id,ai.id)
from public.acquisition_invoices ai
where ai.extraction_status='imported';
