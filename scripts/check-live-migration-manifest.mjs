import { readdir, readFile } from 'node:fs/promises'

const migrationDir = new URL('../supabase/migrations/', import.meta.url)
const manifestFile = new URL('../supabase/migration-history/live-applied-manifest.txt', import.meta.url)

const active = new Set(
  (await readdir(migrationDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name),
)

const liveApplied = (await readFile(manifestFile, 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const missing = liveApplied.filter((filename) => !active.has(filename))

console.log(`Live applied manifest: ${liveApplied.length} migrations`)
console.log(`Repository executable migrations: ${active.size}`)

if (missing.length) {
  console.error(`\nRepository is missing ${missing.length} migration(s) already applied in production:`)
  for (const filename of missing) console.error(`- ${filename}`)
  process.exit(1)
}

console.log('Live migration manifest check passed: every recorded production migration is represented in the executable repository chain.')
