alter table public.purchases
  add column if not exists vendor_name text not null default '',
  add column if not exists channel text not null default '',
  add column if not exists invoice_id uuid null references public.acquisition_invoices(id) on delete set null,
  add column if not exists amount_aud numeric null check (amount_aud >= 0),
  add column if not exists exchange_rate_to_aud numeric null check (exchange_rate_to_aud > 0),
  add column if not exists exchange_rate_date date null,
  add column if not exists discrepancy_note text not null default '';

alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status = any (array['suggested','ordered','shipped','delivered','received','discrepancy','cancelled','returned']::text[]));

alter table public.purchases add constraint purchases_workspace_id_id_key unique (workspace_id, id);

create index if not exists purchases_workspace_status_idx
  on public.purchases (workspace_id, status, ordered_at desc nulls last, created_at desc);
create index if not exists purchases_workspace_vendor_idx
  on public.purchases (workspace_id, vendor_name);
create index if not exists purchases_invoice_idx
  on public.purchases (workspace_id, invoice_id) where invoice_id is not null;

create table if not exists public.purchase_lots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_id uuid not null,
  lot_number text not null default '',
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  category text not null default 'item' check (category = any (array['item','part','tool','consumable','other']::text[])),
  quantity_expected integer not null default 1 check (quantity_expected > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  amount numeric null check (amount >= 0),
  currency text not null default 'AUD',
  amount_aud numeric null check (amount_aud >= 0),
  shared_cost_override_aud numeric null check (shared_cost_override_aud >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_lots_purchase_fk foreign key (workspace_id, purchase_id)
    references public.purchases(workspace_id, id) on delete cascade,
  constraint purchase_lots_workspace_id_id_key unique (workspace_id, id)
);

create index if not exists purchase_lots_purchase_idx
  on public.purchase_lots (workspace_id, purchase_id, created_at);

create table if not exists public.purchase_item_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_id uuid not null,
  purchase_lot_id uuid not null,
  item_id uuid not null,
  allocated_purchase_cost_aud numeric null check (allocated_purchase_cost_aud >= 0),
  allocated_shared_cost_aud numeric null check (allocated_shared_cost_aud >= 0),
  created_at timestamptz not null default now(),
  constraint purchase_item_links_purchase_fk foreign key (workspace_id, purchase_id)
    references public.purchases(workspace_id, id) on delete cascade,
  constraint purchase_item_links_lot_fk foreign key (workspace_id, purchase_lot_id)
    references public.purchase_lots(workspace_id, id) on delete cascade,
  constraint purchase_item_links_item_fk foreign key (workspace_id, item_id)
    references public.items(workspace_id, id) on delete restrict,
  constraint purchase_item_links_item_uq unique (workspace_id, item_id)
);

create index if not exists purchase_item_links_purchase_idx
  on public.purchase_item_links (workspace_id, purchase_id, created_at);
create index if not exists purchase_item_links_lot_idx
  on public.purchase_item_links (workspace_id, purchase_lot_id, created_at);

alter table public.purchase_lots enable row level security;
alter table public.purchase_item_links enable row level security;

create policy purchase_lots_select on public.purchase_lots
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_lots.workspace_id
    and m.user_id = (select auth.uid())
));

create policy purchase_lots_insert on public.purchase_lots
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_lots.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_lots_update on public.purchase_lots
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_lots.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_lots.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_lots_delete on public.purchase_lots
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_lots.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_item_links_select on public.purchase_item_links
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_item_links.workspace_id
    and m.user_id = (select auth.uid())
));

create policy purchase_item_links_insert on public.purchase_item_links
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_item_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_item_links_update on public.purchase_item_links
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_item_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_item_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_item_links_delete on public.purchase_item_links
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_item_links.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create or replace function public.materialize_purchase_lot_item(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_title text,
  p_type text,
  p_purpose text default 'resale',
  p_notes text default ''
)
returns public.items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot public.purchase_lots%rowtype;
  v_purchase public.purchases%rowtype;
  v_item public.items;
  v_existing_count integer;
  v_unit_purchase_aud numeric;
  v_unit_shared_aud numeric;
  v_note text;
