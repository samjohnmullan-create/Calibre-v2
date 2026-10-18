begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(21);

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
  ('aaaaaaaa-0003-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'watch', 'resale', 'Archive test watch'),
  ('aaaaaaaa-0004-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'watch', 'donor', 'Harvest test donor A'),
  ('aaaaaaaa-0005-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'watch', 'donor', 'Harvest test donor B');

insert into public.passports (workspace_id, item_id, movement_maker, calibre, movement_identification_status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0001-4000-8000-000000000001', 'Target Maker', 'TARGET-1', 'confirmed'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0004-4000-8000-000000000004', 'Test Maker', 'T-100', 'confirmed'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0005-4000-8000-000000000005', 'Test Maker', 'T-100', 'confirmed');

insert into public.item_component_assessments (
  workspace_id, item_id, component_key, component_label, condition, confidence, evidence_note
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0004-4000-8000-000000000004', 'balance_assembly', 'Balance assembly', 'good', 'confirmed', 'Stable pivot and free oscillation'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0005-4000-8000-000000000005', 'balance_assembly', 'Balance assembly', 'good', 'confirmed', 'Second donor balance ready for comparison');

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
  ('dddddddd-0002-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'mainspring', 'Competing mainspring need'),
  ('dddddddd-0003-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'balance_assembly', 'Balance assembly fit-learning need');

create temporary table fit_edge_count_before as
select count(*)::bigint as edge_count from public.knowledge_compatibility_edges;

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

select lives_ok(
  $$select public.harvest_item_component(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'aaaaaaaa-0004-4000-8000-000000000004'::uuid,
    'balance_assembly',
    'Balance assembly',
    null,
    12.50,
    'AUD',
    'pgTAP harvest'
  )$$,
  'a donor component can be harvested atomically into Parts'
);

select results_eq(
  $$select count(*)::bigint from public.parts
    where donor_item_id='aaaaaaaa-0004-4000-8000-000000000004'::uuid
      and part_type='balance_assembly'
      and provenance_type='donor'
      and quantity=1$$,
  array[1::bigint],
  'harvest creates exactly one donor-provenance Part'
);

select ok(
  (select inventory_state='harvested'
      and harvested_part_id is not null
      and harvested_at is not null
   from public.item_component_assessments
   where item_id='aaaaaaaa-0004-4000-8000-000000000004'::uuid
     and component_key='balance_assembly'),
  'harvest depletes the donor component and links it to the created Part'
);

select throws_like(
  $$select public.harvest_item_component(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'aaaaaaaa-0004-4000-8000-000000000004'::uuid,
    'balance_assembly',
    'Balance assembly'
  )$$,
  '%already been harvested%',
  'the same physical donor component cannot be harvested twice'
);

select throws_like(
  $$select public.record_part_fit_feedback(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    (select id from public.parts where donor_item_id='aaaaaaaa-0004-4000-8000-000000000004'::uuid and part_type='balance_assembly' limit 1),
    'aaaaaaaa-0001-4000-8000-000000000001'::uuid,
    'bbbbbbbb-0001-4000-8000-000000000001'::uuid,
    'confirmed',
    'should fail before reservation',
    false,
    '{}'::jsonb
  )$$,
  '%must be reserved or used%',
  'fit evidence cannot be recorded before the physical Part is allocated to the Work job'
);

select lives_ok(
  $$select public.reserve_part_for_need(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    'dddddddd-0003-4000-8000-000000000003'::uuid,
    (select id from public.parts where donor_item_id='aaaaaaaa-0004-4000-8000-000000000004'::uuid and part_type='balance_assembly' limit 1),
    1,
    'fit learning reservation'
  )$$,
  'a harvested donor Part can be reserved for a Work fit test'
);

select lives_ok(
  $$select public.record_part_fit_feedback(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    (select id from public.parts where donor_item_id='aaaaaaaa-0004-4000-8000-000000000004'::uuid and part_type='balance_assembly' limit 1),
    'aaaaaaaa-0001-4000-8000-000000000001'::uuid,
    'bbbbbbbb-0001-4000-8000-000000000001'::uuid,
    'confirmed',
    'Drop-in bench fit with stable freedom',
    false,
    '{"staff_height_mm":3.20,"observation":"free oscillation after fitting"}'::jsonb
  )$$,
  'a reserved donor Part can record structured fit evidence'
);

select ok(
  (select source_donor_item_id='aaaaaaaa-0004-4000-8000-000000000004'::uuid
      and source_movement_maker='Test Maker'
      and source_calibre='T-100'
      and target_movement_maker='Target Maker'
      and target_calibre='TARGET-1'
      and part_type_snapshot='balance_assembly'
      and measured_values->>'staff_height_mm'='3.20'
   from public.part_fit_verifications
   where work_record_id='bbbbbbbb-0001-4000-8000-000000000001'::uuid
     and result='confirmed'
   order by verified_at desc
   limit 1),
  'fit evidence permanently snapshots source donor, source/target movement identity and bench measurements'
);

-- Set up a second physical component with the same source movement lineage after the first fit was learned.
select public.harvest_item_component(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'aaaaaaaa-0005-4000-8000-000000000005'::uuid,
  'balance_assembly',
  'Balance assembly',
  null,
  null,
  'AUD',
  'second lineage candidate'
);

select ok(
  exists (
    select 1
    from public.find_component_fit_learning_candidates(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'aaaaaaaa-0001-4000-8000-000000000001'::uuid,
      'balance_assembly'
    ) learned
    join public.parts p on p.id=learned.part_id
    where p.donor_item_id='aaaaaaaa-0005-4000-8000-000000000005'::uuid
      and learned.fit_state='confirmed'
      and learned.successful_fits=1
      and learned.score=86
  ),
  'a successful fit teaches another harvested component with the same source movement and component type'
);

select ok(
  exists (
    select 1
    from public.find_owned_compatibility_candidates_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'aaaaaaaa-0001-4000-8000-000000000001'::uuid,
      'balance_assembly',
      40
    ) ranked
    join public.parts p on p.id=ranked.part_id
    where p.donor_item_id='aaaaaaaa-0005-4000-8000-000000000005'::uuid
      and ranked.source_kind='workshop_fit_lineage'
      and ranked.evidence_tier='candidate'
      and ranked.score=86
  ),
  'workshop-learned component lineage is promoted into owned-parts candidate ranking without being called confirmed interchangeability'
);

set local role postgres;
select results_eq(
  $$select count(*)::bigint from public.knowledge_compatibility_edges$$,
  $$select edge_count from fit_edge_count_before$$,
  'recording one successful component fit does not create a generic movement compatibility edge'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

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
