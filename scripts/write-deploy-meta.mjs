import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const [commit, output = 'dist/deploy-meta.json'] = process.argv.slice(2)

if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
  throw new Error('write-deploy-meta requires a full 40-character commit SHA')
}

const metadata = {
  app: 'calibre-v2',
  commit: commit.toLowerCase(),
  built_at: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY || 'samjohnmullan-create/Calibre-v2',
}

await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
console.log(`Wrote deployment fingerprint for ${metadata.commit} to ${output}`)
