create or replace function private.prevent_purchase_receiving_status_regression()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lot_count integer;
  v_received bigint;
  v_closed bigint;
  v_open_exceptions integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Cancellation/return is a deliberate commercial lifecycle decision and may
  -- override the receiving-derived operational state.
  if new.status in ('cancelled', 'returned') then
    return new;
  end if;

  -- Derived receiving states are written by recalculate_purchase_receiving().
  if new.status not in ('suggested', 'ordered', 'shipped', 'delivered') then
    return new;
  end if;

  select
    count(*)::integer,
    coalesce(sum(l.quantity_received), 0)::bigint,
    coalesce(sum(l.quantity_closed_short), 0)::bigint
  into v_lot_count, v_received, v_closed
  from public.purchase_lots l
  where l.workspace_id = new.workspace_id
    and l.purchase_id = new.id;

  if v_lot_count = 0 then
    return new;
  end if;

  select count(*)::integer
  into v_open_exceptions
  from public.purchase_receiving_exceptions e
  where e.workspace_id = new.workspace_id
    and e.purchase_id = new.id
    and e.status = 'open';

  if v_received > 0 or v_closed > 0 or v_open_exceptions > 0 then
    raise exception 'Receiving has started; Purchase status is derived from received quantities and receiving exceptions.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_purchase_receiving_status_regression() from public, anon, authenticated;

drop trigger if exists purchases_prevent_receiving_status_regression on public.purchases;
create trigger purchases_prevent_receiving_status_regression
before update of status on public.purchases
for each row
execute function private.prevent_purchase_receiving_status_regression();

-- The automatic receiving trigger was introduced after some Purchase history
-- already existed. Recalculate every non-terminal Purchase once so stored
-- status matches the receiving facts already present in its Lots/exceptions.
do $$
declare
  v_purchase record;
begin
  for v_purchase in
    select p.workspace_id, p.id
    from public.purchases p
    where p.status not in ('cancelled', 'returned')
  loop
    perform public.recalculate_purchase_receiving(v_purchase.workspace_id, v_purchase.id);
  end loop;
end;
$$;
