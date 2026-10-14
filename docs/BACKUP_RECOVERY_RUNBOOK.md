# Calibre & Co. — Backup and Recovery Runbook

Status: **Release-gate working document**  
Last revised: **2026-10-14**

This document defines the recovery model Calibre should satisfy before `Calibre-v2` replaces the original app at the main URL.

The principle is simple: **a backup is not proven until it has been restored successfully**.

---

## 1. Recovery objectives

Calibre is intended to become a business-critical operating system for acquisition, inventory, workshop, parts, finance and sales. Recovery therefore needs more than one copy of the database.

The final release process must protect:

1. structured workspace data,
2. private invoice/image/document files,
3. canonical Knowledge data,
4. database schema and functions,
5. audit/history records,
6. enough configuration to rebuild the application safely.

Formal RPO/RTO targets should be set after real operating volume is established. Until then, the acceptance requirement is that a known-good backup can be restored into a disposable environment and the core business workflow can be verified there.

---

## 2. Layered recovery model

### Layer A — Version-controlled application and schema

Repository: `samjohnmullan-create/Calibre-v2`

Keep in Git:

- application code,
- Supabase migrations,
- Edge Function source,
- roadmap and architecture documents,
- recovery documentation,
- generated database types once introduced.

This layer can rebuild **structure**, but not production business data.

### Layer B — Supabase database backups

Use Supabase-managed database backup/PITR facilities where available for the active plan and project configuration.

This is the authoritative server-side recovery layer for:

- workspace tables,
- global/canonical Knowledge tables,
- database functions,
- policies and other database state covered by the backup mechanism.

Do not assume plan-specific retention or PITR capability. Verify the actual project backup configuration before the v2 release gate is accepted.

### Layer C — Calibre portable structured export

Calibre exposes:

**Settings → Data & Recovery → Export structured backup**

Export format version: `1.0`

The export:

- reads workspace-owned records through the signed-in user's RLS permissions,
- paginates large tables in deterministic primary-key order,
- records row counts by table,
- includes a SHA-256 checksum of the structured table payload,
- downloads one JSON file,
- includes media/document database records and Storage paths as a manifest.

The portable export is intended as an additional owner-controlled copy and as the basis for a future guided restore/import tool.

It is **not** a substitute for the server-side database backup.

### Layer D — Private Storage archive

Calibre now exposes:

**Settings → Data & Recovery → Export Storage archive**

Archive format version: `1.0`

The archive is a standard TAR file. It:

- reads referenced private Storage paths from workspace `media_assets` and acquisition invoices,
- includes primary media, thumbnails where present and invoice/document binaries,
- downloads each object through the signed-in user's Storage permissions,
- preserves the `calibre-media/<storage_path>` structure inside the archive,
- verifies recorded byte size when one is available,
- calculates a SHA-256 checksum for every downloaded binary,
- embeds `calibre-storage-manifest.json` containing file paths, sizes, provenance and checksums.

The current implementation deliberately downloads files sequentially rather than opening many Storage requests at once. This is friendlier to phone/DeX use and avoids a large burst of private-file requests. The final TAR is still assembled in the browser, so very large future archives may eventually justify an S3/rclone or server-side archival path.

**Important:** implementation is not the same as recovery acceptance. The Storage archive must still be exercised against the live workspace and restored into a disposable target before this layer is considered proven.

### Layer E — Database-level audit trail

Critical Item, Work and financial mutations are now recorded automatically in `audit_events` by database triggers for:

- Items,
- Work records,
- Item cost entries,
- valuations,
- sales,
- Business Ledger entries.

The trigger function lives in a non-exposed `private` schema and records inserts, updates and deletes with old/new payloads, actor information where available, source and timestamp. Settings exposes a paginated Audit Trail reader for these events.

Audit events are included in the structured portable export and therefore form part of restore reconciliation.

### Layer F — Recovery drill

A restore procedure is not considered complete until it has been run against a disposable non-production environment.

Never test a destructive restore against the production Calibre project.

---

## 3. Current portable export scope

The structured workspace export currently includes these domains:

