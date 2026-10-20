import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const shell = await readFile(new URL('../src/CalibreShell.tsx', import.meta.url), 'utf8')

test('secondary workshop sections are lazy-loaded route chunks', () => {
  for (const route of [
    'IntakeRoute',
    'InventoryHubRoute',
    'ItemWorkspaceRoute',
    'BusinessRoute',
    'BusinessFinanceRoute',
    'SettingsRoute',
    'TimegrapherRoute',
    'CustomerPublishingRoute',
    'KnowledgePage',
  ]) {
    assert.match(shell, new RegExp(`const ${route} = lazy\\(\\(\\) => import\\(['\"]\\./${route}['\"]\\)\\)`))
  }
})

test('Workbench stays eager and inactive route trees are not mounted', () => {
  assert.match(shell, /import WorkbenchRoute from ['"]\.\/WorkbenchRoute['"]/) 
  assert.match(shell, /section === ['"]workbench['"] && <WorkbenchRoute \/>/)
  assert.match(shell, /section === ['"]items['"] && <><InventoryHubRoute \/><ItemWorkspaceRoute \/><\/>/)
  assert.match(shell, /section === ['"]business['"] && <><BusinessRoute \/><BusinessFinanceRoute \/><\/>/)
})

test('search and new overlays load only when opened', () => {
  assert.match(shell, /const GlobalSearch = lazy\(\(\) => import\(['"]\.\/GlobalSearch['"]\)\)/)
  assert.match(shell, /const UniversalNewMenu = lazy\(\(\) => import\(['"]\.\/UniversalNewMenu['"]\)\)/)
  assert.match(shell, /\{searchOpen && \(/)
  assert.match(shell, /\{newOpen && \(/)
})

test('lazy route loads have an accessible status fallback', () => {
  assert.match(shell, /<Suspense fallback=\{<RouteLoading section=\{section\} \/>\}>/)
  assert.match(shell, /role="status" aria-live="polite"/)
})
