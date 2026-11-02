import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/workspaceBackupTables.ts', import.meta.url), 'utf8')
const settings = await readFile(new URL('../src/SettingsRoute.tsx', import.meta.url), 'utf8')
const names = [...source.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1])
const uniqueNames = new Set(names)

const requiredOperationalTables = [
  'items',
  'passports',
  'item_component_assessments',
  'media_assets',
  'knowledge_technical_documents',
  'knowledge_document_links',
  'knowledge_document_findings',
  'customer_publications',
  'customer_notification_settings',
  'marketplace_listings',
  'purchases',
  'purchase_item_cost_links',
  'business_ledger_entries',
  'work_records',
  'work_events',
  'work_sessions',
  'work_session_segments',
  'work_induction_checks',
  'work_findings',
  'work_diagnostic_hypotheses',
  'work_diagnostic_checks',
  'work_diagnostic_evidence',
  'work_reasoning_runs',
  'work_plan_actions',
  'work_plan_revisions',
  'work_component_states',
  'work_checklist_steps',
  'work_step_checks',
  'work_part_needs',
  'work_qc_checks',
  'timing_runs',
  'parts',
  'part_allocations',
  'part_fit_evidence',
  'part_fit_verifications',
  'storage_locations',
  'storage_location_events',
  'audit_events',
  'backup_export_events',
]

test('workspace backup manifest has no duplicate tables', () => {
  assert.equal(uniqueNames.size, names.length)
})

test('workspace backup v2 retains the complete current table count', () => {
  assert.equal(names.length, 65, 'Adding/removing a workspace table requires an explicit backup coverage review')
})

test('business-critical workshop, Library, marketplace and recovery tables remain in the backup', () => {
  for (const table of requiredOperationalTables) {
    assert.ok(uniqueNames.has(table), `Structured backup is missing ${table}`)
  }
})

test('structured export verifies its manifest against the live workspace schema before reading rows', () => {
  assert.match(settings, /rpc\(['"]workspace_backup_schema_tables['"]\)/)
  assert.match(settings, /Backup coverage drift detected/)
  const coverageCheck = settings.indexOf('await verifyBackupCoverage()')
  const firstTableRead = settings.indexOf('await readWholeTable(definition)')
  assert.ok(coverageCheck >= 0 && firstTableRead >= 0 && coverageCheck < firstTableRead, 'coverage must be verified before table export begins')
})

test('Settings records export generation without claiming off-site retention', () => {
  assert.match(settings, /recordBackupExportEvidence/)
  assert.match(settings, /evidence_scope:\s*['"]generation_only['"]/)
  assert.match(settings, /does not prove the downloaded file was retained off-site or successfully restored/)
  assert.doesNotMatch(settings, /calibre:last-structured-export|calibre:last-storage-export/)
})
