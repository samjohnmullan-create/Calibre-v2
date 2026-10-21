import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workbench = await readFile(new URL('../src/WorkbenchRoute.tsx', import.meta.url), 'utf8')
const benchMode = await readFile(new URL('../src/BenchModeHost.tsx', import.meta.url), 'utf8')
const attention = await readFile(new URL('../src/WorkbenchAttention.tsx', import.meta.url), 'utf8')
const statusMigration = await readFile(new URL('../supabase/migrations/20261020102732_workbench_status_counts.sql', import.meta.url), 'utf8')
const attentionMigration = await readFile(new URL('../supabase/migrations/20261020104628_workbench_attention_snapshot.sql', import.meta.url), 'utf8')

test('Workbench reuses the authenticated workspace and aggregates status counts in one RPC', () => {
  assert.match(workbench, /useWorkshopSession\(\)/)
  assert.match(workbench, /rpc\(['"]workbench_status_counts['"], \{ p_workspace_id: workspaceId \}\)/)
  assert.doesNotMatch(workbench, /from\(['"]workspaces['"]\)/)
  assert.doesNotMatch(workbench, /countBase\s*=/)
})

test('Workbench job detail surfaces stay out of the eager Workbench bundle', () => {
  assert.match(workbench, /const WorkJobCard = lazy\(\(\) => import\(['"]\.\/WorkJobCard['"]\)\)/)
  assert.match(workbench, /const BenchResearchPanel = lazy\(\(\) => import\(['"]\.\/BenchResearchPanel['"]\)\)/)
  assert.doesNotMatch(workbench, /import WorkJobCard from ['"]\.\/WorkJobCard['"]/)
  assert.doesNotMatch(workbench, /import BenchResearchPanel from ['"]\.\/BenchResearchPanel['"]/)
  assert.match(workbench, /<Suspense fallback=\{<div className="loading-card" role="status">Loading job workspace…<\/div>\}>/)
})

test('Bench Mode reuses the authenticated session context instead of refetching identity', () => {
  assert.match(benchMode, /const \{ session, workspace \} = useWorkshopSession\(\)/)
  assert.doesNotMatch(benchMode, /auth\.getUser\(/)
  assert.doesNotMatch(benchMode, /auth\.onAuthStateChange\(/)
  assert.doesNotMatch(benchMode, /from\(['"]workspaces['"]\)/)
})

test('Workbench Attention loads its dashboard data in one snapshot RPC', () => {
  assert.match(attention, /rpc\(['"]workbench_attention_snapshot['"], \{ p_workspace_id: workspace\.id \}\)/)
  assert.doesNotMatch(attention, /from\(['"]workbench_jobs['"]\)/)
  assert.doesNotMatch(attention, /from\(['"]work_part_needs['"]\)/)
  assert.doesNotMatch(attention, /from\(['"]work_qc_checks['"]\)/)
  assert.doesNotMatch(attention, /from\(['"]knowledge_document_findings['"]\)/)
})

test('Workbench Attention clears stale snapshot data when refresh fails', () => {
  assert.match(attention, /if \(result\.error \|\| !result\.data\) \{\s*setWork\(\[\]\)\s*setNeeds\(\[\]\)\s*setFailedQc\(\[\]\)\s*setEvidenceCount\(0\)/)
})

test('Workbench status aggregate stays RLS-aware and authenticated-only', () => {
  assert.match(statusMigration, /security invoker/i)
  assert.match(statusMigration, /set search_path = ''/i)
  assert.match(statusMigration, /revoke execute on function public\.workbench_status_counts\(uuid\) from public;/i)
  assert.match(statusMigration, /revoke execute on function public\.workbench_status_counts\(uuid\) from anon;/i)
  assert.match(statusMigration, /grant execute on function public\.workbench_status_counts\(uuid\) to authenticated;/i)
})

test('Workbench attention snapshot stays RLS-aware and authenticated-only', () => {
  assert.match(attentionMigration, /security invoker/i)
  assert.match(attentionMigration, /set search_path = ''/i)
  assert.match(attentionMigration, /revoke execute on function public\.workbench_attention_snapshot\(uuid\) from public;/i)
  assert.match(attentionMigration, /revoke execute on function public\.workbench_attention_snapshot\(uuid\) from anon;/i)
  assert.match(attentionMigration, /grant execute on function public\.workbench_attention_snapshot\(uuid\) to authenticated;/i)
})
