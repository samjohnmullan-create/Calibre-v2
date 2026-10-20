import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workbench = await readFile(new URL('../src/WorkbenchRoute.tsx', import.meta.url), 'utf8')
const benchMode = await readFile(new URL('../src/BenchModeHost.tsx', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20261020102732_workbench_status_counts.sql', import.meta.url), 'utf8')

test('Workbench reuses the authenticated workspace and aggregates status counts in one RPC', () => {
  assert.match(workbench, /useWorkshopSession\(\)/)
  assert.match(workbench, /rpc\(['"]workbench_status_counts['"], \{ p_workspace_id: workspaceId \}\)/)
  assert.doesNotMatch(workbench, /from\(['"]workspaces['"]\)/)
  assert.doesNotMatch(workbench, /countBase\s*=/)
})

test('Bench Mode reuses the authenticated session context instead of refetching identity', () => {
  assert.match(benchMode, /const \{ session, workspace \} = useWorkshopSession\(\)/)
  assert.doesNotMatch(benchMode, /auth\.getUser\(/)
  assert.doesNotMatch(benchMode, /auth\.onAuthStateChange\(/)
  assert.doesNotMatch(benchMode, /from\(['"]workspaces['"]\)/)
})

test('Workbench status aggregate stays RLS-aware and authenticated-only', () => {
  assert.match(migration, /security invoker/i)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /revoke execute on function public\.workbench_status_counts\(uuid\) from public;/i)
  assert.match(migration, /revoke execute on function public\.workbench_status_counts\(uuid\) from anon;/i)
  assert.match(migration, /grant execute on function public\.workbench_status_counts\(uuid\) to authenticated;/i)
})
