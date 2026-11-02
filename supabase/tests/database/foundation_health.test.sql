begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(6);

select is(
  (
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  0::bigint,
  'every public application table has row-level security enabled'
);

select ok(
  not has_schema_privilege('anon', 'public', 'CREATE')
  and not has_schema_privilege('authenticated', 'public', 'CREATE'),
  'client roles cannot create objects in the public schema'
);

select is(
  (
    select count(*)::bigint
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
  ),
  0::bigint,
  'client roles do not hold destructive or maintenance table privileges'
);

select is(
  (
    select count(*)::bigint
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype = 'r'
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
      and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')
  ),
  0::bigint,
  'postgres public-table defaults cannot reintroduce broad client privileges'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'start_work_session',
        'pause_work_session',
        'resume_work_session',
        'finish_work_session',
        'reset_work_job'
      )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'anonymous clients cannot execute privileged workshop session RPCs'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'start_work_session',
        'pause_work_session',
        'resume_work_session',
        'finish_work_session',
        'reset_work_job'
      )
      and p.prosecdef
      and (
        position('auth.uid()' in pg_get_functiondef(p.oid)) = 0
        or position('workspace' in lower(pg_get_functiondef(p.oid))) = 0
      )
  ),
  0::bigint,
  'privileged workshop session RPCs retain explicit user and workspace authorization checks'
);

select * from finish();
rollback;
