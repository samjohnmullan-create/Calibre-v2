# Calibre v2 — Live vs Repository Migration Audit

Status: **Foundation release-gate audit**  
Date: **2026-10-14**

## Purpose

This audit compares the live Supabase migration history for `Calibre v2` against the SQL files currently committed under `supabase/migrations/`.

A clean rebuild from Git is **not yet accepted** simply because production is healthy. The repository must contain enough migration history to reproduce the schema in a disposable environment without depending on undocumented production-only state.

## Live migration history not yet represented by a committed repository migration

The following live migration records do not currently have a matching SQL migration file in the repository:

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

These are the current blockers to calling the repository migration chain a complete reconstruction source.

## Naming / provenance mismatch to verify

The live database records migration:

- `20261013091011_link_invoice_documents_to_imported_items`

The repository contains:

- `20261013_link_invoice_documents_to_items.sql`

This is likely the historical source for the live change, but the content/provenance should be verified before treating it as equivalent for a clean rebuild.

## Repository state

The repository contains the later operational migrations for Knowledge, Parts, Work, Invoice intake, Business, Search, Audit and RLS hardening, including the recent timestamp-safe migrations added during Foundation hardening.

The migration integrity script currently validates filename shape, duplicate 14-digit versions and non-empty SQL. It does **not** prove parity with the live `supabase_migrations.schema_migrations` table.

## Required close-out work

Before the Release Candidate gate can mark clean migration rebuild as passed:

1. recover or reconstruct the missing early migration SQL;
2. commit those migrations with their actual live timestamps where practical;
3. reconcile the three invoice FX history entries — preserving them as intentional historical/no-op records if appropriate;
4. verify the invoice-document-link migration content equivalence;
5. add a live-vs-repo parity check to the release procedure;
6. create a disposable Supabase branch/project;
7. rebuild from the committed migration chain;
8. reconcile schema objects and core workflow behaviour against production.

## Acceptance rule

**Do not mark “clean migration rebuild” complete until a disposable environment has been built from the committed migration history and passed the recovery acceptance checklist.**
