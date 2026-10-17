# Calibre v2 — Live vs Repository Migration Audit

Status: **Recovery in validation**  
Original audit: **2026-10-14**  
Recovery work: **2026-10-18**

## Purpose

This audit compares the live Supabase migration history for `Calibre v2` against the SQL files committed under `supabase/migrations/`.

Production health alone is not enough to prove recoverability. The repository must be able to reconstruct the schema in a disposable environment without undocumented production-only state.

## Live history recovered

The live Supabase project contains 129 applied migrations. The repository previously omitted the following 10 applied records:

1. `20261012035444_001_core_foundation`
2. `20261012035506_002_work_research_media`
3. `20261012035539_003_workshop_commerce_knowledge`
4. `20261012035557_004_rls_and_privileges`
5. `20261012035614_005_private_media_storage`
6. `20261012035648_006_security_and_fk_indexes`
7. `20261012061124_fix_workspace_member_bootstrap_rls_recursion`
8. `20261013085552_backfill_invoice_aud_conversion`
9. `20261013085610_remove_accidental_invoice_backfill_marker`
10. `20261013085619_noop_invoice_fx_schema_verify`

All 10 have now been recovered from `supabase_migrations.schema_migrations` and committed on the recovery branch using their exact live timestamps and SQL.

## Legacy executable migration names normalised

The first disposable rebuild attempt (GitHub Actions run `39065991327`) exposed a second problem: the repository still had historical migrations named only with an 8-digit date prefix. Supabase CLI sorted those before the recovered 14-digit foundation and therefore attempted to execute dependent Knowledge migrations before `knowledge_movements` existed.

The recovery branch now keeps `supabase/migrations/` as a replayable-only directory:

- exact historical matches were renamed to their real 14-digit applied timestamp;
- repository copies that had drifted after deployment were moved to `supabase/migration-history/legacy/` and replaced in the active chain by the exact live SQL;
- historical experiments that were never applied to production were moved to `supabase/migration-history/legacy/` and removed from the executable chain;
- the migration integrity checker now rejects any executable migration that is not named `<YYYYMMDDHHMMSS>_snake_case.sql`.

The archive is intentionally non-executable. It preserves provenance without affecting clean rebuild order.

## Invoice-document migration equivalence

The live database records:

- `20261013091011_link_invoice_documents_to_imported_items`

The historical repository file was:

- `20261013_link_invoice_documents_to_items.sql`

Content equivalence has been proven. The live SQL, with the repository file's final newline, hashes to Git blob SHA `32b3d92862644e4d58a5fb166e540ca6d3af26ae`, exactly matching the historical repository blob. The active migration is now named with the live timestamp and live migration name.

## Clean rebuild gate

A dedicated workflow, `.github/workflows/supabase-rebuild-smoke.yml`, now creates a disposable local Supabase environment and runs `supabase db reset` against the committed migration chain.

The first run failed usefully because of the legacy filename ordering described above. A subsequent run is validating the normalised chain. The gate remains **not accepted** until a disposable rebuild reaches a successful completion.

## Remaining acceptance work

Before the Release Candidate gate can mark clean migration rebuild as passed:

1. complete a successful disposable rebuild from the committed migration chain;
2. reconcile any later timestamp/content drift surfaced by that rebuild;
3. compare key schema objects and workshop contracts with production;
4. add pgTAP tests for destructive and state-transition behaviour;
5. run those tests automatically after every clean rebuild.

## Acceptance rule

**Do not mark “clean migration rebuild” complete until a disposable environment has been built from the committed migration history and passed the recovery acceptance checklist.**
