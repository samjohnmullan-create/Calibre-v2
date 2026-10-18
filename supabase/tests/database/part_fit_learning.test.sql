begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-4333-8333-333333333333', 'fit-learning-owner@example.invalid', '{}'::jsonb);

insert into public.workspaces (id, owner_id, name, slug)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '33333333-3333-4333-8333-333333333333',
  'Fit learning workspace',
  'fit-learning-workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '33333333-3333-4333-8333-333333333333', 'owner');

insert into public.items (id, workspace_id, type, purpose, title)
values
  ('eeeeeeee-0001-4000-8000-000000000001', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'watch', 'repair', 'Target fit watch'),
  ('eeeeeeee-0002-4000-8000-000000000002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'watch', 'donor', 'Source donor A'),
  ('eeeeeeee-0003-4000-8000-000000000003', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'watch', 'donor', 'Source donor B');

insert into public.passports (workspace_id, item_id, movement_maker, calibre, movement_identification_status)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-0001-4000-8000-000000000001', 'Target Maker', 'T-200', 'confirmed'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-0002-4000-8000-000000000002', 'Source Maker', 'S-100', 'confirmed'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-0003-4000-8000-000000000003', 'Source Maker', 'S-100', 'confirmed');

insert into public.item_component_assessments (
  workspace_id, item_id, component_key, component_label, condition, confidence, evidence_note
) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-0002-4000-8000-000000000002', 'balance_assembly', 'Balance assembly', 'good', 'confirmed', 'Source A balance'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-0003-4000-8000-000000000003', 'balance_assembly', 'Balance assembly', 'good', 'confirmed', 'Source B balance');

insert into public.work_records (id, workspace_id, item_id, type, title, data_mode)
values (
  'eeeeeeee-1001-4000-8000-000000000001',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'eeeeeeee-0001-4000-8000-000000000001',
  'repair',
  'Fit learning work',
  'real'
);

create temp table fit_learning_edge_baseline as
select count(*)::bigint as edge_count from public.knowledge_compatibility_edges;
grant select on fit_learning_edge_baseline to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

select public.harvest_item_component(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
  'eeeeeeee-0002-4000-8000-000000000002'::uuid,
  'balance_assembly',
  'Balance assembly'
);
select public.harvest_item_component(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
  'eeeeeeee-0003-4000-8000-000000000003'::uuid,
  'balance_assembly',
  'Balance assembly'
);

select lives_ok(
  $$select public.record_part_fit_feedback(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    (select id from public.parts where donor_item_id='eeeeeeee-0002-4000-8000-000000000002'::uuid and part_type='balance_assembly' limit 1),
    'eeeeeeee-0001-4000-8000-000000000001'::uuid,
    'eeeeeeee-1001-4000-8000-000000000001'::uuid,
    'confirmed',
    'Fitted and ran correctly',
    false,
    '{"pivot_clearance":"acceptable"}'::jsonb
  )$$,
  'a confirmed fit can be recorded with permanent donor and movement snapshots'
);

select results_eq(
  $$select source_movement_maker || '|' || source_calibre || '|' || target_movement_maker || '|' || target_calibre || '|' || part_type_snapshot
    from public.part_fit_verifications
    where part_id=(select id from public.parts where donor_item_id='eeeeeeee-0002-4000-8000-000000000002'::uuid and part_type='balance_assembly' limit 1)
    order by verified_at desc limit 1$$,
  array['Source Maker|S-100|Target Maker|T-200|balance_assembly'::text],
  'fit evidence snapshots source movement, target movement and component type'
);

select results_eq(
  $$select fit_state || '|' || score::text
    from public.find_component_fit_learning_candidates(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
      'eeeeeeee-0001-4000-8000-000000000001'::uuid,
      'balance_assembly'
    )
    where part_id=(select id from public.parts where donor_item_id='eeeeeeee-0003-4000-8000-000000000003'::uuid and part_type='balance_assembly' limit 1)$$,
  array['confirmed|86'::text],
  'a peer component from the same source movement inherits strong workshop-proven evidence'
);

select throws_like(
  $$select public.record_part_fit_feedback(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    (select id from public.parts where donor_item_id='eeeeeeee-0002-4000-8000-000000000002'::uuid and part_type='balance_assembly' limit 1),
    'eeeeeeee-0001-4000-8000-000000000001'::uuid,
    'eeeeeeee-1001-4000-8000-000000000001'::uuid,
    'conditional',
    ''
  )$$,
  '%note is required%',
  'conditional or rejected evidence must explain the caveat'
);

select lives_ok(
  $$select public.record_part_fit_feedback(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    (select id from public.parts where donor_item_id='eeeeeeee-0002-4000-8000-000000000002'::uuid and part_type='balance_assembly' limit 1),
    'eeeeeeee-0001-4000-8000-000000000001'::uuid,
    'eeeeeeee-1001-4000-8000-000000000001'::uuid,
    'rejected',
    'Second sample fouled under the bridge'
  )$$,
  'contradictory rejected bench evidence can be recorded without rewriting the earlier result'
);

select results_eq(
  $$select fit_state || '|' || score::text
    from public.find_component_fit_learning_candidates(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
      'eeeeeeee-0001-4000-8000-000000000001'::uuid,
      'balance_assembly'
    )
    where part_id=(select id from public.parts where donor_item_id='eeeeeeee-0003-4000-8000-000000000003'::uuid and part_type='balance_assembly' limit 1)$$,
  array['mixed|38'::text],
  'contradictory workshop evidence weakens the analogous component recommendation instead of remaining confirmed'
);

select results_eq(
  $$select count(*)::bigint from public.knowledge_compatibility_edges$$,
  $$select edge_count from fit_learning_edge_baseline$$,
  'part fit feedback never creates a generic whole-movement compatibility edge'
);

select * from finish();
rollback;
