create table if not exists public.purchase_item_cost_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_item_link_id uuid not null references public.purchase_item_links(id) on delete cascade,
  cost_entry_id uuid not null references public.cost_entries(id) on delete cascade,
  component_kind text not null check (component_kind in ('purchase','shared')),
  created_at timestamptz not null default now(),
  unique (cost_entry_id),
  unique (purchase_item_link_id,cost_entry_id)
);

create index if not exists purchase_item_cost_links_link_kind_idx
  on public.purchase_item_cost_links (purchase_item_link_id,component_kind,created_at);
create index if not exists purchase_item_cost_links_workspace_idx
  on public.purchase_item_cost_links (workspace_id,purchase_item_link_id);

alter table public.purchase_item_cost_links enable row level security;

create policy purchase_item_cost_links_select on public.purchase_item_cost_links
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id=purchase_item_cost_links.workspace_id
    and m.user_id=(select auth.uid())
));

revoke all on table public.purchase_item_cost_links from anon;
grant select on table public.purchase_item_cost_links to authenticated;

insert into public.purchase_item_cost_links (workspace_id,purchase_item_link_id,cost_entry_id,component_kind)
select l.workspace_id,l.id,c.id,
       case when c.category='purchase' then 'purchase' else 'shared' end
from public.purchase_item_links l
join public.cost_entries c
  on c.workspace_id=l.workspace_id and c.item_id=l.item_id
where c.notes like 'Invoice allocation%'
   or (c.category='purchase' and c.notes like 'Purchase allocation%')
   or (c.category='other' and c.notes like 'Manual shared-cost allocation%')
on conflict (cost_entry_id) do nothing;

with single_purchase as (
  select purchase_item_link_id,min(cost_entry_id::text)::uuid as cost_id
  from public.purchase_item_cost_links
  where component_kind='purchase'
  group by purchase_item_link_id
  having count(*)=1
)
update public.purchase_item_links l
set purchase_cost_entry_id=s.cost_id
from single_purchase s
where l.id=s.purchase_item_link_id and l.purchase_cost_entry_id is null;

with single_shared as (
  select purchase_item_link_id,min(cost_entry_id::text)::uuid as cost_id
  from public.purchase_item_cost_links
  where component_kind='shared'
  group by purchase_item_link_id
  having count(*)=1
)
update public.purchase_item_links l
set shared_cost_entry_id=s.cost_id
from single_shared s
where l.id=s.purchase_item_link_id and l.shared_cost_entry_id is null;

create or replace function private.link_purchase_item_cost_component()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_link_id uuid;
  v_kind text;
