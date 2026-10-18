create or replace function public.materialize_purchase_lot_item_received(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_title text,
  p_type text,
  p_purpose text default 'resale'::text,
  p_notes text default ''::text,
  p_storage_location_id uuid default null
)
returns public.items
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item public.items;
begin
  select * into v_item
  from public.materialize_purchase_lot_item(
    p_workspace_id,
    p_purchase_lot_id,
    p_title,
    p_type,
    p_purpose,
    p_notes
  );

  if p_storage_location_id is not null then
    perform public.move_storage_entity(
      p_workspace_id,
      'item',
      v_item.id,
      p_storage_location_id,
      'Initial put-away from Purchase receiving'
    );

    select * into v_item
    from public.items
    where workspace_id = p_workspace_id and id = v_item.id;
  end if;

  return v_item;
end;
$function$;

revoke execute on function public.materialize_purchase_lot_item_received(uuid,uuid,text,text,text,text,uuid) from public;
revoke execute on function public.materialize_purchase_lot_item_received(uuid,uuid,text,text,text,text,uuid) from anon;
grant execute on function public.materialize_purchase_lot_item_received(uuid,uuid,text,text,text,text,uuid) to authenticated;
