import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, open, rm, stat, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const MAGIC = Buffer.from('CALDB001')
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES
const SCRYPT_OPTIONS = { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }
const scryptAsync = promisify(scrypt)

function usage() {
  console.error('Usage: node scripts/calibre-db-backup-crypto.mjs <encrypt|decrypt> <input> <output>')
  console.error('Set CALIBRE_BACKUP_PASSPHRASE in the environment. It must be at least 24 characters.')
  process.exit(2)
}

function getPassphrase() {
  const value = process.env.CALIBRE_BACKUP_PASSPHRASE ?? ''
  if (value.length < 24) throw new Error('CALIBRE_BACKUP_PASSPHRASE must be at least 24 characters.')
  return value
}

async function deriveKey(passphrase, salt) {
  return Buffer.from(await scryptAsync(passphrase, salt, 32, SCRYPT_OPTIONS))
}

async function ensureOutputAbsent(path) {
  try {
    await stat(path)
    throw new Error(`Refusing to overwrite existing output: ${path}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function encrypt(input, output, passphrase) {
  await ensureOutputAbsent(output)
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  await writeFile(output, Buffer.concat([MAGIC, salt, iv]), { flag: 'wx', mode: 0o600 })
  try {
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(output, { flags: 'a', mode: 0o600 }),
    )
    await appendFile(output, cipher.getAuthTag())
  } catch (error) {
    await rm(output, { force: true })
    throw error
  } finally {
    key.fill(0)
  }
}

async function readHeaderAndTag(input) {
  const info = await stat(input)
  if (info.size <= HEADER_BYTES + TAG_BYTES) throw new Error('Encrypted backup is too short to be valid.')

  const handle = await open(input, 'r')
  try {
    const header = Buffer.alloc(HEADER_BYTES)
    await handle.read(header, 0, header.length, 0)
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Calibre database backup or unsupported format version.')

    const saltStart = MAGIC.length
    const ivStart = saltStart + SALT_BYTES
    const salt = header.subarray(saltStart, ivStart)
    const iv = header.subarray(ivStart, HEADER_BYTES)
    const tag = Buffer.alloc(TAG_BYTES)
    await handle.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES)
    return { size: info.size, salt, iv, tag }
  } finally {
    await handle.close()
  }
}

async function decrypt(input, output, passphrase) {
  await ensureOutputAbsent(output)
  const { size, salt, iv, tag } = await readHeaderAndTag(input)
  const key = await deriveKey(passphrase, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  try {
    await pipeline(
      createReadStream(input, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(output, { flags: 'wx', mode: 0o600 }),
    )
  } catch (error) {
    await rm(output, { force: true })
    throw new Error(`Backup decryption/authentication failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    key.fill(0)
  }
}

const [command, input, output] = process.argv.slice(2)
if (!['encrypt', 'decrypt'].includes(command) || !input || !output) usage()

const passphrase = getPassphrase()
if (command === 'encrypt') await encrypt(input, output, passphrase)
else await decrypt(input, output, passphrase)
