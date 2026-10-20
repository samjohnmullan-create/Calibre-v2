import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workshopEntry = await readFile(new URL('../src/WorkshopEntry.tsx', import.meta.url), 'utf8')
const businessFinanceCss = await readFile(new URL('../src/business-finance-v4.css', import.meta.url), 'utf8')
const intakeRoute = await readFile(new URL('../src/IntakeRoute.tsx', import.meta.url), 'utf8')

const businessStyles = [
  'business-v2.css',
  'business-ledger-v2.css',
  'business-pagination.css',
]

const intakeStyles = [
  'invoice-intake.css',
  'purchase-intake.css',
]

test('Business-only styles stay out of the eager Workshop entry', () => {
  for (const stylesheet of businessStyles) {
    assert.doesNotMatch(workshopEntry, new RegExp(stylesheet.replace('.', '\\.')))
  }
})

test('Business lazy CSS chunk owns the legacy Business styles', () => {
  for (const stylesheet of businessStyles) {
    assert.match(businessFinanceCss, new RegExp(`@import ['"]\\./${stylesheet.replace('.', '\\.')}['"];`))
  }
})

test('Intake-only styles stay out of the eager Workshop entry', () => {
  for (const stylesheet of intakeStyles) {
    assert.doesNotMatch(workshopEntry, new RegExp(stylesheet.replace('.', '\\.')))
  }
})

test('Intake lazy route owns its Intake styles', () => {
  for (const stylesheet of intakeStyles) {
    assert.match(intakeRoute, new RegExp(`import ['"]\\./${stylesheet.replace('.', '\\.')}['"]`))
  }
})
