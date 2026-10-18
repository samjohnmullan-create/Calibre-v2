grant select, insert, update, delete on public.purchase_lots to authenticated;
grant select, insert, update, delete on public.purchase_item_links to authenticated;

alter table public.tools add constraint tools_workspace_id_id_key unique (workspace_id, id);
alter table public.consumables add constraint consumables_workspace_id_id_key unique (workspace_id, id);

create table if not exists public.purchase_stock_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_id uuid not null,
  purchase_lot_id uuid not null,
  resource_type text not null check (resource_type = any (array['part','tool','consumable']::text[])),
  part_id uuid null,
  tool_id uuid null,
  consumable_id uuid null,
  quantity_received numeric not null check (quantity_received > 0),
  allocated_purchase_cost_aud numeric null check (allocated_purchase_cost_aud >= 0),
  allocated_shared_cost_aud numeric null check (allocated_shared_cost_aud >= 0),
  created_at timestamptz not null default now(),
  constraint purchase_stock_links_purchase_fk foreign key (workspace_id, purchase_id)
    references public.purchases(workspace_id, id) on delete cascade,
  constraint purchase_stock_links_lot_fk foreign key (workspace_id, purchase_lot_id)
    references public.purchase_lots(workspace_id, id) on delete cascade,
  constraint purchase_stock_links_part_fk foreign key (workspace_id, part_id)
    references public.parts(workspace_id, id) on delete restrict,
  constraint purchase_stock_links_tool_fk foreign key (workspace_id, tool_id)
    references public.tools(workspace_id, id) on delete restrict,
  constraint purchase_stock_links_consumable_fk foreign key (workspace_id, consumable_id)
    references public.consumables(workspace_id, id) on delete restrict,
  constraint purchase_stock_links_exact_resource check (
    (resource_type = 'part' and part_id is not null and tool_id is null and consumable_id is null) or
    (resource_type = 'tool' and part_id is null and tool_id is not null and consumable_id is null) or
    (resource_type = 'consumable' and part_id is null and tool_id is null and consumable_id is not null)
  )
);

create index if not exists purchase_stock_links_purchase_idx
  on public.purchase_stock_links (workspace_id, purchase_id, created_at);
create index if not exists purchase_stock_links_lot_idx
  on public.purchase_stock_links (workspace_id, purchase_lot_id, created_at);
create index if not exists purchase_stock_links_part_idx
  on public.purchase_stock_links (workspace_id, part_id) where part_id is not null;
create index if not exists purchase_stock_links_tool_idx
  on public.purchase_stock_links (workspace_id, tool_id) where tool_id is not null;
create index if not exists purchase_stock_links_consumable_idx
  on public.purchase_stock_links (workspace_id, consumable_id) where consumable_id is not null;

alter table public.purchase_stock_links enable row level security;

grant select, insert, update, delete on public.purchase_stock_links to authenticated;

create policy purchase_stock_links_select on public.purchase_stock_links
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_stock_links.workspace_id
    and m.user_id = (select auth.uid())
));

