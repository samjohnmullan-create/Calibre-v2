import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const script = new URL('../scripts/calibre-db-backup-crypto.mjs', import.meta.url).pathname
const passphrase = 'foundation-test-passphrase-that-is-long-enough'

function run(command, input, output, secret = passphrase) {
  return spawnSync(process.execPath, [script, command, input, output], {
    encoding: 'utf8',
    env: { ...process.env, CALIBRE_BACKUP_PASSPHRASE: secret },
  })
}

test('Calibre DB backup crypto round-trips bytes and rejects tampering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'calibre-db-backup-'))
  try {
    const source = join(dir, 'source.tar.gz')
    const encrypted = join(dir, 'source.calibrebackup')
    const restored = join(dir, 'restored.tar.gz')
    const tampered = join(dir, 'tampered.calibrebackup')
    const rejected = join(dir, 'rejected.tar.gz')
    const original = randomBytes(128 * 1024)
    await writeFile(source, original)

    const encryptResult = run('encrypt', source, encrypted)
    assert.equal(encryptResult.status, 0, encryptResult.stderr)

    const decryptResult = run('decrypt', encrypted, restored)
    assert.equal(decryptResult.status, 0, decryptResult.stderr)
    assert.deepEqual(await readFile(restored), original)

    const damaged = await readFile(encrypted)
    damaged[Math.floor(damaged.length / 2)] ^= 0x01
    await writeFile(tampered, damaged)

    const tamperResult = run('decrypt', tampered, rejected)
    assert.notEqual(tamperResult.status, 0, 'tampered ciphertext must fail authentication')
    await assert.rejects(readFile(rejected), { code: 'ENOENT' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Calibre DB backup crypto refuses weak passphrases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'calibre-db-backup-short-'))
  try {
    const source = join(dir, 'source')
    const encrypted = join(dir, 'encrypted')
    await writeFile(source, 'test')
    const result = run('encrypt', source, encrypted, 'too-short')
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /at least 24 characters/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
