import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workbench = await readFile(new URL('../src/WorkbenchRoute.tsx', import.meta.url), 'utf8')
const benchMode = await readFile(new URL('../src/BenchModeHost.tsx', import.meta.url), 'utf8')
const attention = await readFile(new URL('../src/WorkbenchAttention.tsx', import.meta.url), 'utf8')
const statusMigration = await readFile(new URL('../supabase/migrations/20261020102732_workbench_status_counts.sql', import.meta.url), 'utf8')
const attentionMigration = await readFile(new URL('../supabase/migrations/20261020104628_workbench_attention_snapshot.sql', import.meta.url), 'utf8')
const commandMigration = await readFile(new URL('../supabase/migrations/20261020105302_workbench_command_snapshot.sql', import.meta.url), 'utf8')

test('Workbench reuses the authenticated workspace and aggregates status counts in one RPC', () => {
  assert.match(workbench, /useWorkshopSession\(\)/)
  assert.match(workbench, /rpc\(['"]workbench_status_counts['"], \{ p_workspace_id: workspaceId \}\)/)
  assert.doesNotMatch(workbench, /from\(['"]workspaces['"]\)/)
  assert.doesNotMatch(workbench, /countBase\s*=/)
})

test('Workbench command centre loads cards and checklist progress in one RPC', () => {
  assert.match(workbench, /rpc\(['"]workbench_command_snapshot['"], \{/)
  assert.doesNotMatch(workbench, /from\(['"]work_checklist_steps['"]\)/)
})

test('Bench Mode reuses the authenticated session context instead of refetching identity', () => {
  assert.match(benchMode, /const \{ session, workspace \} = useWorkshopSession\(\)/)
  assert.doesNotMatch(benchMode, /auth\.getUser\(/)
  assert.doesNotMatch(benchMode, /auth\.onAuthStateChange\(/)
  assert.doesNotMatch(benchMode, /from\(['"]workspaces['"]\)/)
})

test('Bench Mode demand-loads candidates instead of fetching the full list during normal startup', () => {
  assert.match(benchMode, /async function loadCandidates/)
  assert.match(benchMode, /useEffect\(\(\) => \{ void loadActiveSession\(\) \}, \[workspaceId, userId\]\)/)
  assert.match(benchMode, /function openLauncher\(\)[\s\S]*?void loadCandidates\(/)
  assert.doesNotMatch(benchMode, /useEffect\(\(\) => \{ void loadCandidates\(\) \}, \[workspaceId, userId\]\)/)
})

test('Workbench Attention loads its dashboard data in one snapshot RPC', () => {
  assert.match(attention, /rpc\(['"]workbench_attention_snapshot['"], \{ p_workspace_id: workspace\.id \}\)/)
  assert.doesNotMatch(attention, /from\(['"]workbench_jobs['"]\)/)
  assert.doesNotMatch(attention, /from\(['"]work_part_needs['"]\)/)
  assert.doesNotMatch(attention, /from\(['"]work_qc_checks['"]\)/)
  assert.doesNotMatch(attention, /from\(['"]knowledge_document_findings['"]\)/)
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

test('Workbench command snapshot stays RLS-aware and authenticated-only', () => {
  assert.match(commandMigration, /security invoker/i)
  assert.match(commandMigration, /set search_path = ''/i)
  assert.match(commandMigration, /revoke execute on function public\.workbench_command_snapshot\(uuid, integer\) from public;/i)
  assert.match(commandMigration, /revoke execute on function public\.workbench_command_snapshot\(uuid, integer\) from anon;/i)
  assert.match(commandMigration, /grant execute on function public\.workbench_command_snapshot\(uuid, integer\) to authenticated;/i)
})
