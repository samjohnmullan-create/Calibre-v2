create or replace function public.classify_purchase_lot(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_category text
)
returns public.purchase_lots
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot public.purchase_lots%rowtype;
begin
  if p_category <> all(array['item','part','tool','consumable','other']::text[]) then
    raise exception 'Invalid lot category';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id
      and m.user_id=(select auth.uid())
      and m.role=any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_lot
  from public.purchase_lots
  where workspace_id=p_workspace_id and id=p_purchase_lot_id
  for update;
  if not found then raise exception 'Purchase lot not found'; end if;

  if coalesce(v_lot.quantity_received,0)>0 or coalesce(v_lot.quantity_closed_short,0)>0
     or exists (select 1 from public.purchase_item_links l where l.workspace_id=p_workspace_id and l.purchase_lot_id=v_lot.id)
     or exists (select 1 from public.purchase_stock_links l where l.workspace_id=p_workspace_id and l.purchase_lot_id=v_lot.id) then
    raise exception 'Lot category cannot change after receiving has started';
  end if;

  update public.purchase_lots
  set category=p_category,updated_at=now()
  where workspace_id=p_workspace_id and id=p_purchase_lot_id
  returning * into v_lot;

  return v_lot;
end;
$$;

revoke all on function public.classify_purchase_lot(uuid,uuid,text) from public, anon;
grant execute on function public.classify_purchase_lot(uuid,uuid,text) to authenticated;