begin
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

  select * into v_purchase
  from public.purchases
  where workspace_id = p_workspace_id and id = v_lot.purchase_id;
  if not found then raise exception 'Purchase not found'; end if;

  select count(*) into v_existing_count
  from public.purchase_item_links
  where workspace_id = p_workspace_id and purchase_lot_id = v_lot.id;

  if v_existing_count >= v_lot.quantity_expected then
    raise exception 'All expected physical Items from this lot are already linked';
  end if;

  select * into v_item
  from public.create_item(
    p_workspace_id,
    btrim(p_title),
    p_type,
    p_purpose,
    concat_ws(E'\n',
      nullif(btrim(p_notes), ''),
      case when nullif(btrim(v_purchase.vendor_name), '') is not null then 'Purchase vendor: ' || btrim(v_purchase.vendor_name) end,
      case when nullif(btrim(v_purchase.external_order_id), '') is not null then 'Order/reference: ' || btrim(v_purchase.external_order_id) end,
      case when nullif(btrim(v_lot.lot_number), '') is not null then 'Lot: ' || btrim(v_lot.lot_number) end,
      case when nullif(btrim(v_lot.description), '') is not null then 'Purchase description: ' || btrim(v_lot.description) end
    )
  );

  update public.items
  set source_id = v_purchase.source_id,
      acquired_at = coalesce(v_purchase.received_at::date, v_purchase.ordered_at, current_date),
      updated_at = now()
  where workspace_id = p_workspace_id and id = v_item.id;

  v_unit_purchase_aud := case when v_lot.amount_aud is null then null else round(v_lot.amount_aud / v_lot.quantity_expected, 2) end;
  v_unit_shared_aud := case when v_lot.shared_cost_override_aud is null then null else round(v_lot.shared_cost_override_aud / v_lot.quantity_expected, 2) end;

  insert into public.purchase_item_links (
    workspace_id, purchase_id, purchase_lot_id, item_id,
    allocated_purchase_cost_aud, allocated_shared_cost_aud
  ) values (
    p_workspace_id, v_purchase.id, v_lot.id, v_item.id,
    v_unit_purchase_aud, v_unit_shared_aud
  );

  if coalesce(v_unit_purchase_aud, 0) > 0 then
    insert into public.cost_entries (workspace_id, item_id, category, amount, currency, incurred_at, source_id, notes)
    values (
      p_workspace_id, v_item.id, 'purchase', v_unit_purchase_aud, 'AUD',
      coalesce(v_purchase.ordered_at, current_date), v_purchase.source_id,
      concat_ws(' · ', 'Purchase allocation', nullif(v_purchase.vendor_name,''), nullif(v_purchase.external_order_id,''), nullif(v_lot.lot_number,''))
    );
  end if;

  if coalesce(v_unit_shared_aud, 0) > 0 then
    insert into public.cost_entries (workspace_id, item_id, category, amount, currency, incurred_at, source_id, notes)
    values (
      p_workspace_id, v_item.id, 'other', v_unit_shared_aud, 'AUD',
      coalesce(v_purchase.ordered_at, current_date), v_purchase.source_id,
      concat_ws(' · ', 'Manual shared-cost allocation', nullif(v_purchase.vendor_name,''), nullif(v_purchase.external_order_id,''), nullif(v_lot.lot_number,''))
    );
  end if;

  update public.purchase_lots
  set quantity_received = greatest(quantity_received, v_existing_count + 1),
      updated_at = now()
  where workspace_id = p_workspace_id and id = v_lot.id;

  return v_item;
end;
$$;

revoke all on function public.materialize_purchase_lot_item(uuid, uuid, text, text, text, text) from public;
grant execute on function public.materialize_purchase_lot_item(uuid, uuid, text, text, text, text) to authenticated;
