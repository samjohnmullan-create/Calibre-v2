begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(6);

select ok(
  not has_table_privilege('anon', 'public.backup_export_events', 'SELECT'),
  'anonymous clients cannot read backup export evidence'
);

select ok(
  has_table_privilege('authenticated', 'public.backup_export_events', 'SELECT')
  and has_table_privilege('authenticated', 'public.backup_export_events', 'INSERT'),
  'authenticated clients have only the required read/append path'
);

select ok(
  not has_table_privilege('authenticated', 'public.backup_export_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.backup_export_events', 'DELETE')
  and not has_table_privilege('authenticated', 'public.backup_export_events', 'TRUNCATE'),
  'client backup evidence is append-only'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('55555555-5555-4555-8555-555555555555', 'backup-evidence-owner@example.invalid', '{}'::jsonb),
  ('66666666-6666-4666-8666-666666666666', 'backup-evidence-outsider@example.invalid', '{}'::jsonb);

insert into public.workspaces (id, owner_id, name, slug)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '55555555-5555-4555-8555-555555555555',
  'Backup evidence test workspace',
  'backup-evidence-test'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '55555555-5555-4555-8555-555555555555',
  'owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);

select lives_ok(
  $$insert into public.backup_export_events (
    workspace_id, export_kind, export_version, structured_table_count, row_count, artifact_bytes, content_checksum, details
  ) values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
    'structured',
    '2.0',
    65,
    123,
    4567,
    'test-checksum',
    '{"evidence_scope":"generation_only"}'::jsonb
  )$$,
  'workspace owner can append backup export evidence'
);

select results_eq(
  $$select count(*)::bigint from public.backup_export_events where workspace_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid$$,
  array[1::bigint],
  'workspace owner can read their backup export evidence'
);

select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
select results_eq(
  $$select count(*)::bigint from public.backup_export_events where workspace_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid$$,
  array[0::bigint],
  'non-member cannot read another workspace backup export evidence'
);

select * from finish();
rollback;
