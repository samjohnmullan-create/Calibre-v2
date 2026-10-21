import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const assetsDir = path.resolve('dist/assets')
const files = await readdir(assetsDir)

const budgets = [
  { label: 'Workshop startup JavaScript', pattern: /^WorkshopEntry-.*\.js$/, raw: 100_000, gzip: 25_000 },
  { label: 'Workshop startup CSS', pattern: /^WorkshopEntry-.*\.css$/, raw: 220_000, gzip: 40_000 },
  { label: 'Customer Pack JavaScript', pattern: /^CustomerPackHost-.*\.js$/, raw: 80_000, gzip: 25_000 },
]

function kb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`
}

let failed = false

for (const budget of budgets) {
  const matches = files.filter((file) => budget.pattern.test(file))
  if (matches.length !== 1) {
    console.error(`✗ ${budget.label}: expected exactly one matching asset, found ${matches.length}`)
    failed = true
    continue
  }

  const filename = matches[0]
  const body = await readFile(path.join(assetsDir, filename))
  const rawBytes = body.byteLength
  const gzipBytes = gzipSync(body).byteLength
  const rawOk = rawBytes <= budget.raw
  const gzipOk = gzipBytes <= budget.gzip

  console.log(`${rawOk && gzipOk ? '✓' : '✗'} ${budget.label}: ${kb(rawBytes)} raw / ${kb(gzipBytes)} gzip · budget ${kb(budget.raw)} raw / ${kb(budget.gzip)} gzip`)

  if (!rawOk || !gzipOk) failed = true
}

if (failed) {
  throw new Error('Calibre bundle budget exceeded. Split or defer non-critical startup code/styles before merging.')
}
