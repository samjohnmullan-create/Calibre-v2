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
const warnings = []
const seenFullVersions = new Set()
const legacyVersions = new Map()

for (const filename of entries) {
  const match = filename.match(/^(\d{8}|\d{14})_([a-z0-9_]+)\.sql$/)
  if (!match) {
    errors.push(`${filename}: expected <YYYYMMDD|YYYYMMDDHHMMSS>_snake_case.sql`)
    continue
  }

  const [, version] = match
  const body = (await readFile(join(migrationDir.pathname, filename), 'utf8')).trim()
  if (!body) errors.push(`${filename}: migration is empty`)

  if (version.length === 14) {
    if (seenFullVersions.has(version)) errors.push(`${filename}: duplicate 14-digit migration version ${version}`)
    seenFullVersions.add(version)
  } else {
    const list = legacyVersions.get(version) ?? []
    list.push(filename)
    legacyVersions.set(version, list)
  }
}

// Calibre's early migrations were committed with date-only prefixes and were
// applied through the managed database tooling rather than Supabase CLI db push.
// Preserve them as historical records, but all new migrations must use a unique
// 14-digit timestamp so future CLI history is unambiguous.
for (const [version, files] of legacyVersions) {
  if (files.length > 1) {
    warnings.push(`${version}: ${files.length} legacy date-prefixed migrations share this version`)
  }
}

const newestLegacy = [...legacyVersions.keys()].sort().at(-1)
const newestFull = [...seenFullVersions].sort().at(-1)

console.log(`Migration audit: ${entries.length} SQL files`)
if (newestLegacy) console.log(`Legacy history through: ${newestLegacy}`)
if (newestFull) console.log(`Newest CLI-safe migration: ${newestFull}`)

for (const warning of warnings) console.warn(`WARNING: ${warning}`)

if (errors.length) {
  console.error('\nMigration integrity check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Migration integrity check passed.')
