import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const settings = await readFile(new URL('../src/SettingsRoute.tsx', import.meta.url), 'utf8')
const health = await readFile(new URL('../src/SystemHealthPanel.tsx', import.meta.url), 'utf8')
const pages = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')

test('Settings mounts the System Health control panel', () => {
  assert.match(settings, /import SystemHealthPanel from ['"]\.\/SystemHealthPanel['"]/)
  assert.match(settings, /<SystemHealthPanel\s+workspaceId=\{workspaceId\}\s*\/>/)
})

test('System Health verifies the live release and current browser build', () => {
  assert.match(health, /deploy-meta\.json/)
  assert.match(health, /VITE_BUILD_SHA/)
  assert.match(health, /versionMatches/)
  assert.match(health, /Production release/)
  assert.match(health, /This browser/)
})

test('System Health checks the signed-in Supabase session, database and media storage', () => {
  assert.match(health, /supabase\.auth\.getUser\(\)/)
  assert.match(health, /from\(['"]workspaces['"]\)/)
  assert.match(health, /storage\.from\(['"]calibre-media['"]\)/)
  assert.match(health, /Core system failure detected/)
})

test('workshop production builds embed their exact deployment SHA', () => {
  assert.match(pages, /VITE_BUILD_SHA:\s*\$\{\{ env\.DEPLOY_SHA \}\}/)
})
