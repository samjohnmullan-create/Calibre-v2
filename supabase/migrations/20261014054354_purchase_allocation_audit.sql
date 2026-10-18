create or replace function private.log_purchase_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reason text := nullif(btrim(current_setting('calibre.allocation_reason', true)), '');
  v_source text := coalesce(nullif(btrim(current_setting('calibre.allocation_source', true)), ''), 'direct_update');
  v_actor uuid := auth.uid();
begin
  if old.amount_aud is not distinct from new.amount_aud
     and old.shared_cost_override_aud is not distinct from new.shared_cost_override_aud then
    return new;
  end if;

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
    new.workspace_id,
    'purchase_lot_allocation',
    new.id,
    'allocation_update',
    jsonb_build_object(
      'purchase_id', old.purchase_id,
      'purchase_lot_id', old.id,
      'lot_number', old.lot_number,
      'amount_aud', old.amount_aud,
      'shared_cost_override_aud', old.shared_cost_override_aud
    ),
    jsonb_build_object(
      'purchase_id', new.purchase_id,
      'purchase_lot_id', new.id,
      'lot_number', new.lot_number,
      'amount_aud', new.amount_aud,
      'shared_cost_override_aud', new.shared_cost_override_aud,
      'reason', v_reason,
      'reason_status', case when v_reason is null then 'not_supplied' else 'supplied' end
    ),
    v_actor,
    case when v_actor is null then 'system' else 'user' end,
    v_source,
    ''
  );

  return new;
end;
$$;

revoke all on function private.log_purchase_allocation_change() from public;

drop trigger if exists purchase_lots_audit_allocation_change on public.purchase_lots;
create trigger purchase_lots_audit_allocation_change
after update of amount_aud, shared_cost_override_aud on public.purchase_lots
for each row
execute function private.log_purchase_allocation_change();

create or replace function public.update_purchase_lot_allocations(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_amount_aud numeric,
  p_shared_cost_override_aud numeric,
  p_reason text
)
returns public.purchase_lots
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_lot public.purchase_lots%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'A reason is required for allocation changes';
  end if;

  if p_amount_aud is not null and p_amount_aud < 0 then
    raise exception 'AUD lot value cannot be negative';
  end if;

  if p_shared_cost_override_aud is not null and p_shared_cost_override_aud < 0 then
    raise exception 'Shared-cost allocation cannot be negative';
  end if;

  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_lot
  from public.purchase_lots
  where workspace_id = p_workspace_id
    and id = p_purchase_lot_id
  for update;

  if not found then
    raise exception 'Purchase lot not found';
  end if;

  if coalesce(v_lot.quantity_received, 0) > 0
     or coalesce(v_lot.quantity_closed_short, 0) > 0
     or exists (
       select 1 from public.purchase_item_links l
       where l.workspace_id = p_workspace_id and l.purchase_lot_id = p_purchase_lot_id
     )
     or exists (
       select 1 from public.purchase_stock_links l
       where l.workspace_id = p_workspace_id and l.purchase_lot_id = p_purchase_lot_id
     ) then
    raise exception 'Allocation changes are locked after receiving starts. Adjustments after receiving require a reconciled reallocation workflow.';
  end if;

  if v_lot.amount_aud is not distinct from p_amount_aud
     and v_lot.shared_cost_override_aud is not distinct from p_shared_cost_override_aud then
    return v_lot;
  end if;

  perform set_config('calibre.allocation_reason', v_reason, true);
  perform set_config('calibre.allocation_source', 'allocation_rpc', true);

  update public.purchase_lots
  set amount_aud = p_amount_aud,
      shared_cost_override_aud = p_shared_cost_override_aud,
      updated_at = now()
  where workspace_id = p_workspace_id
    and id = p_purchase_lot_id
  returning * into v_lot;

  return v_lot;
end;
$$;

revoke all on function public.update_purchase_lot_allocations(uuid, uuid, numeric, numeric, text) from public;
revoke all on function public.update_purchase_lot_allocations(uuid, uuid, numeric, numeric, text) from anon;
grant execute on function public.update_purchase_lot_allocations(uuid, uuid, numeric, numeric, text) to authenticated;

comment on function public.update_purchase_lot_allocations(uuid, uuid, numeric, numeric, text)
is 'Changes pre-receiving purchase lot AUD and shared-cost allocations. A reason is mandatory and every change is recorded in audit_events.';
