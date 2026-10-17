import { supabase } from './lib/supabase'

type ArchiveProgress = (message: string) => void
type StorageSourceKind = 'media' | 'thumbnail' | 'invoice' | 'library_document' | 'public_image' | 'public_document'

type StorageReference = {
  bucket: string
  path: string
  source_kind: StorageSourceKind
  original_filename: string
  mime_type: string
  declared_size: number | null
}

type MediaReferenceRow = {
  storage_path: string
  thumbnail_path: string
  original_filename: string
  mime_type: string
  byte_size: number | null
}

type InvoiceReferenceRow = {
  storage_path: string
  original_filename: string
  mime_type: string
  byte_size: number | null
}

type LibraryReferenceRow = {
  title: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  file_size_bytes: number | null
}

type PublicationReferenceRow = {
  public_title: string
  hero_image_url: string
  gallery_urls: string[] | null
  passport_pdf_url: string
  certificate_pdf_url: string
}

const privateBucket = 'calibre-media'
const publicBucket = 'calibre-public'
const batchSize = 500
const textEncoder = new TextEncoder()

function safeTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
}

async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesFit(value: string, max: number) {
  return textEncoder.encode(value).length <= max
}

function splitTarPath(path: string) {
  if (bytesFit(path, 100)) return { name: path, prefix: '' }
  const slashPositions = [...path.matchAll(/\//g)].map((match) => match.index ?? -1).filter((index) => index > 0).reverse()
  for (const index of slashPositions) {
    const prefix = path.slice(0, index)
    const name = path.slice(index + 1)
    if (bytesFit(prefix, 155) && bytesFit(name, 100)) return { name, prefix }
  }
  throw new Error(`Storage path is too long for the portable TAR archive: ${path}`)
}

function safeStoragePath(value: string) {
  const path = value.trim().replace(/^\/+/, '')
  if (!path) return ''
  if (path.split('/').some((part) => part === '..' || part === '.')) throw new Error(`Unsafe Storage path cannot be archived: ${value}`)
  return path
}

function safeBucket(value: string) {
  const bucket = value.trim()
  if (!bucket) return ''
  if (!/^[A-Za-z0-9._-]+$/.test(bucket)) throw new Error(`Unsafe Storage bucket cannot be archived: ${value}`)
  return bucket
}

function writeText(target: Uint8Array, offset: number, length: number, value: string) {
  const bytes = textEncoder.encode(value)
  if (bytes.length > length) throw new Error(`TAR field is too long: ${value}`)
  target.set(bytes, offset)
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number) {
  const encoded = Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, '0') + '\0'
  writeText(target, offset, length, encoded)
}

function tarHeader(path: string, size: number, modifiedAt = new Date()) {
  const { name, prefix } = splitTarPath(path)
  const header = new Uint8Array(512)
  writeText(header, 0, 100, name)
  writeOctal(header, 100, 8, 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, Math.floor(modifiedAt.getTime() / 1000))
  header.fill(32, 148, 156)
  header[156] = '0'.charCodeAt(0)
  writeText(header, 257, 6, 'ustar\0')
  writeText(header, 263, 2, '00')
  writeText(header, 265, 32, 'calibre')
  writeText(header, 297, 32, 'calibre')
  if (prefix) writeText(header, 345, 155, prefix)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  const checksumText = checksum.toString(8).padStart(6, '0')
  writeText(header, 148, 6, checksumText)
  header[154] = 0
  header[155] = 32
  return header
}

function tarPadding(size: number) {
  const remainder = size % 512
  return remainder === 0 ? null : new Uint8Array(512 - remainder)
}

async function readAllRows<T>(table: string, workspaceId: string, columns: string) {
  const rows: T[] = []
  let offset = 0
  while (true) {
    const result = await supabase
      .from(table)
      .select(columns)
      .eq('workspace_id', workspaceId)
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)
    if (result.error) throw new Error(`${table}: ${result.error.message}`)
    const page = (result.data ?? []) as T[]
    rows.push(...page)
    if (page.length < batchSize) break
    offset += batchSize
  }
  return rows
}

function publicStoragePath(value: string, bucket: string) {
  if (!value.trim()) return ''
  try {
    const url = new URL(value)
    const marker = `/storage/v1/object/public/${bucket}/`
    const index = url.pathname.indexOf(marker)
    if (index < 0) return ''
    return safeStoragePath(decodeURIComponent(url.pathname.slice(index + marker.length)))
  } catch {
    return ''
  }
}

