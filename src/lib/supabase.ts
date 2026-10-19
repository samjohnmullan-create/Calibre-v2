import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://zmhbrqkzvgajmvhhorba.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing Calibre v2 Supabase publishable key.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Customer-facing photographs should never inherit the huge workshop originals.
const PUBLIC_IMAGE_MAX_EDGE = 1800
const PUBLIC_IMAGE_QUALITY = 0.78
const PUBLIC_IMAGE_OPTIMISE_OVER_BYTES = 900_000

// Supabase standard uploads are most reliable below 6 MB. Modern Samsung camera
// images can exceed that, which previously surfaced in Calibre as the browser's
// unhelpful "Failed to fetch" error. Keep normal workshop originals untouched,
// but make oversized camera images upload-safe before sending them.
const WORKSHOP_IMAGE_MAX_EDGE = 3000
const WORKSHOP_IMAGE_QUALITY = 0.9
const WORKSHOP_IMAGE_OPTIMISE_OVER_BYTES = 5_000_000

async function resizeImage(source: Blob, maxEdge: number, quality: number): Promise<Blob> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(source)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return source
    context.drawImage(bitmap, 0, 0, width, height)
    const optimised = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return optimised && optimised.size < source.size ? optimised : source
  } catch {
    return source
  } finally {
    bitmap?.close()
  }
}

async function optimisePublicImage(source: Blob): Promise<Blob> {
  if (!source.type.startsWith('image/') || source.size <= PUBLIC_IMAGE_OPTIMISE_OVER_BYTES) return source
  return resizeImage(source, PUBLIC_IMAGE_MAX_EDGE, PUBLIC_IMAGE_QUALITY)
}

async function optimiseWorkshopImage(source: Blob): Promise<Blob> {
  if (!source.type.startsWith('image/') || source.size <= WORKSHOP_IMAGE_OPTIMISE_OVER_BYTES) return source
  return resizeImage(source, WORKSHOP_IMAGE_MAX_EDGE, WORKSHOP_IMAGE_QUALITY)
}

function uploadContentType(body: Blob, fallback?: string) {
  return body.type || fallback || 'application/octet-stream'
}

const storageFrom = supabase.storage.from.bind(supabase.storage)
supabase.storage.from = ((bucketId: string) => {
  const bucket = storageFrom(bucketId)
  if (bucketId !== 'calibre-public' && bucketId !== 'calibre-media') return bucket

  const upload = bucket.upload.bind(bucket)
  bucket.upload = (async (path, fileBody, fileOptions) => {
    let body = fileBody
    if (fileBody instanceof Blob && fileBody.type.startsWith('image/')) {
      body = bucketId === 'calibre-public'
        ? await optimisePublicImage(fileBody)
        : await optimiseWorkshopImage(fileBody)
    }

    const options = body instanceof Blob
      ? { ...fileOptions, contentType: uploadContentType(body, fileOptions?.contentType) }
      : fileOptions

    // A transient Android/network fetch failure should not force the user to
    // reselect a photo. Retry once after a short delay; normal Supabase errors
    // are returned immediately and remain visible to the caller.
    try {
      return await upload(path, body, options)
    } catch (error) {
      if (!(error instanceof TypeError) || !/fetch|network/i.test(error.message)) throw error
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      return upload(path, body, options)
    }
  }) as typeof bucket.upload

  return bucket
}) as typeof supabase.storage.from