begin
  if new.notes like 'Invoice allocation%' then
    v_kind:=case when new.category='purchase' then 'purchase' else 'shared' end;
  elsif new.category='purchase' and new.notes like 'Purchase allocation%' then
    v_kind:='purchase';
  elsif new.category='other' and new.notes like 'Manual shared-cost allocation%' then
    v_kind:='shared';
  else
    return new;
  end if;

  select id into v_link_id
  from public.purchase_item_links
  where workspace_id=new.workspace_id and item_id=new.item_id
  limit 1;

  if v_link_id is not null then
    insert into public.purchase_item_cost_links (workspace_id,purchase_item_link_id,cost_entry_id,component_kind)
    values (new.workspace_id,v_link_id,new.id,v_kind)
    on conflict (cost_entry_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.link_purchase_item_cost_component() from public,anon,authenticated;

drop trigger if exists link_purchase_item_cost_component_after_insert on public.cost_entries;
create trigger link_purchase_item_cost_component_after_insert
after insert on public.cost_entries
for each row execute function private.link_purchase_item_cost_component();

create or replace function private.link_existing_purchase_item_cost_components()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  insert into public.purchase_item_cost_links (workspace_id,purchase_item_link_id,cost_entry_id,component_kind)
  select new.workspace_id,new.id,c.id,
         case when c.category='purchase' then 'purchase' else 'shared' end
  from public.cost_entries c
  where c.workspace_id=new.workspace_id
    and c.item_id=new.item_id
    and (
      c.notes like 'Invoice allocation%'
      or (c.category='purchase' and c.notes like 'Purchase allocation%')
      or (c.category='other' and c.notes like 'Manual shared-cost allocation%')
    )
  on conflict (cost_entry_id) do nothing;
  return new;
end;
$$;
revoke all on function private.link_existing_purchase_item_cost_components() from public,anon,authenticated;

drop trigger if exists link_existing_purchase_item_cost_components_after_insert on public.purchase_item_links;
create trigger link_existing_purchase_item_cost_components_after_insert
after insert on public.purchase_item_links
for each row execute function private.link_existing_purchase_item_cost_components();

create or replace function public.reallocate_received_purchase_lot(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_amount_aud numeric,
  p_shared_cost_override_aud numeric,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_lot public.purchase_lots%rowtype;
  v_purchase public.purchases%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
  v_received_qty numeric:=0;
  v_link_count integer:=0;
  v_seen integer:=0;
  v_target_purchase numeric;
  v_target_shared numeric;
  v_assigned_purchase numeric:=0;
  v_assigned_shared numeric:=0;
  v_new_purchase numeric;
  v_new_shared numeric;
  v_new_total numeric;
  v_cost_id uuid;
  v_ledger_id uuid;
  v_resource_name text;
  v_component_count integer;
  v_component_seen integer;
  v_component_old_total numeric;
  v_component_assigned numeric;
  v_component_value numeric;
  v_component_target numeric;
  r record;
  rc record;
begin
  if v_reason is null then
    raise exception 'A reason is required for a post-receiving allocation correction';
  end if;
  if p_amount_aud is not null and p_amount_aud<0 then
    raise exception 'AUD lot value cannot be negative';
  end if;
  if p_shared_cost_override_aud is not null and p_shared_cost_override_aud<0 then
    raise exception 'Shared-cost allocation cannot be negative';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id
      and m.user_id=auth.uid()
      and m.role=any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_lot
  from public.purchase_lots
  where workspace_id=p_workspace_id and id=p_purchase_lot_id
  for update;
  if not found then raise exception 'Purchase lot not found'; end if;

  if coalesce(v_lot.quantity_closed_short,0)>0 then
    raise exception 'This lot has a closed receiving shortfall. Resolve the financial shortfall before reallocating received costs.';
  end if;

  select * into v_purchase
  from public.purchases
  where workspace_id=p_workspace_id and id=v_lot.purchase_id;
  if not found then raise exception 'Purchase not found'; end if;

  select count(*),coalesce(sum(qty),0)
  into v_link_count,v_received_qty
  from (
    select 1::numeric qty
    from public.purchase_item_links
    where workspace_id=p_workspace_id and purchase_lot_id=p_purchase_lot_id
    union all
    select quantity_received::numeric
    from public.purchase_stock_links
    where workspace_id=p_workspace_id and purchase_lot_id=p_purchase_lot_id
  ) x;

  if v_link_count=0 or v_received_qty<=0 then
    raise exception 'Receiving has not started for this lot. Use the normal allocation editor instead.';
  end if;

  v_target_purchase:=case
    when p_amount_aud is null then null
    when v_received_qty>=v_lot.quantity_expected then round(p_amount_aud,2)
    else round((p_amount_aud*v_received_qty)/v_lot.quantity_expected,2)
  end;
  v_target_shared:=case
    when p_shared_cost_override_aud is null then null
    when v_received_qty>=v_lot.quantity_expected then round(p_shared_cost_override_aud,2)
    else round((p_shared_cost_override_aud*v_received_qty)/v_lot.quantity_expected,2)
  end;

  perform set_config('calibre.allocation_reason',v_reason,true);
  perform set_config('calibre.allocation_source','reallocation_rpc',true);

  update public.purchase_lots
  set amount_aud=p_amount_aud,
      shared_cost_override_aud=p_shared_cost_override_aud,
      updated_at=now()
  where workspace_id=p_workspace_id and id=p_purchase_lot_id;

  for r in
    select * from (
      select 'item'::text link_kind,'item'::text resource_type,l.id link_id,l.item_id resource_id,
             1::numeric qty,l.created_at,null::uuid ledger_entry_id
      from public.purchase_item_links l
      where l.workspace_id=p_workspace_id and l.purchase_lot_id=p_purchase_lot_id
      union all
      select 'stock',l.resource_type,l.id,
             case when l.resource_type='part' then l.part_id when l.resource_type='tool' then l.tool_id else l.consumable_id end,
             l.quantity_received::numeric,l.created_at,l.ledger_entry_id
      from public.purchase_stock_links l
      where l.workspace_id=p_workspace_id and l.purchase_lot_id=p_purchase_lot_id
    ) links
    order by created_at,link_id
  loop
    v_seen:=v_seen+1;
    if v_seen=v_link_count then
      v_new_purchase:=case when v_target_purchase is null then null else round(v_target_purchase-v_assigned_purchase,2) end;
      v_new_shared:=case when v_target_shared is null then null else round(v_target_shared-v_assigned_shared,2) end;
    else
      v_new_purchase:=case when v_target_purchase is null then null else round(v_target_purchase*r.qty/v_received_qty,2) end;
      v_new_shared:=case when v_target_shared is null then null else round(v_target_shared*r.qty/v_received_qty,2) end;
    end if;
    v_assigned_purchase:=v_assigned_purchase+coalesce(v_new_purchase,0);
    v_assigned_shared:=v_assigned_shared+coalesce(v_new_shared,0);
    v_new_total:=round(coalesce(v_new_purchase,0)+coalesce(v_new_shared,0),2);

    if r.link_kind='item' then
      update public.purchase_item_links
      set allocated_purchase_cost_aud=v_new_purchase,
          allocated_shared_cost_aud=v_new_shared
      where workspace_id=p_workspace_id and id=r.link_id;

      select count(*),coalesce(sum(c.amount),0)
      into v_component_count,v_component_old_total
      from public.purchase_item_cost_links pcl
      join public.cost_entries c on c.id=pcl.cost_entry_id
      where pcl.workspace_id=p_workspace_id
        and pcl.purchase_item_link_id=r.link_id
        and pcl.component_kind='purchase';
      v_component_seen:=0;
      v_component_assigned:=0;
      v_component_target:=coalesce(v_new_purchase,0);
      if v_component_count>0 then
        for rc in
          select c.id,c.amount,c.created_at
          from public.purchase_item_cost_links pcl
          join public.cost_entries c on c.id=pcl.cost_entry_id
          where pcl.workspace_id=p_workspace_id
            and pcl.purchase_item_link_id=r.link_id
            and pcl.component_kind='purchase'
          order by c.created_at,c.id
        loop
          v_component_seen:=v_component_seen+1;
          if v_component_seen=v_component_count then
            v_component_value:=round(v_component_target-v_component_assigned,2);
          elsif v_component_old_total>0 then
            v_component_value:=round(v_component_target*rc.amount/v_component_old_total,2);
          else
            v_component_value:=0;
          end if;
          v_component_assigned:=v_component_assigned+v_component_value;
          update public.cost_entries
          set amount=v_component_value
          where workspace_id=p_workspace_id and id=rc.id;
        end loop;
      elsif v_component_target>0 then
        insert into public.cost_entries (workspace_id,item_id,category,amount,currency,incurred_at,source_id,notes)
        values (
          p_workspace_id,r.resource_id,'purchase',v_component_target,'AUD',
          coalesce(v_purchase.ordered_at,current_date),v_purchase.source_id,
          concat_ws(' · ','Purchase allocation',nullif(v_purchase.vendor_name,''),nullif(v_purchase.external_order_id,''),nullif(v_lot.lot_number,''))
        ) returning id into v_cost_id;
      end if;

      select count(*),coalesce(sum(c.amount),0)
      into v_component_count,v_component_old_total
      from public.purchase_item_cost_links pcl
      join public.cost_entries c on c.id=pcl.cost_entry_id
      where pcl.workspace_id=p_workspace_id
        and pcl.purchase_item_link_id=r.link_id
        and pcl.component_kind='shared';
      v_component_seen:=0;
      v_component_assigned:=0;
      v_component_target:=coalesce(v_new_shared,0);
      if v_component_count>0 then
        for rc in
          select c.id,c.amount,c.created_at
          from public.purchase_item_cost_links pcl
          join public.cost_entries c on c.id=pcl.cost_entry_id
          where pcl.workspace_id=p_workspace_id
            and pcl.purchase_item_link_id=r.link_id
            and pcl.component_kind='shared'
          order by c.created_at,c.id
        loop
          v_component_seen:=v_component_seen+1;
          if v_component_seen=v_component_count then
            v_component_value:=round(v_component_target-v_component_assigned,2);
          elsif v_component_old_total>0 then
            v_component_value:=round(v_component_target*rc.amount/v_component_old_total,2);
          else
            v_component_value:=0;
          end if;
          v_component_assigned:=v_component_assigned+v_component_value;
          update public.cost_entries
          set amount=v_component_value
          where workspace_id=p_workspace_id and id=rc.id;
        end loop;
      elsif v_component_target>0 then
        insert into public.cost_entries (workspace_id,item_id,category,amount,currency,incurred_at,source_id,notes)
        values (
          p_workspace_id,r.resource_id,'other',v_component_target,'AUD',
          coalesce(v_purchase.ordered_at,current_date),v_purchase.source_id,
          concat_ws(' · ','Manual shared-cost allocation',nullif(v_purchase.vendor_name,''),nullif(v_purchase.external_order_id,''),nullif(v_lot.lot_number,''))
        ) returning id into v_cost_id;
      end if;

    else
      update public.purchase_stock_links
      set allocated_purchase_cost_aud=v_new_purchase,
          allocated_shared_cost_aud=v_new_shared
      where workspace_id=p_workspace_id and id=r.link_id;

      if r.resource_type='part' then
        update public.parts
        set unit_cost=case when v_new_total>0 then round(v_new_total/nullif(r.qty,0),2) else null end,
            currency='AUD',updated_at=now()
        where workspace_id=p_workspace_id and id=r.resource_id;
      elsif r.resource_type in ('tool','consumable') then
        if r.resource_type='tool' then
          update public.tools
          set purchase_cost=case when v_new_total>0 then v_new_total else null end,
              updated_at=now()
          where workspace_id=p_workspace_id and id=r.resource_id
          returning name into v_resource_name;
        else
          select name into v_resource_name
          from public.consumables
          where workspace_id=p_workspace_id and id=r.resource_id;
        end if;

        v_ledger_id:=r.ledger_entry_id;
        if v_ledger_id is null then
          select id into v_ledger_id
          from public.business_ledger_entries
          where workspace_id=p_workspace_id
            and external_key='purchase-stock:'||r.resource_type||':'||r.resource_id::text
          limit 1;
        end if;

        if v_ledger_id is not null then
          update public.business_ledger_entries
          set amount=v_new_total,
              amount_aud=v_new_total,
              updated_at=now(),
              notes=concat_ws(E'\n',nullif(notes,''),'Purchase allocation corrected: '||v_reason)
          where workspace_id=p_workspace_id and id=v_ledger_id;
          update public.purchase_stock_links
          set ledger_entry_id=v_ledger_id
          where workspace_id=p_workspace_id and id=r.link_id;
        elsif v_new_total>0 then
          insert into public.business_ledger_entries (
            workspace_id,entry_type,treatment,category,description,
            amount,currency,amount_aud,occurred_at,vendor,reference,notes,
            purchase_id,external_key,created_by
          ) values (
            p_workspace_id,'expense',
            case when r.resource_type='tool' then 'capital' else 'operating' end,
            case when r.resource_type='tool' then 'tools_equipment' else 'consumables' end,
            case when r.resource_type='tool' then 'Tool purchase: ' else 'Consumable purchase: ' end||coalesce(v_resource_name,v_lot.title),
            v_new_total,'AUD',v_new_total,coalesce(v_purchase.ordered_at,current_date),
            v_purchase.vendor_name,v_purchase.external_order_id,
            concat_ws(' · ','Received from Purchase',nullif(v_lot.lot_number,''),v_reason),
            v_purchase.id,'purchase-stock:'||r.resource_type||':'||r.resource_id::text,auth.uid()
          ) returning id into v_ledger_id;
          update public.purchase_stock_links
          set ledger_entry_id=v_ledger_id
          where workspace_id=p_workspace_id and id=r.link_id;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'purchase_lot_id',p_purchase_lot_id,
    'received_quantity',v_received_qty,
    'affected_links',v_link_count,
    'allocated_purchase_aud',v_target_purchase,
    'allocated_shared_aud',v_target_shared,
    'total_received_cost_aud',round(coalesce(v_target_purchase,0)+coalesce(v_target_shared,0),2)
  );
end;
$$;

revoke all on function public.reallocate_received_purchase_lot(uuid,uuid,numeric,numeric,text) from public;
revoke all on function public.reallocate_received_purchase_lot(uuid,uuid,numeric,numeric,text) from anon;
grant execute on function public.reallocate_received_purchase_lot(uuid,uuid,numeric,numeric,text) to authenticated;

comment on function public.reallocate_received_purchase_lot(uuid,uuid,numeric,numeric,text)
is 'Atomically corrects a received Purchase Lot allocation while preserving detailed Item cost categories and reconciling Parts, Tools, Consumables and linked ledger values. Requires a reason; closed shortfalls are blocked.';
