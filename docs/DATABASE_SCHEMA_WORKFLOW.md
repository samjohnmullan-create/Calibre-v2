# Calibre database schema workflow

**Status:** Foundation rule for Calibre v2

## Why this exists

Calibre's first Supabase changes were applied through managed database tooling and then mirrored into `supabase/migrations`. Those early migration files use date-only prefixes such as `20261013_...`. Several files therefore share the same date prefix.

Supabase CLI migration history compares migration versions by the numeric timestamp prefix. That means the legacy date-only files are useful historical records, but they are **not safe to treat as a clean `supabase db push` chain without first reconciling history**.

Do not rewrite or rename already-applied legacy migrations merely to make the folder prettier. Production history should remain explainable.

## Rule from now on

All new migrations must use a unique 14-digit UTC timestamp:

`YYYYMMDDHHMMSS_description_in_snake_case.sql`

Example:

`20261014094500_add_item_storage_location.sql`

The CI migration integrity check enforces naming, non-empty SQL files and uniqueness for 14-digit migration versions. Legacy date-prefixed collisions are reported as warnings rather than failing the build.

## Schema change process

1. Inspect the live schema before changing it.
2. Create a uniquely timestamped migration in `supabase/migrations`.
3. Apply DDL through the migration-capable database tool, not an untracked one-off remote edit.
4. Commit the migration with the application change that depends on it.
5. Run CI and confirm the migration-integrity check and app build pass.
6. Re-run Supabase security/performance advisors after meaningful DDL/RLS/index changes.
7. Never edit an already-applied migration to change production state. Add a forward migration instead.

## Generated TypeScript database types

The target is to keep an official Supabase-generated `src/lib/database.types.ts` in the repository and instantiate `supabase-js` as `createClient<Database>()`.

Official generation command:

```bash
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" --schema public > src/lib/database.types.ts
```

The current connected automation identity does not have permission to call Supabase's type-generation endpoint, so Calibre should **not** fabricate a hand-written replacement and call it generated. Until a CI/service identity with Supabase project access is configured, application-specific row types remain local to their components.

When access is available, add a CI freshness check that regenerates the file and fails if `git diff --exit-code src/lib/database.types.ts` is non-zero.

## Drift checks

There are three different drift problems and they must not be confused:

- **Migration-history drift:** Git migration versions differ from the remote `supabase_migrations.schema_migrations` history.
- **Schema drift:** the live database structure differs from what the migration chain would produce.
- **Type drift:** checked-in TypeScript database types differ from the current live schema.

The migration-integrity CI check added to Calibre prevents new ambiguous migration versions. Full remote history/schema/type drift checking requires a linked Supabase CLI identity and should be enabled before Release Candidate.

## Release Candidate gate

Before the main Calibre URL is treated as Release Candidate:

- reconcile legacy migration history with the live project;
- establish a reproducible clean database bootstrap or documented baseline;
- check in generated TypeScript database types;
- make type freshness a CI check;
- run a restore drill against a disposable project;
- confirm no production schema change depends on an undocumented manual edit.
