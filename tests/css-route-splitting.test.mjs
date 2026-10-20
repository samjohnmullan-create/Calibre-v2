import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workshopEntry = await readFile(new URL('../src/WorkshopEntry.tsx', import.meta.url), 'utf8')
const calibreShell = await readFile(new URL('../src/CalibreShell.tsx', import.meta.url), 'utf8')
const businessFinanceCss = await readFile(new URL('../src/business-finance-v4.css', import.meta.url), 'utf8')
const intakeRoute = await readFile(new URL('../src/IntakeRoute.tsx', import.meta.url), 'utf8')
const settingsRouteCss = await readFile(new URL('../src/settings-route.css', import.meta.url), 'utf8')
const libraryRouteCss = await readFile(new URL('../src/library-route.css', import.meta.url), 'utf8')

const businessStyles = [
  'business-v2.css',
  'business-ledger-v2.css',
  'business-pagination.css',
]

const intakeStyles = [
  'invoice-intake.css',
  'purchase-intake.css',
]

const settingsStyles = [
  'settings-v2.css',
  'audit-history-v2.css',
  'system-health.css',
]

const libraryStyles = [
  'knowledge.css',
  'library-v2.css',
]

function assertNotEager(stylesheets) {
  for (const stylesheet of stylesheets) {
    assert.doesNotMatch(workshopEntry, new RegExp(stylesheet.replace('.', '\\.')))
  }
}

function assertCssBundleOwns(bundle, stylesheets) {
  for (const stylesheet of stylesheets) {
    assert.match(bundle, new RegExp(`@import ['"]\\./${stylesheet.replace('.', '\\.')}['"];`))
  }
}

test('Business-only styles stay out of the eager Workshop entry', () => {
  assertNotEager(businessStyles)
})

test('Business lazy CSS chunk owns the legacy Business styles', () => {
  assertCssBundleOwns(businessFinanceCss, businessStyles)
})

test('Intake-only styles stay out of the eager Workshop entry', () => {
  assertNotEager(intakeStyles)
})

test('Intake lazy route owns its Intake styles', () => {
  for (const stylesheet of intakeStyles) {
    assert.match(intakeRoute, new RegExp(`import ['"]\\./${stylesheet.replace('.', '\\.')}['"]`))
  }
})

test('Settings-only styles stay out of the eager Workshop entry', () => {
  assertNotEager(settingsStyles)
  assert.doesNotMatch(workshopEntry, /settings-route\.css/)
})

test('Settings lazy route loads one ordered style bundle', () => {
  assert.match(calibreShell, /import\(['"]\.\/settings-route\.css['"]\)/)
  assertCssBundleOwns(settingsRouteCss, settingsStyles)
})

test('Library-only styles stay out of the eager Workshop entry', () => {
  assertNotEager(libraryStyles)
  assert.doesNotMatch(workshopEntry, /library-route\.css/)
})

test('Library lazy route loads one ordered style bundle', () => {
  assert.match(calibreShell, /import\(['"]\.\/library-route\.css['"]\)/)
  assertCssBundleOwns(libraryRouteCss, libraryStyles)
})