- Items and identity
- Passports
- Item facts and source links
- Item relationships
- Media manifest
- Research requests/findings/source links
- Acquisition invoices and invoice lines
- Purchases
- Item cost entries
- Valuations
- Offers
- Sales
- Business ledger
- Work records
- Work events
- Work templates and template steps
- Copied Work checklist steps
- Work part needs
- Work QC checks
- Measurements
- Timing runs
- Parts
- Part applications
- Part allocations
- Part fit evidence/verifications
- Tools
- Consumables
- Storage locations
- Audit events

The export deliberately excludes authentication credentials and does not attempt to export Supabase Auth secrets.

Global Knowledge data is not part of the workspace portable export. It must be protected by the server-side database backup and, later, a dedicated Knowledge export if we decide that is useful.

---

## 4. Restore drill — required sequence

This is the target drill. Some tooling remains to be built.

### Step 1 — Create the backup set

Before the drill:

1. create a portable structured export,
2. record its file name and SHA-256 checksum,
3. obtain/verify the server-side database backup point,
4. create the private Storage TAR archive and retain its embedded manifest,
5. record the Git commit used by the application at the same point in time.

### Step 2 — Create a disposable environment

Use a disposable Supabase development/staging project or branch.

Do not proceed until the target environment has been positively identified as non-production.

### Step 3 — Rebuild schema

Apply the committed Calibre migrations from a clean state.

The migration chain must complete without relying on manual production-only changes.

This is one of the reasons schema changes must remain represented in Git.

### Step 4 — Restore data

Preferred order:

1. workspace/root records,
2. Items,
3. Item identity/Passport/facts,
4. acquisition and finance records,
5. Work records/templates/checklists,
6. parts and allocations,
7. research/source records,
8. media metadata,
9. audit/history records,
10. remaining dependent records.

The eventual restore importer should be transaction-aware, idempotent where possible and refuse to silently merge conflicting records.

### Step 5 — Restore Storage files

Extract the Storage TAR and restore files to the same `calibre-media` bucket/path layout referenced by the restored `media_assets` and acquisition document records.

Use `calibre-storage-manifest.json` to verify file count, byte size and SHA-256 checksums before and after transfer.

### Step 6 — Reconcile

Compare:

- table row counts against the export manifest,
- structured payload checksum where applicable,
- Storage archive file count and per-file checksums,
- Item counts,
- Work counts/statuses,
- invoice totals,
- Item invested values,
- sales totals,
- Business Ledger totals,
- audit-event availability,
- media/document link availability.

### Step 7 — Functional acceptance

In the restored environment, verify at minimum:

- sign in,
- Home dashboard loads,
- Inventory search/filter/pagination,
- open an Item and Passport,
- open a Job Card,
- Work checklist/QC reads correctly,
- parts allocations display,
- invoice record/document link works,
- Item Sale economics reconcile,
- Business figures reconcile,
- Audit Trail loads,
- Settings structured export can run again,
- Settings Storage archive can run again.

### Step 8 — Record the drill

Record:

- date,
- source backup/export,
- source Git commit,
- disposable target,
- duration,
- failures encountered,
- fixes required,
- reconciliation result,
- final pass/fail decision.

---

## 5. Main-URL release gate dependency

The v2 main-domain cutover should not be accepted until:

- [x] structured portable export exists,
- [🟡] Storage binary archive exists in-app but has not yet passed a restore drill,
- [ ] actual Supabase backup configuration/retention is verified,
- [ ] clean migration rebuild is verified,
- [ ] disposable restore drill passes,
- [ ] restored financial totals reconcile,
- [ ] restored media/document links and file checksums are verified,
- [ ] rollback procedure for the old app is documented and retained.

This gate intentionally sits before the main URL switch and does not require later Business Brain, Club, printing or automation features to be complete.

---

## 6. Rules

1. **Never overwrite production as part of a recovery test.**
2. **Never call the structured JSON export a full backup on its own.** It does not contain binary Storage objects.
3. **Never rely on one recovery layer.**
4. **Never assume a migration exists just because a change exists in the live database.**
5. **Never silently resolve restore conflicts.** Surface them for review.
6. **Financial reconciliation is a release requirement, not a nice-to-have.**
7. **A generated archive is not proven until its files and checksums have been restored and verified.**
8. Keep the old production app available as a rollback path until the v2 release gate is formally accepted.
