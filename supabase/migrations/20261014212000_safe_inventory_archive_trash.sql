-- Safe inventory removal foundation.
-- Archive/restore is the default destructive path for physical business records.

alter table public.items
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text not null default '';

alter table public.parts
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text not null default '';

alter table public.tools
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text not null default '';

alter table public.consumables
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text not null default '';

create index if not exists items_workspace_archived_idx
  on public.items (workspace_id, archived_at);
create index if not exists parts_workspace_archived_idx
  on public.parts (workspace_id, archived_at);
create index if not exists tools_workspace_archived_idx
  on public.tools (workspace_id, archived_at);
create index if not exists consumables_workspace_archived_idx
  on public.consumables (workspace_id, archived_at);

-- Parts, tools and consumables become material audited records too.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'log_calibre_audit_event'
  ) then
    execute 'drop trigger if exists audit_parts_mutations on public.parts';
    execute 'create trigger audit_parts_mutations after insert or update or delete on public.parts for each row execute function private.log_calibre_audit_event()';
    execute 'drop trigger if exists audit_tools_mutations on public.tools';
    execute 'create trigger audit_tools_mutations after insert or update or delete on public.tools for each row execute function private.log_calibre_audit_event()';
    execute 'drop trigger if exists audit_consumables_mutations on public.consumables';
    execute 'create trigger audit_consumables_mutations after insert or update or delete on public.consumables for each row execute function private.log_calibre_audit_event()';
  end if;
end
$$;

create or replace function public.archive_inventory_entity(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  changed integer := 0;
  actor uuid := auth.uid();
begin
  case lower(trim(p_entity_type))
    when 'item' then
      update public.items
         set archived_at = coalesce(archived_at, now()),
             archived_by = coalesce(archived_by, actor),
             archive_reason = case when trim(coalesce(p_reason, '')) <> '' then trim(p_reason) else archive_reason end,
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is null;
    when 'part' then
      update public.parts
         set archived_at = coalesce(archived_at, now()),
             archived_by = coalesce(archived_by, actor),
             archive_reason = case when trim(coalesce(p_reason, '')) <> '' then trim(p_reason) else archive_reason end,
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is null;
    when 'tool' then
      update public.tools
         set archived_at = coalesce(archived_at, now()),
             archived_by = coalesce(archived_by, actor),
             archive_reason = case when trim(coalesce(p_reason, '')) <> '' then trim(p_reason) else archive_reason end,
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is null;
    when 'consumable' then
      update public.consumables
         set archived_at = coalesce(archived_at, now()),
             archived_by = coalesce(archived_by, actor),
             archive_reason = case when trim(coalesce(p_reason, '')) <> '' then trim(p_reason) else archive_reason end,
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is null;
    else
      raise exception 'Unsupported inventory entity type: %', p_entity_type;
  end case;

  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'Inventory record was not found or is already archived';
  end if;

  return jsonb_build_object(
    'entity_type', lower(trim(p_entity_type)),
    'entity_id', p_entity_id,
    'archived_at', now()
  );
end;
$$;

create or replace function public.restore_inventory_entity(
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
  changed integer := 0;
begin
  case lower(trim(p_entity_type))
    when 'item' then
      update public.items
         set archived_at = null,
             archived_by = null,
             archive_reason = '',
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    when 'part' then
      update public.parts
         set archived_at = null,
             archived_by = null,
             archive_reason = '',
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    when 'tool' then
      update public.tools
         set archived_at = null,
             archived_by = null,
             archive_reason = '',
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    when 'consumable' then
      update public.consumables
         set archived_at = null,
             archived_by = null,
             archive_reason = '',
             updated_at = now()
       where workspace_id = p_workspace_id and id = p_entity_id and archived_at is not null;
    else
      raise exception 'Unsupported inventory entity type: %', p_entity_type;
  end case;

  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'Inventory record was not found or is not archived';
  end if;

  return jsonb_build_object(
    'entity_type', lower(trim(p_entity_type)),
    'entity_id', p_entity_id,
    'restored_at', now()
  );
end;
$$;

revoke all on function public.archive_inventory_entity(uuid, text, uuid, text) from public, anon;
revoke all on function public.restore_inventory_entity(uuid, text, uuid) from public, anon;
grant execute on function public.archive_inventory_entity(uuid, text, uuid, text) to authenticated;
grant execute on function public.restore_inventory_entity(uuid, text, uuid) to authenticated;