function filenameFromPath(path: string) {
  return path.split('/').filter(Boolean).pop() || path
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportWorkspaceStorageArchive({
  workspaceId,
  workspaceName,
  onProgress,
}: {
  workspaceId: string
  workspaceName: string
  onProgress: ArchiveProgress
}) {
  onProgress('Reading Storage references…')
  const [mediaRows, invoiceRows, libraryRows, publicationRows] = await Promise.all([
    readAllRows<MediaReferenceRow>('media_assets', workspaceId, 'id,storage_path,thumbnail_path,original_filename,mime_type,byte_size'),
    readAllRows<InvoiceReferenceRow>('acquisition_invoices', workspaceId, 'id,storage_path,original_filename,mime_type,byte_size'),
    readAllRows<LibraryReferenceRow>('knowledge_technical_documents', workspaceId, 'id,title,storage_bucket,storage_path,mime_type,file_size_bytes'),
    readAllRows<PublicationReferenceRow>('customer_publications', workspaceId, 'id,public_title,hero_image_url,gallery_urls,passport_pdf_url,certificate_pdf_url'),
  ])

  const byPath = new Map<string, StorageReference>()
  function addReference(reference: StorageReference) {
    const bucket = safeBucket(reference.bucket)
    const path = safeStoragePath(reference.path)
    if (!bucket || !path) return
    const key = `${bucket}:${path}`
    if (!byPath.has(key)) byPath.set(key, { ...reference, bucket, path })
  }

  for (const row of mediaRows) {
    if (row.storage_path) addReference({
      bucket: privateBucket,
      path: row.storage_path,
      source_kind: 'media',
      original_filename: row.original_filename || '',
      mime_type: row.mime_type || '',
      declared_size: row.byte_size == null ? null : Number(row.byte_size),
    })
    if (row.thumbnail_path) addReference({
      bucket: privateBucket,
      path: row.thumbnail_path,
      source_kind: 'thumbnail',
      original_filename: row.original_filename || '',
      mime_type: row.mime_type || '',
      declared_size: null,
    })
  }

  for (const row of invoiceRows) {
    if (row.storage_path) addReference({
      bucket: privateBucket,
      path: row.storage_path,
      source_kind: 'invoice',
      original_filename: row.original_filename || '',
      mime_type: row.mime_type || '',
      declared_size: row.byte_size == null ? null : Number(row.byte_size),
    })
  }

  for (const row of libraryRows) {
    if (row.storage_bucket && row.storage_path) addReference({
      bucket: row.storage_bucket,
      path: row.storage_path,
      source_kind: 'library_document',
      original_filename: row.title || filenameFromPath(row.storage_path),
      mime_type: row.mime_type || '',
      declared_size: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
    })
  }

  for (const row of publicationRows) {
    const imageUrls = [row.hero_image_url, ...(row.gallery_urls ?? [])].filter(Boolean)
    for (const value of imageUrls) {
      const path = publicStoragePath(value, publicBucket)
      if (path) addReference({
        bucket: publicBucket,
        path,
        source_kind: 'public_image',
        original_filename: filenameFromPath(path),
        mime_type: '',
        declared_size: null,
      })
    }
    for (const value of [row.passport_pdf_url, row.certificate_pdf_url].filter(Boolean)) {
      const path = publicStoragePath(value, publicBucket)
      if (path) addReference({
        bucket: publicBucket,
        path,
        source_kind: 'public_document',
        original_filename: filenameFromPath(path),
        mime_type: 'application/pdf',
        declared_size: null,
      })
    }
  }

  const references = [...byPath.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path))
  const archiveParts: BlobPart[] = []
  const manifestFiles: Array<StorageReference & { size: number; sha256: string }> = []
  let totalBytes = 0

  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index]
    onProgress(`Downloading ${index + 1} of ${references.length}: ${reference.original_filename || filenameFromPath(reference.path)}`)
    const result = await supabase.storage.from(reference.bucket).download(reference.path)
    if (result.error || !result.data) throw new Error(`Could not download ${reference.bucket}/${reference.path}: ${result.error?.message ?? 'No file returned.'}`)
    const blob = result.data
    if (reference.declared_size != null && reference.declared_size > 0 && reference.declared_size !== blob.size) {
      throw new Error(`Size check failed for ${reference.bucket}/${reference.path}: expected ${reference.declared_size} bytes, received ${blob.size}.`)
    }
    const checksum = await sha256Blob(blob)
    const archivePath = `${reference.bucket}/${reference.path}`
    archiveParts.push(tarHeader(archivePath, blob.size), blob)
    const padding = tarPadding(blob.size)
    if (padding) archiveParts.push(padding)
    manifestFiles.push({ ...reference, size: blob.size, sha256: checksum })
    totalBytes += blob.size
  }

  const exportedAt = new Date().toISOString()
  const buckets = [...new Set(manifestFiles.map((file) => file.bucket))].sort()
  const manifest = {
    calibre_storage_archive_version: '2.0',
    archive_kind: 'workspace_storage_backup',
    exported_at: exportedAt,
    workspace: { id: workspaceId, name: workspaceName },
    buckets,
    file_count: manifestFiles.length,
    total_bytes: totalBytes,
    discovery_sources: ['media_assets', 'acquisition_invoices', 'knowledge_technical_documents', 'customer_publications'],
    integrity: { algorithm: 'SHA-256', scope: 'each binary file' },
    files: manifestFiles,
  }
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  archiveParts.push(tarHeader('calibre-storage-manifest.json', manifestBlob.size), manifestBlob)
  const manifestPadding = tarPadding(manifestBlob.size)
  if (manifestPadding) archiveParts.push(manifestPadding)
  archiveParts.push(new Uint8Array(1024))

  onProgress('Building portable TAR archive…')
  const archive = new Blob(archiveParts, { type: 'application/x-tar' })
  downloadBlob(archive, `calibre-storage-backup-${safeTimestamp()}.tar`)
  return { exportedAt, fileCount: manifestFiles.length, totalBytes, archiveBytes: archive.size, buckets }
}
