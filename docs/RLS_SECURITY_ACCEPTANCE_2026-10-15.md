# RLS & security acceptance — 15 October 2026

This note records the live Calibre v2 security acceptance checks performed against the production Supabase project. It is evidence, not a replacement for the committed migration history.

## Public-table RLS coverage

A live catalogue query checked every ordinary table in the `public` schema. Every public table reported `relrowsecurity = true` and at least one RLS policy.

Representative business/workshop domains checked include:

- `workspaces`, `workspace_members`
- `items`, `item_identity`, `passports`, `media_assets`
- `work_records`, `work_checklist_steps`, `work_qc_checks`, `work_part_needs`, `work_sessions`
- `parts`, `part_allocations`, `part_fit_verifications`
- `purchases`, `purchase_lots`, `purchase_item_links`, `purchase_stock_links`, `purchase_receiving_exceptions`
- `acquisition_invoices`, `acquisition_invoice_lines`
- `business_ledger_entries`, `sales`, `valuations`, `cost_entries`
- `storage_locations`, `storage_location_events`
- `tools`, `consumables`
- research and knowledge tables

## Cross-workspace isolation check

Inside a transaction, the database role was changed to `authenticated` and the request JWT subject was set to a UUID that is not a member of any Calibre workspace.

The fake signed-in user saw zero rows in all sampled sensitive domains:

- Workspaces: 0
- Items: 0
- Parts: 0
- Purchases: 0
- Business ledger: 0
- Media assets: 0
- Work records: 0
- Work sessions: 0

The transaction was rolled back. This confirms that signed-in status alone does not expose workspace data in the sampled core domains.

## Bench-session mutation boundary

`work_sessions` is intentionally RPC-only for mutation.

Live privilege check:

- authenticated SELECT: allowed
- authenticated INSERT: denied
- authenticated UPDATE: denied
- authenticated DELETE: denied
- `start_work_session(...)` execute: allowed
- `finish_work_session(...)` execute: allowed

The two RPCs are `SECURITY DEFINER` by design because direct table mutation is revoked. Both RPCs explicitly verify that the caller is an owner/editor member of the supplied workspace. `finish_work_session` additionally requires the caller to be the user who started the session.

This produces two Supabase linter warnings for authenticated execution of `SECURITY DEFINER` functions. For Calibre these are accepted, documented exceptions: changing the functions to `SECURITY INVOKER` would require granting direct mutation rights to `work_sessions` or would break Bench Mode. Direct table mutation would be the weaker design.

## Remaining Supabase security warning

Supabase currently reports **Leaked Password Protection Disabled** at the Auth/project configuration level.

This is not a schema/RLS defect and is not changeable through the currently connected database tooling. It remains an account-level security follow-up.

Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Acceptance status

The live checks support acceptance of the current workspace RLS isolation model for the sampled core business/workshop domains and confirm the intended Bench-session privilege boundary.

This does **not** close clean-rebuild security acceptance. The documented early migration-history gap still prevents a fully trustworthy disposable-database rebuild from Git alone. Once the migration baseline is repaired, these checks should become automated runtime tests against a disposable database.
