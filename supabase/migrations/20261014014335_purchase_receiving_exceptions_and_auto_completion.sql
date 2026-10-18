alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status = any (array['suggested','ordered','shipped','delivered','partially_received','received','discrepancy','cancelled','returned']::text[]));

alter table public.purchase_lots
  add column if not exists quantity_closed_short integer not null default 0 check (quantity_closed_short >= 0),
  add column if not exists receiving_note text not null default '';

alter table public.purchase_lots drop constraint if exists purchase_lots_closed_short_check;
alter table public.purchase_lots add constraint purchase_lots_closed_short_check
  check (quantity_closed_short <= quantity_expected);

create table if not exists public.purchase_receiving_exceptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_id uuid not null,
  purchase_lot_id uuid not null,
  exception_type text not null check (exception_type = any (array['missing','damaged','wrong_item','extra','other']::text[])),
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'open' check (status = any (array['open','resolved','waived']::text[])),
  note text not null check (btrim(note) <> ''),
  resolution_note text not null default '',
  closes_shortfall boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  resolved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint purchase_receiving_exceptions_purchase_fk foreign key (workspace_id, purchase_id)
    references public.purchases(workspace_id, id) on delete cascade,
  constraint purchase_receiving_exceptions_lot_fk foreign key (workspace_id, purchase_lot_id)
    references public.purchase_lots(workspace_id, id) on delete cascade
);

create index if not exists purchase_receiving_exceptions_purchase_idx
  on public.purchase_receiving_exceptions (workspace_id, purchase_id, status, created_at desc);
create index if not exists purchase_receiving_exceptions_lot_idx
  on public.purchase_receiving_exceptions (workspace_id, purchase_lot_id, status, created_at desc);
create index if not exists purchase_receiving_exceptions_created_by_idx
  on public.purchase_receiving_exceptions (created_by) where created_by is not null;
create index if not exists purchase_receiving_exceptions_resolved_by_idx
  on public.purchase_receiving_exceptions (resolved_by) where resolved_by is not null;

alter table public.purchase_receiving_exceptions enable row level security;

grant select, insert, update, delete on public.purchase_receiving_exceptions to authenticated;
revoke all on public.purchase_receiving_exceptions from anon;

create policy purchase_receiving_exceptions_select on public.purchase_receiving_exceptions
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_receiving_exceptions.workspace_id
    and m.user_id = (select auth.uid())
));

create policy purchase_receiving_exceptions_insert on public.purchase_receiving_exceptions
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_receiving_exceptions.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_receiving_exceptions_update on public.purchase_receiving_exceptions
for update to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_receiving_exceptions.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
))
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_receiving_exceptions.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create policy purchase_receiving_exceptions_delete on public.purchase_receiving_exceptions
for delete to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = purchase_receiving_exceptions.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any (array['owner','editor']::text[])
));

create or replace function public.recalculate_purchase_receiving(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_status text;
  v_lot_count integer;
  v_expected bigint;
  v_received bigint;
  v_closed bigint;
  v_open_exceptions integer;
  v_new_status text;
begin
  select p.status into v_current_status
  from public.purchases p
  where p.workspace_id = p_workspace_id and p.id = p_purchase_id;

  if not found then
    raise exception 'Purchase not found';
  end if;

  if v_current_status in ('cancelled','returned') then
    return v_current_status;
  end if;

  select count(*)::integer,
         coalesce(sum(l.quantity_expected),0)::bigint,
         coalesce(sum(l.quantity_received),0)::bigint,
         coalesce(sum(l.quantity_closed_short),0)::bigint
    into v_lot_count, v_expected, v_received, v_closed
  from public.purchase_lots l
  where l.workspace_id = p_workspace_id and l.purchase_id = p_purchase_id;

  if v_lot_count = 0 then
    return v_current_status;
  end if;

  select count(*)::integer into v_open_exceptions
  from public.purchase_receiving_exceptions e
  where e.workspace_id = p_workspace_id
    and e.purchase_id = p_purchase_id
    and e.status = 'open';

  if v_open_exceptions > 0 then
    v_new_status := 'discrepancy';
  elsif v_received + v_closed >= v_expected then
    v_new_status := 'received';
  elsif v_received > 0 or v_closed > 0 then
    v_new_status := 'partially_received';
  else
    return v_current_status;
  end if;

  update public.purchases
  set status = v_new_status,
      received_at = case when v_new_status = 'received' then coalesce(received_at, now()) else received_at end,
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_purchase_id;

  return v_new_status;
end;
$$;

revoke all on function public.recalculate_purchase_receiving(uuid, uuid) from public, anon;
grant execute on function public.recalculate_purchase_receiving(uuid, uuid) to authenticated;

create or replace function public.purchase_receiving_status_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_purchase_id uuid;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);
  v_purchase_id := coalesce(new.purchase_id, old.purchase_id);
  perform public.recalculate_purchase_receiving(v_workspace_id, v_purchase_id);
  return coalesce(new, old);
