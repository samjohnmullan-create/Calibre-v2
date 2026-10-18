import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationDir = new URL('../supabase/migrations/', import.meta.url)
const entries = (await readdir(migrationDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name)
  .sort()

if (entries.length === 0) {
  throw new Error('No Supabase migrations found.')
}

const errors = []
const seenVersions = new Set()

for (const filename of entries) {
  const match = filename.match(/^(\d{14})_([a-z0-9_]+)\.sql$/)
  if (!match) {
    errors.push(`${filename}: executable migrations must use <YYYYMMDDHHMMSS>_snake_case.sql`)
    continue
  }

  const [, version] = match
  const body = (await readFile(join(migrationDir.pathname, filename), 'utf8')).trim()
  if (!body) errors.push(`${filename}: migration is empty`)

  if (seenVersions.has(version)) {
    errors.push(`${filename}: duplicate migration version ${version}`)
  }
  seenVersions.add(version)
}

const newest = [...seenVersions].sort().at(-1)

console.log(`Migration audit: ${entries.length} executable SQL files`)
if (newest) console.log(`Newest migration: ${newest}`)

if (errors.length) {
  console.error('\nMigration integrity check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Migration integrity check passed: every executable migration has a unique 14-digit timestamp.')
