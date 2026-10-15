import { readdir, readFile } from 'node:fs/promises'

const migrationDir = new URL('../supabase/migrations/', import.meta.url)

const files = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()
const migrations = await Promise.all(files.map(async (name) => ({
  name,
  text: (await readFile(new URL(name, migrationDir), 'utf8')).toLowerCase(),
})))

function combined() {
  return migrations.map((migration) => `\n-- ${migration.name}\n${migration.text}`).join('\n')
}

function fail(message) {
  console.error(`CRITICAL CONTRACT FAILED: ${message}`)
  process.exitCode = 1
}

function requirePattern(label, pattern) {
  const corpus = combined()
  if (!pattern.test(corpus)) fail(`${label} was not found in committed migrations.`)
}

function requireAllInOneMigration(label, patterns) {
  const match = migrations.find((migration) => patterns.every((pattern) => pattern.test(migration.text)))
  if (!match) {
    fail(`${label} is no longer represented by one committed migration.`)
    return
  }
  console.log(`✓ ${label}: ${match.name}`)
}

function requireNoPattern(label, pattern, predicate = () => true) {
  const offenders = migrations.filter((migration) => predicate(migration.name) && pattern.test(migration.text))
  if (offenders.length) fail(`${label}: ${offenders.map((migration) => migration.name).join(', ')}`)
}

// 1. Safe removal must remain archive/restore based. The archive migration must not
// introduce direct physical-inventory DELETE statements.
requireAllInOneMigration('safe inventory Archive/Trash contract', [
  /create\s+or\s+replace\s+function\s+public\.archive_inventory_entity/,
  /create\s+or\s+replace\s+function\s+public\.restore_inventory_entity/,
  /archived_at/,
  /archive_reason/,
])
requireNoPattern(
  'safe removal migration contains a hard DELETE against a physical inventory table',
  /delete\s+from\s+public\.(items|parts|tools|consumables)\b/,
  (name) => name.includes('safe_inventory_archive_trash'),
)

// 2. Permanent deletion is a narrow exception. It must always pass through the
// dependency/provenance eligibility check and require an already-archived record.
requireAllInOneMigration('dependency-aware permanent inventory delete contract', [
  /inventory_delete_eligibility/,
  /permanently_delete_inventory_entity/,
  /referenced by/,
  /storage_location_events/,
  /archived_at\s+is\s+not\s+null/,
  /permanent deletion blocked/,
])

// 3. Workshop completion must remain evidence-backed. We require one migration to
// enforce all major blockers together so a UI-only change cannot weaken closure.
requireAllInOneMigration('Work completion evidence gate', [
  /work_checklist_steps/,
  /work_part_needs/,
  /work_qc_checks/,
  /completion_summary/,
  /(raise\s+exception|cannot\s+complete|completion)/,
])

// 4. Part consumption must require fit evidence at the database boundary.
requireAllInOneMigration('fit-before-consume parts contract', [
  /consume_part_allocation/,
  /part_fit_verifications/,
  /(confirmed|conditional)/,
  /(raise\s+exception|fit evidence|fit result)/,
])

// 5. Receiving truth must be derived/protected after physical receiving evidence
// exists; the status cannot safely regress to pre-receipt states.
requireAllInOneMigration('Purchase receiving status truth contract', [
  /recalculate_purchase_receiving/,
  /(partially_received|received)/,
  /(ordered|shipped|delivered)/,
  /(trigger|prevent|regress|raise\s+exception)/,
])

// 6. Imported invoice/source evidence must be protected from later casual edits.
requirePattern(
  'imported invoice immutability contract',
  /(immutable|lock_imported|prevent.*invoice.*update|invoice.*history.*lock|imported.*invoice.*update)/s,
)

// 7. Destructive/restoration mutations for physical stock must be auditable.
requireAllInOneMigration('physical inventory archive audit coverage', [
  /audit_parts_mutations/,
  /audit_tools_mutations/,
  /audit_consumables_mutations/,
  /log_calibre_audit_event/,
])

// 8. Business Ledger history is accounting evidence: rows become immutable once
// created, and corrections are equal-and-opposite linked reversal records.
requireAllInOneMigration('append-only Business Ledger contract', [
  /business_ledger_entries_immutable/,
  /guard_business_ledger_history/,
  /reverse_business_ledger_entry/,
  /reversal_of_entry_id/,
  /(cannot be deleted|immutable)/,
])

if (process.exitCode) process.exit(process.exitCode)
console.log(`Critical Calibre contracts verified across ${files.length} committed migrations.`)
