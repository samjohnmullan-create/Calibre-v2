import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workbenchPhone = await readFile(new URL('../src/workbench-mobile-phase2.css', import.meta.url), 'utf8')
const itemWorkspace = await readFile(new URL('../src/item-workspace-v2.css', import.meta.url), 'utf8')
const finalPhone = await readFile(new URL('../src/mobile-ui-v3.css', import.meta.url), 'utf8')

test('final phone layer owns Workbench control positioning and visual reset', () => {
  assert.match(finalPhone, /\.workbench-v2-controls\s*\{\s*position: static;/)
  assert.match(finalPhone, /backdrop-filter: none;/)
  assert.doesNotMatch(workbenchPhone, /\.workbench-v2-controls\s*\{[^}]*position: sticky;/s)
  assert.doesNotMatch(workbenchPhone, /backdrop-filter: blur\(12px\)/)
  assert.doesNotMatch(workbenchPhone, /-webkit-backdrop-filter: blur\(12px\)/)
})

test('final phone layer owns shared Workbench sizing instead of phase2 duplication', () => {
  assert.match(finalPhone, /\.workbench-v2-page[\s\S]*width: calc\(100% - 2 \* var\(--calibre-phone-gutter\)\) !important;/)
  assert.doesNotMatch(workbenchPhone, /\.workbench-v2-page\s*\{[^}]*padding:/s)
  assert.doesNotMatch(workbenchPhone, /\.workbench-v2-heading h1\s*\{/)
  assert.doesNotMatch(workbenchPhone, /\.workbench-v2-list\s*\{[^}]*background:/s)
})

test('Item workspace leaves phone page sizing to the final correction layer', () => {
  const mobileItemBlock = itemWorkspace.slice(itemWorkspace.indexOf('@media (max-width: 720px)'))
  assert.doesNotMatch(mobileItemBlock, /\.item-v2-page\s*\{/)
  assert.match(finalPhone, /\.item-v2-page[\s\S]*padding-bottom: 24px !important;/)
  assert.match(mobileItemBlock, /\.item-v2-title-row \{ flex-direction: column; \}/)
  assert.match(mobileItemBlock, /\.item-v2-hero-card, \.item-v2-callout \{ align-items: stretch; flex-direction: column; \}/)
})
