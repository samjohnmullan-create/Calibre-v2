import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const verify = await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8')
const pages = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')
const customer = await readFile(new URL('../.github/workflows/deploy-customer-cpanel.yml', import.meta.url), 'utf8')

test('verification uses the committed dependency lock and canonical verify command', () => {
  assert.match(verify, /npm ci --no-audit --no-fund/)
  assert.match(verify, /npm run verify/)
  assert.doesNotMatch(verify, /npm install --no-audit --no-fund/)
})

for (const [name, workflow] of [['Calibre app', pages], ['customer site', customer]]) {
  test(`${name} deployment waits for successful main verification`, () => {
    assert.match(workflow, /workflow_run:/)
    assert.match(workflow, /workflows:\s*\["Verify Calibre v2"\]/)
    assert.match(workflow, /workflow_run\.conclusion == 'success'/)
    assert.match(workflow, /workflow_run\.head_branch == 'main'/)
    assert.match(workflow, /workflow_run\.head_sha/)
    assert.match(workflow, /npm ci --no-audit --no-fund/)
    assert.doesNotMatch(workflow, /\n\s*push:\s*\n\s*branches:\s*\[main\]/)
  })
}

test('manual deploys run full verification before publication', () => {
  for (const workflow of [pages, customer]) {
    assert.match(workflow, /Verify manual deployment[\s\S]*npm run verify/)
  }
})
