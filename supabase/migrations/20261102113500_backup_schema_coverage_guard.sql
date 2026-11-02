-- Section 0.2.2 Foundation Health Baseline
--
-- Return the authoritative set of public base tables scoped to a workspace.
-- The browser compares this list with its structured-backup manifest before
-- generating an export, so a newly added workspace table cannot be silently
-- omitted from a backup.

create or replace function public.workspace_backup_schema_tables()
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(scoped.table_name order by scoped.table_name), '{}'::text[])
  from (
    select distinct c.table_name::text as table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'workspace_id'
      and t.table_type = 'BASE TABLE'
  ) scoped;
$$;

revoke all on function public.workspace_backup_schema_tables() from public;
revoke all on function public.workspace_backup_schema_tables() from anon;
grant execute on function public.workspace_backup_schema_tables() to authenticated;
