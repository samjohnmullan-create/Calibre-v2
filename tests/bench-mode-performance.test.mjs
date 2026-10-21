import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const host = await readFile(new URL('../src/BenchModeHost.tsx', import.meta.url), 'utf8')

test('Bench Mode panel loads only after the launcher opens a selected job', () => {
  assert.match(host, /const BenchModePanel = lazy\(\(\) => import\(['"]\.\/BenchModePanel['"]\)\)/)
  assert.doesNotMatch(host, /import BenchModePanel from ['"]\.\/BenchModePanel['"]/)
  assert.match(host, /<Suspense fallback=\{<div className="loading-card" role="status">Loading Bench Mode…<\/div>\}>/)
})