end;
$$;

revoke all on function public.purchase_receiving_status_trigger() from public, anon, authenticated;

drop trigger if exists purchase_lots_recalculate_receiving on public.purchase_lots;
create trigger purchase_lots_recalculate_receiving
after insert or update of quantity_expected, quantity_received, quantity_closed_short or delete
on public.purchase_lots
for each row execute function public.purchase_receiving_status_trigger();

drop trigger if exists purchase_exceptions_recalculate_receiving on public.purchase_receiving_exceptions;
create trigger purchase_exceptions_recalculate_receiving
after insert or update of status, quantity, closes_shortfall or delete
on public.purchase_receiving_exceptions
for each row execute function public.purchase_receiving_status_trigger();

create or replace function public.record_purchase_receiving_exception(
  p_workspace_id uuid,
  p_purchase_lot_id uuid,
  p_exception_type text,
  p_quantity integer,
  p_note text
)
returns public.purchase_receiving_exceptions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot public.purchase_lots%rowtype;
  v_exception public.purchase_receiving_exceptions;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_lot
  from public.purchase_lots
  where workspace_id = p_workspace_id and id = p_purchase_lot_id;
  if not found then raise exception 'Purchase lot not found'; end if;

  if p_exception_type not in ('missing','damaged','wrong_item','extra','other') then
    raise exception 'Invalid receiving exception type';
  end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if btrim(coalesce(p_note,'')) = '' then raise exception 'Exception note is required'; end if;

  insert into public.purchase_receiving_exceptions (
    workspace_id, purchase_id, purchase_lot_id, exception_type, quantity, note, created_by
  ) values (
    p_workspace_id, v_lot.purchase_id, v_lot.id, p_exception_type, p_quantity, btrim(p_note), auth.uid()
  ) returning * into v_exception;

  return v_exception;
end;
$$;

revoke all on function public.record_purchase_receiving_exception(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.record_purchase_receiving_exception(uuid, uuid, text, integer, text) to authenticated;

create or replace function public.resolve_purchase_receiving_exception(
  p_workspace_id uuid,
  p_exception_id uuid,
  p_resolution_note text,
  p_close_shortfall boolean default false,
  p_waive boolean default false
)
returns public.purchase_receiving_exceptions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exception public.purchase_receiving_exceptions%rowtype;
  v_remaining integer;
  v_close integer;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_exception
  from public.purchase_receiving_exceptions
  where workspace_id = p_workspace_id and id = p_exception_id
  for update;
  if not found then raise exception 'Receiving exception not found'; end if;
  if v_exception.status <> 'open' then raise exception 'Receiving exception is already closed'; end if;

  if p_close_shortfall then
    if v_exception.exception_type not in ('missing','wrong_item','other') then
      raise exception 'This exception type cannot close an expected-quantity shortfall';
    end if;

    select greatest(quantity_expected - quantity_received - quantity_closed_short, 0)
      into v_remaining
    from public.purchase_lots
    where workspace_id = p_workspace_id and id = v_exception.purchase_lot_id
    for update;

    v_close := least(v_exception.quantity, coalesce(v_remaining,0));
    if v_close > 0 then
      update public.purchase_lots
      set quantity_closed_short = quantity_closed_short + v_close,
          receiving_note = concat_ws(E'\n', nullif(receiving_note,''), 'Shortfall closed: ' || btrim(coalesce(p_resolution_note,''))),
          updated_at = now()
      where workspace_id = p_workspace_id and id = v_exception.purchase_lot_id;
    end if;
  end if;

  update public.purchase_receiving_exceptions
  set status = case when p_waive then 'waived' else 'resolved' end,
      resolution_note = btrim(coalesce(p_resolution_note,'')),
      closes_shortfall = p_close_shortfall,
      resolved_by = auth.uid(),
      resolved_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_exception_id
  returning * into v_exception;

  perform public.recalculate_purchase_receiving(p_workspace_id, v_exception.purchase_id);
  return v_exception;
end;
$$;

revoke all on function public.resolve_purchase_receiving_exception(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.resolve_purchase_receiving_exception(uuid, uuid, text, boolean, boolean) to authenticated;
