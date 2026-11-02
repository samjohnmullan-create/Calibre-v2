begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(4);

select ok(
  has_function_privilege('authenticated', 'public.workspace_backup_schema_tables()', 'EXECUTE'),
  'authenticated clients can run the backup schema coverage check'
);

select ok(
  not has_function_privilege('anon', 'public.workspace_backup_schema_tables()', 'EXECUTE'),
  'anonymous clients cannot run the backup schema coverage check'
);

select is(
  cardinality(public.workspace_backup_schema_tables()),
  65,
  'the current schema contains exactly the 65 reviewed workspace-scoped base tables'
);

select ok(
  public.workspace_backup_schema_tables() @> array['customer_notification_settings','marketplace_listings','backup_export_events']::text[],
  'recent backup-sensitive tables are included in schema coverage discovery'
);

select * from finish();
rollback;
