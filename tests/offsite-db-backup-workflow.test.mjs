import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workflow = await readFile(new URL('../.github/workflows/manual-encrypted-db-backup.yml', import.meta.url), 'utf8')

test('off-site DB backup remains manual until a restore drill proves it', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /schedule:/)
})

test('backup workflow requires encrypted secrets and never embeds production credentials', () => {
  assert.match(workflow, /secrets\.CALIBRE_BACKUP_DB_URL/)
  assert.match(workflow, /secrets\.CALIBRE_BACKUP_PASSPHRASE/)
  assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\/[^\s"']+:[^$\s"']+@/)
})

test('backup workflow captures the supported recovery dump set plus migration history', () => {
  assert.match(workflow, /roles\.sql.*--role-only/)
  assert.match(workflow, /schema\.sql/)
  assert.match(workflow, /data\.sql.*--use-copy.*--data-only/)
  assert.match(workflow, /history_schema\.sql.*--schema supabase_migrations/)
  assert.match(workflow, /history_data\.sql.*--use-copy.*--data-only.*--schema supabase_migrations/)
})

test('only encrypted backup and non-sensitive metadata are uploaded', () => {
  assert.match(workflow, /calibre-db-backup-crypto\.mjs encrypt/)
  assert.match(workflow, /compression-level: 0/)
  const uploadSection = workflow.slice(workflow.indexOf('- name: Upload encrypted off-site artifact only'))
  assert.match(uploadSection, /steps\.backup\.outputs\.encrypted_path/)
  assert.match(uploadSection, /steps\.backup\.outputs\.metadata_path/)
  assert.doesNotMatch(uploadSection, /roles\.sql|schema\.sql|data\.sql|history_schema\.sql|history_data\.sql|plain\.tar\.gz/)
})

test('workflow destroys plaintext workspace and states Storage is separate', () => {
  assert.match(workflow, /rm -rf "\$work" "\$archive"/)
  assert.match(workflow, /Storage binaries are not included/)
})
