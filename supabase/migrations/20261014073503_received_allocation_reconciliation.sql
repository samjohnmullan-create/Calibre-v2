alter table public.purchase_item_links
  add column if not exists purchase_cost_entry_id uuid null references public.cost_entries(id) on delete set null,
  add column if not exists shared_cost_entry_id uuid null references public.cost_entries(id) on delete set null;

alter table public.purchase_stock_links
  add column if not exists ledger_entry_id uuid null references public.business_ledger_entries(id) on delete set null;

create index if not exists purchase_item_links_purchase_cost_entry_idx
  on public.purchase_item_links (purchase_cost_entry_id)
  where purchase_cost_entry_id is not null;
create index if not exists purchase_item_links_shared_cost_entry_idx
  on public.purchase_item_links (shared_cost_entry_id)
  where shared_cost_entry_id is not null;
create index if not exists purchase_stock_links_ledger_entry_idx
  on public.purchase_stock_links (ledger_entry_id)
  where ledger_entry_id is not null;

with candidates as (
  select l.id as link_id, min(c.id::text)::uuid as cost_id, count(*) as candidate_count
  from public.purchase_item_links l
  join public.cost_entries c
    on c.workspace_id=l.workspace_id
   and c.item_id=l.item_id
   and c.category='purchase'
   and c.notes like 'Purchase allocation%'
  where l.purchase_cost_entry_id is null
  group by l.id
)
update public.purchase_item_links l
set purchase_cost_entry_id=c.cost_id
from candidates c
where l.id=c.link_id and c.candidate_count=1;

with candidates as (
  select l.id as link_id, min(c.id::text)::uuid as cost_id, count(*) as candidate_count
  from public.purchase_item_links l
  join public.cost_entries c
    on c.workspace_id=l.workspace_id
   and c.item_id=l.item_id
   and c.category='other'
   and c.notes like 'Manual shared-cost allocation%'
  where l.shared_cost_entry_id is null
  group by l.id
)
update public.purchase_item_links l
set shared_cost_entry_id=c.cost_id
from candidates c
where l.id=c.link_id and c.candidate_count=1;

update public.purchase_stock_links l
set ledger_entry_id=b.id
from public.business_ledger_entries b
where l.ledger_entry_id is null
  and b.workspace_id=l.workspace_id
  and (
    (l.resource_type='tool' and l.tool_id is not null and b.external_key='purchase-stock:tool:'||l.tool_id::text)
    or
    (l.resource_type='consumable' and l.consumable_id is not null and b.external_key='purchase-stock:consumable:'||l.consumable_id::text)
  );

create or replace function private.link_purchase_cost_entry()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.category='purchase' and new.notes like 'Purchase allocation%' then
    update public.purchase_item_links
    set purchase_cost_entry_id=new.id
    where workspace_id=new.workspace_id and item_id=new.item_id and purchase_cost_entry_id is null;
  elsif new.category='other' and new.notes like 'Manual shared-cost allocation%' then
    update public.purchase_item_links
    set shared_cost_entry_id=new.id
    where workspace_id=new.workspace_id and item_id=new.item_id and shared_cost_entry_id is null;
  end if;
  return new;
end;
$$;
revoke all on function private.link_purchase_cost_entry() from public,anon,authenticated;

drop trigger if exists link_purchase_cost_entry_after_insert on public.cost_entries;
create trigger link_purchase_cost_entry_after_insert
after insert on public.cost_entries
for each row execute function private.link_purchase_cost_entry();

create or replace function private.link_purchase_stock_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_resource_id uuid;
begin
  if new.external_key ~ '^purchase-stock:tool:[0-9a-fA-F-]{36}$' then
    v_resource_id:=split_part(new.external_key,':',3)::uuid;
    update public.purchase_stock_links
    set ledger_entry_id=new.id
    where workspace_id=new.workspace_id and resource_type='tool' and tool_id=v_resource_id and ledger_entry_id is null;
  elsif new.external_key ~ '^purchase-stock:consumable:[0-9a-fA-F-]{36}$' then
    v_resource_id:=split_part(new.external_key,':',3)::uuid;
    update public.purchase_stock_links
    set ledger_entry_id=new.id
    where workspace_id=new.workspace_id and resource_type='consumable' and consumable_id=v_resource_id and ledger_entry_id is null;
  end if;
  return new;
end;
$$;
revoke all on function private.link_purchase_stock_ledger_entry() from public,anon,authenticated;

drop trigger if exists link_purchase_stock_ledger_entry_after_insert on public.business_ledger_entries;
create trigger link_purchase_stock_ledger_entry_after_insert
after insert on public.business_ledger_entries
for each row execute function private.link_purchase_stock_ledger_entry();

-- The public post-receiving correction RPC is defined in the immediately following
-- preserve_received_item_cost_components migration, which preserves detailed invoice
-- component categories rather than collapsing them into a synthetic shared-cost row.
