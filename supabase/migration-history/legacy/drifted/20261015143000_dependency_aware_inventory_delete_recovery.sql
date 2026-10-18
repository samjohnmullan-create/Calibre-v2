-- Permanent deletion is only for truly accidental/empty physical inventory records.
-- Archive remains the default. Any relational, storage, provenance or material-cost
-- evidence blocks permanent deletion.

create or replace function public.inventory_delete_eligibility(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_type text := lower(btrim(coalesce(p_entity_type, '')));
  v_table regclass;
  v_archived_at timestamptz;
  v_storage_location_id uuid;
  v_cost numeric;
  v_donor_item_id uuid;
  v_reasons text[] := array[]::text[];
  v_fk record;
  v_count bigint;
  v_exists boolean := false;
begin
  case v_type
    when 'item' then v_table := 'public.items'::regclass;
    when 'part' then v_table := 'public.parts'::regclass;
    when 'tool' then v_table := 'public.tools'::regclass;
    when 'consumable' then v_table := 'public.consumables'::regclass;
    else raise exception 'Unsupported inventory entity type: %', p_entity_type;
  end case;

  if v_type = 'item' then
    select true, archived_at, storage_location_id, null::numeric, null::uuid
      into v_exists, v_archived_at, v_storage_location_id, v_cost, v_donor_item_id
      from public.items
     where workspace_id = p_workspace_id and id = p_entity_id;
  elsif v_type = 'part' then
    select true, archived_at, storage_location_id, unit_cost, donor_item_id
      into v_exists, v_archived_at, v_storage_location_id, v_cost, v_donor_item_id
      from public.parts
     where workspace_id = p_workspace_id and id = p_entity_id;
  elsif v_type = 'tool' then
    select true, archived_at, storage_location_id, purchase_cost, null::uuid
      into v_exists, v_archived_at, v_storage_location_id, v_cost, v_donor_item_id
      from public.tools
     where workspace_id = p_workspace_id and id = p_entity_id;
  else
    select true, archived_at, storage_location_id, unit_cost, null::uuid
      into v_exists, v_archived_at, v_storage_location_id, v_cost, v_donor_item_id
      from public.consumables
     where workspace_id = p_workspace_id and id = p_entity_id;
  end if;

  if not coalesce(v_exists, false) then
    raise exception 'Inventory record not found';
  end if;

  if v_archived_at is null then
    v_reasons := array_append(v_reasons, 'Record must be archived before permanent deletion');
  end if;

  if v_storage_location_id is not null then
    v_reasons := array_append(v_reasons, 'Record still has a physical storage location');
  end if;

  if coalesce(v_cost, 0) <> 0 then
    v_reasons := array_append(v_reasons, 'Record has a non-zero recorded acquisition/unit cost');
  end if;

  if v_donor_item_id is not null then
    v_reasons := array_append(v_reasons, 'Part retains donor provenance');
  end if;

  -- Block any FK-backed dependent row. This intentionally treats even CASCADE
  -- relationships as material evidence: permanent delete is only for empty mistakes.
  for v_fk in
    select
      c.conrelid::regclass as referencing_table,
      a.attname as referencing_column
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality ck(attnum, ord) on true
    join lateral unnest(c.confkey) with ordinality fk(attnum, ord) on fk.ord = ck.ord
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = ck.attnum
    join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = fk.attnum
    where c.contype = 'f'
      and c.confrelid = v_table
      and array_length(c.conkey, 1) = 1
      and ra.attname = 'id'
  loop
    execute format('select count(*) from %s where %I = $1', v_fk.referencing_table, v_fk.referencing_column)
      into v_count using p_entity_id;
    if v_count > 0 then
      v_reasons := array_append(
        v_reasons,
        format('Referenced by %s (%s row%s)', v_fk.referencing_table::text, v_count, case when v_count = 1 then '' else 's' end)
      );
    end if;
  end loop;

  -- Storage movement history is polymorphic rather than FK-backed and therefore
  -- requires an explicit check. Audit history is deliberately NOT a blocker: audit
  -- rows are retained after deletion and record the deletion itself.
  select count(*) into v_count
  from public.storage_location_events
  where workspace_id = p_workspace_id
    and entity_type = v_type
    and entity_id = p_entity_id;
  if v_count > 0 then
    v_reasons := array_append(v_reasons, format('Has physical location history (%s move%s)', v_count, case when v_count = 1 then '' else 's' end));
  end if;

  return jsonb_build_object(
    'entity_type', v_type,
    'entity_id', p_entity_id,
    'can_delete', cardinality(v_reasons) = 0,
    'reasons', to_jsonb(v_reasons)
  );
end;
$$;

create or replace function public.permanently_delete_inventory_entity(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_type text := lower(btrim(coalesce(p_entity_type, '')));
  v_check jsonb;
  v_reasons text;
  v_changed integer := 0;
begin
  v_check := public.inventory_delete_eligibility(p_workspace_id, v_type, p_entity_id);

  if not coalesce((v_check->>'can_delete')::boolean, false) then
    select string_agg(value, '; ')
      into v_reasons
      from jsonb_array_elements_text(v_check->'reasons');
    raise exception 'Permanent deletion blocked: %', coalesce(v_reasons, 'dependent history exists');
  end if;

  case v_type
    when 'item' then
      delete from public.items where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    when 'part' then
      delete from public.parts where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    when 'tool' then
      delete from public.tools where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    when 'consumable' then
      delete from public.consumables where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    else
      raise exception 'Unsupported inventory entity type: %', p_entity_type;
  end case;

  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Inventory record could not be permanently deleted';
  end if;

  return jsonb_build_object(
    'entity_type', v_type,
    'entity_id', p_entity_id,
    'deleted', true
  );
end;
$$;

revoke all on function public.inventory_delete_eligibility(uuid, text, uuid) from public, anon;
revoke all on function public.permanently_delete_inventory_entity(uuid, text, uuid) from public, anon;
grant execute on function public.inventory_delete_eligibility(uuid, text, uuid) to authenticated;
grant execute on function public.permanently_delete_inventory_entity(uuid, text, uuid) to authenticated;
