import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workshopEntry = await readFile(new URL('../src/WorkshopEntry.tsx', import.meta.url), 'utf8')
const workshopShellCss = await readFile(new URL('../src/workshop-shell.css', import.meta.url), 'utf8')
const calibreShell = await readFile(new URL('../src/CalibreShell.tsx', import.meta.url), 'utf8')
const businessFinanceCss = await readFile(new URL('../src/business-finance-v4.css', import.meta.url), 'utf8')
const intakeRoute = await readFile(new URL('../src/IntakeRoute.tsx', import.meta.url), 'utf8')
const settingsRouteCss = await readFile(new URL('../src/settings-route.css', import.meta.url), 'utf8')
const libraryRouteCss = await readFile(new URL('../src/library-route.css', import.meta.url), 'utf8')

const eagerStyles = `${workshopEntry}\n${workshopShellCss}`

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
    assert.doesNotMatch(eagerStyles, new RegExp(stylesheet.replace('.', '\\.')))
  }
}

function assertCssBundleOwns(bundle, stylesheets) {
  for (const stylesheet of stylesheets) {
    assert.match(bundle, new RegExp(`@import ['"]\\./${stylesheet.replace('.', '\\.')}['"];`))
  }
}

test('Workshop entry uses one explicit eager CSS manifest', () => {
  const cssImports = [...workshopEntry.matchAll(/import ['"](\.\/.+\.css)['"]/g)].map((match) => match[1])
  assert.deepEqual(cssImports, ['./workshop-shell.css'])
})

test('eager Workshop correction order stays explicit', () => {
  const base = workshopShellCss.indexOf("@import './styles.css';")
  const mobileAcceptance = workshopShellCss.indexOf("@import './mobile-acceptance-v2.css';")
  const mobileUi = workshopShellCss.indexOf("@import './mobile-ui-v3.css';")
  const visualSystem = workshopShellCss.indexOf("@import './workshop-visual-system.css';")
  assert.ok(base >= 0 && mobileAcceptance > base && mobileUi > mobileAcceptance && visualSystem > mobileUi)
})

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
  assert.doesNotMatch(eagerStyles, /settings-route\.css/)
})

test('Settings lazy route loads one ordered style bundle', () => {
  assert.match(calibreShell, /import\(['"]\.\/settings-route\.css['"]\)/)
  assertCssBundleOwns(settingsRouteCss, settingsStyles)
})

test('Library-only styles stay out of the eager Workshop entry', () => {
  assertNotEager(libraryStyles)
  assert.doesNotMatch(eagerStyles, /library-route\.css/)
})

test('Library lazy route loads one ordered style bundle', () => {
  assert.match(calibreShell, /import\(['"]\.\/library-route\.css['"]\)/)
  assertCssBundleOwns(libraryRouteCss, libraryStyles)
})
