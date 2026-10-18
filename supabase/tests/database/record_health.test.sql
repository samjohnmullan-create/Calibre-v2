begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('33333333-3333-4333-8333-333333333333', 'record-health-owner@example.invalid', '{}'::jsonb),
  ('44444444-4444-4444-8444-444444444444', 'record-health-outsider@example.invalid', '{}'::jsonb);

insert into public.workspaces (id, owner_id, name, slug)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333333',
  'Record health test workspace',
  'record-health-test'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333333',
  'owner'
);

insert into public.storage_locations (id, workspace_id, name, code, location_type)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Test tray',
  'T1',
  'tray'
);

insert into public.items (id, workspace_id, type, purpose, title)
values
  ('bbbbbbbb-0001-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'watch', 'repair', 'Repair watch'),
  ('bbbbbbbb-0002-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'jewellery', 'resale', 'Resale jewellery');

insert into public.item_identity (workspace_id, item_id, maker)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0001-4000-8000-000000000001', 'Test Watch Co'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0002-4000-8000-000000000002', 'Test Jewellery Co');

insert into public.passports (workspace_id, item_id, movement_maker, calibre, movement_identification_status)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-0001-4000-8000-000000000001',
  'Test Watch Co',
  'RH-1',
  'confirmed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

select ok(
  (select completion_pct = 44
      and max_points = 80
      and missing_keys = array['location','photos']::text[]
   from public.item_record_health
   where item_id='bbbbbbbb-0001-4000-8000-000000000001'::uuid),
  'watch Record Health applies Passport but does not require commerce fields for repair purpose'
);

select ok(
  (select max_points = 80
      and not ('passport' = any(missing_keys))
      and 'valuation' = any(missing_keys)
      and 'acquisition_cost' = any(missing_keys)
   from public.item_record_health
   where item_id='bbbbbbbb-0002-4000-8000-000000000002'::uuid),
  'non-watch resale Item is not penalised for lacking a watch Passport'
);

select lives_ok(
  $$select public.move_storage_entity(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    'item',
    'bbbbbbbb-0001-4000-8000-000000000001'::uuid,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    'Record Health put-away test'
  )$$,
  'putting an Item away uses the canonical storage movement workflow'
);

select ok(
  (select completion_pct = 75
      and has_location = true
      and not ('location' = any(missing_keys))
      and missing_keys = array['photos']::text[]
   from public.item_record_health
   where item_id='bbbbbbbb-0001-4000-8000-000000000001'::uuid),
  'put-away immediately improves Record Health without storing a duplicate score'
);

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select results_eq(
  $$select count(*)::bigint from public.item_record_health where workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid$$,
  array[0::bigint],
  'a non-member cannot read another workspace Record Health through the security-invoker view'
);

select * from finish();
rollback;
