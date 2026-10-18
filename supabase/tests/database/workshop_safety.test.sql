begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(10);

-- Isolated identities used only inside this transaction.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-calibre-test@example.invalid', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'outsider-calibre-test@example.invalid', '{}'::jsonb);

insert into public.workspaces (id, owner_id, name, slug)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Calibre test workspace',
  'calibre-test-workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'owner'
);

insert into public.items (id, workspace_id, type, purpose, title)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'watch', 'repair', 'Parts test watch'),
  ('aaaaaaaa-0002-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'watch', 'repair', 'Completion gate watch'),
  ('aaaaaaaa-0003-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'watch', 'resale', 'Archive test watch');

insert into public.work_records (id, workspace_id, item_id, type, title, data_mode)
values
  ('bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0001-4000-8000-000000000001', 'repair', 'Parts test work', 'real'),
  ('bbbbbbbb-0002-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0002-4000-8000-000000000002', 'repair', 'Completion gate work', 'real');

insert into public.parts (id, workspace_id, part_type, description, quantity)
values (
  'cccccccc-0001-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'mainspring',
  'Single test mainspring',
  1
);

insert into public.work_part_needs (id, workspace_id, work_record_id, item_id, part_type, description)
values
  ('dddddddd-0001-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'mainspring', 'Primary mainspring need'),
  ('dddddddd-0002-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'mainspring', 'Competing mainspring need');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select lives_ok(
  $$select public.archive_inventory_entity(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'item',
    'aaaaaaaa-0003-4000-8000-000000000003'::uuid,
    'pgTAP archive safety check'
  )$$,
  'archiving an Item succeeds'
);

select results_eq(
  $$select count(*)::bigint from public.items where id='aaaaaaaa-0003-4000-8000-000000000003'::uuid$$,
  array[1::bigint],
  'archive keeps the physical Item row instead of deleting it'
);

select ok(
  (select archived_at is not null from public.items where id='aaaaaaaa-0003-4000-8000-000000000003'::uuid),
  'archive stamps archived_at'
);

select throws_like(
  $$select public.reset_work_job(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'bbbbbbbb-0001-4000-8000-000000000001'::uuid,
    'test_clear',
    'must not clear real work'
  )$$,
  '%Clear Test/Demo is only available for test Work%',
  'test_clear cannot wipe a real workshop job'
);

select lives_ok(
  $$select public.reserve_part_for_need(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'dddddddd-0001-4000-8000-000000000001'::uuid,
    'cccccccc-0001-4000-8000-000000000001'::uuid,
    1,
    'pgTAP reservation'
  )$$,
  'available stock can be reserved for a need'
);

select throws_like(
  $$select public.reserve_part_for_need(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'dddddddd-0002-4000-8000-000000000002'::uuid,
    'cccccccc-0001-4000-8000-000000000001'::uuid,
    1,
    'competing reservation'
  )$$,
  '%Not enough unreserved stock%',
  'the same physical stock cannot be double-reserved'
);

select lives_ok(
  $$select public.consume_part_reservation(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    (select id from public.part_allocations
      where work_part_need_id='dddddddd-0001-4000-8000-000000000001'::uuid
        and status='reserved'
      limit 1)
  )$$,
  'a reserved part can be consumed once'
);

select results_eq(
  $$select quantity from public.parts where id='cccccccc-0001-4000-8000-000000000001'::uuid$$,
  array[0::numeric],
  'consuming a reservation decrements physical stock exactly once'
);

select throws_like(
  $$update public.work_records
    set status='complete', completion_summary='Attempted completion without Final Verification'
    where id='bbbbbbbb-0002-4000-8000-000000000002'::uuid$$,
  '%Release sign-off%',
  'repair Work cannot complete without an approved Release sign-off'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select results_eq(
  $$select count(*)::bigint from public.items where workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
  array[0::bigint],
  'a non-member cannot read another workspace Item through RLS'
);

select * from finish();
rollback;
