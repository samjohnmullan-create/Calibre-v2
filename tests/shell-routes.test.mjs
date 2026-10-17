import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const shell = await readFile(new URL('../src/CalibreShell.tsx', import.meta.url), 'utf8')

const routeContracts = [
  ['#/workbench', /<WorkbenchRoute\s*\/>/],
  ['#/intake', /<IntakeRoute\s*\/>/],
  ['#/items', /<InventoryHubRoute\s*\/>/],
  ['#/business\/finance', /<BusinessFinanceRoute\s*\/>/],
  ['#/customer', /<CustomerPublishingRoute\s*\/>/],
  ['#/timegrapher', /<TimegrapherRoute\s*\/>/],
  ['#/settings', /<SettingsRoute\s*\/>/],
]

test('every shell navigation destination has a mounted route surface', () => {
  for (const [hash, mount] of routeContracts) {
    assert.ok(shell.includes(hash), `Expected shell navigation to include ${hash}`)
    assert.match(shell, mount, `Expected ${hash} to have a mounted route component`)
  }
})

test('Library navigation mounts KnowledgePage with the authenticated workspace', () => {
  assert.match(shell, /import KnowledgePage from ['"]\.\/KnowledgePage['"]/)
  assert.ok(shell.includes("hash: '#/calibre'"), 'Expected Library navigation to target #/calibre')
  assert.match(
    shell,
    /section\s*===\s*['"]calibre['"]\s*&&\s*<KnowledgePage\s+workspaceId=\{workspace\.id\}\s*\/>/,
    'Library must mount KnowledgePage when the shell section is calibre',
  )
})

test('Library page remains route-scoped rather than rendering on every section', () => {
  assert.doesNotMatch(shell, /^\s*<KnowledgePage\s+workspaceId=\{workspace\.id\}\s*\/>\s*$/m)
})