create policy purchase_stock_links_insert on public.purchase_stock_links
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_stock_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_stock_links_update on public.purchase_stock_links
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_stock_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_stock_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_stock_links_delete on public.purchase_stock_links
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_stock_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create or replace function public.materialize_purchase_lot_stock(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_quantity numeric,
  p_name text,
  p_storage_location_id uuid default null,
  p_category text default '',
  p_manufacturer text default '',
  p_reference text default '',
  p_condition text default '',
  p_unit text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot public.purchase_lots%rowtype;
  v_purchase public.purchases%rowtype;
  v_already_received numeric;
  v_purchase_alloc numeric;
  v_shared_alloc numeric;
  v_total_alloc numeric;
  v_part_id uuid;
  v_tool_id uuid;
  v_consumable_id uuid;
  v_ledger_key text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any (array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_lot
  from public.purchase_lots
  where workspace_id = p_workspace_id and id = p_purchase_lot_id
  for update;
  if not found then raise exception 'Purchase lot not found'; end if;

  if v_lot.category not in ('part','tool','consumable') then
    raise exception 'This lot category cannot be received into workshop stock';
  end if;

  select * into v_purchase
  from public.purchases
  where workspace_id = p_workspace_id and id = v_lot.purchase_id;
  if not found then raise exception 'Purchase not found'; end if;

  if p_storage_location_id is not null and not exists (
    select 1 from public.storage_locations s
    where s.workspace_id = p_workspace_id and s.id = p_storage_location_id
  ) then
    raise exception 'Storage location not found in this workspace';
  end if;

  select coalesce(sum(quantity_received), 0) into v_already_received
  from public.purchase_stock_links
  where workspace_id = p_workspace_id and purchase_lot_id = v_lot.id;

  if v_already_received + p_quantity > v_lot.quantity_expected then
    raise exception 'Received quantity exceeds the expected lot quantity';
  end if;

  v_purchase_alloc := case when v_lot.amount_aud is null then null else round((v_lot.amount_aud / v_lot.quantity_expected) * p_quantity, 2) end;
  v_shared_alloc := case when v_lot.shared_cost_override_aud is null then null else round((v_lot.shared_cost_override_aud / v_lot.quantity_expected) * p_quantity, 2) end;
  v_total_alloc := coalesce(v_purchase_alloc, 0) + coalesce(v_shared_alloc, 0);

  if v_lot.category = 'part' then
    insert into public.parts (
      workspace_id, part_type, manufacturer, reference, description, condition,
      quantity, unit_cost, currency, storage_location_id, notes, provenance_type, provenance_note
    ) values (
      p_workspace_id,
      coalesce(nullif(btrim(p_category), ''), 'other'),
      btrim(coalesce(p_manufacturer, '')),
      btrim(coalesce(p_reference, '')),
      btrim(coalesce(v_lot.description, '')),
      btrim(coalesce(p_condition, '')),
      p_quantity,
      case when v_total_alloc > 0 then round(v_total_alloc / p_quantity, 2) else null end,
      'AUD',
      p_storage_location_id,
      btrim(coalesce(p_notes, '')),
      'purchased',
      concat_ws(' · ', nullif(btrim(v_purchase.vendor_name), ''), nullif(btrim(v_purchase.external_order_id), ''), nullif(btrim(v_lot.lot_number), ''))
    ) returning id into v_part_id;

    insert into public.purchase_stock_links (
      workspace_id, purchase_id, purchase_lot_id, resource_type, part_id,
      quantity_received, allocated_purchase_cost_aud, allocated_shared_cost_aud
    ) values (
      p_workspace_id, v_purchase.id, v_lot.id, 'part', v_part_id,
      p_quantity, v_purchase_alloc, v_shared_alloc
    );

  elsif v_lot.category = 'tool' then
    insert into public.tools (
      workspace_id, name, category, manufacturer, model, quantity, purchase_cost, storage_location_id, notes
    ) values (
      p_workspace_id,
      btrim(p_name),
      btrim(coalesce(p_category, '')),
      btrim(coalesce(p_manufacturer, '')),
      btrim(coalesce(p_reference, '')),
      p_quantity,
      case when v_total_alloc > 0 then v_total_alloc else null end,
      p_storage_location_id,
      btrim(coalesce(p_notes, ''))
    ) returning id into v_tool_id;

    insert into public.purchase_stock_links (
      workspace_id, purchase_id, purchase_lot_id, resource_type, tool_id,
      quantity_received, allocated_purchase_cost_aud, allocated_shared_cost_aud
    ) values (
      p_workspace_id, v_purchase.id, v_lot.id, 'tool', v_tool_id,
      p_quantity, v_purchase_alloc, v_shared_alloc
    );

    if v_total_alloc > 0 then
      v_ledger_key := 'purchase-stock:tool:' || v_tool_id::text;
      insert into public.business_ledger_entries (
        workspace_id, entry_type, treatment, category, description,
        amount, currency, amount_aud, occurred_at, vendor, reference, notes,
        purchase_id, external_key, created_by
      ) values (
        p_workspace_id, 'expense', 'capital', 'tools_equipment', btrim(p_name),
        v_total_alloc, 'AUD', v_total_alloc, coalesce(v_purchase.ordered_at, current_date),
        btrim(coalesce(v_purchase.vendor_name, '')), btrim(coalesce(v_purchase.external_order_id, '')),
        concat_ws(' · ', 'Received from purchase lot', nullif(btrim(v_lot.lot_number), ''), nullif(btrim(p_notes), '')),
        v_purchase.id, v_ledger_key, auth.uid()
      ) on conflict (workspace_id, external_key) where external_key <> '' do nothing;
    end if;

  elsif v_lot.category = 'consumable' then
    insert into public.consumables (
      workspace_id, name, category, quantity, unit, storage_location_id, notes
    ) values (
      p_workspace_id,
      btrim(p_name),
      btrim(coalesce(p_category, '')),
      p_quantity,
      btrim(coalesce(p_unit, '')),
      p_storage_location_id,
      btrim(coalesce(p_notes, ''))
    ) returning id into v_consumable_id;

    insert into public.purchase_stock_links (
      workspace_id, purchase_id, purchase_lot_id, resource_type, consumable_id,
      quantity_received, allocated_purchase_cost_aud, allocated_shared_cost_aud
    ) values (
      p_workspace_id, v_purchase.id, v_lot.id, 'consumable', v_consumable_id,
      p_quantity, v_purchase_alloc, v_shared_alloc
    );

    if v_total_alloc > 0 then
      v_ledger_key := 'purchase-stock:consumable:' || v_consumable_id::text;
      insert into public.business_ledger_entries (
        workspace_id, entry_type, treatment, category, description,
        amount, currency, amount_aud, occurred_at, vendor, reference, notes,
        purchase_id, external_key, created_by
      ) values (
        p_workspace_id, 'expense', 'operating', 'consumables', btrim(p_name),
        v_total_alloc, 'AUD', v_total_alloc, coalesce(v_purchase.ordered_at, current_date),
        btrim(coalesce(v_purchase.vendor_name, '')), btrim(coalesce(v_purchase.external_order_id, '')),
        concat_ws(' · ', 'Received from purchase lot', nullif(btrim(v_lot.lot_number), ''), nullif(btrim(p_notes), '')),
        v_purchase.id, v_ledger_key, auth.uid()
      ) on conflict (workspace_id, external_key) where external_key <> '' do nothing;
    end if;
  end if;

  update public.purchase_lots
  set quantity_received = v_already_received + p_quantity,
      updated_at = now()
  where workspace_id = p_workspace_id and id = v_lot.id;

  if not exists (
    select 1 from public.purchase_lots l
    where l.workspace_id = p_workspace_id
      and l.purchase_id = v_purchase.id
      and l.quantity_received < l.quantity_expected
  ) then
    update public.purchases
    set status = 'received',
        received_at = coalesce(received_at, now()),
        updated_at = now()
    where workspace_id = p_workspace_id and id = v_purchase.id
      and status not in ('cancelled','returned','discrepancy');
  end if;

  return jsonb_build_object(
    'resource_type', v_lot.category,
    'resource_id', coalesce(v_part_id, v_tool_id, v_consumable_id),
    'quantity_received', p_quantity,
    'allocated_purchase_cost_aud', v_purchase_alloc,
    'allocated_shared_cost_aud', v_shared_alloc,
    'total_allocated_aud', v_total_alloc
  );
end;
$$;

revoke all on function public.materialize_purchase_lot_stock(uuid, uuid, numeric, text, uuid, text, text, text, text, text, text) from public;
grant execute on function public.materialize_purchase_lot_stock(uuid, uuid, numeric, text, uuid, text, text, text, text, text, text) to authenticated;
