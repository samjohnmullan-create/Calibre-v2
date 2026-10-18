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
// Keep calibre-media untouched; only files copied/uploaded to calibre-public are
// resized and compressed before they leave the browser.
const PUBLIC_IMAGE_MAX_EDGE = 1800
const PUBLIC_IMAGE_QUALITY = 0.78
const PUBLIC_IMAGE_OPTIMISE_OVER_BYTES = 900_000

async function optimisePublicImage(source: Blob): Promise<Blob> {
  if (!source.type.startsWith('image/') || source.size <= PUBLIC_IMAGE_OPTIMISE_OVER_BYTES) return source

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(source)
    const scale = Math.min(1, PUBLIC_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return source

    context.drawImage(bitmap, 0, 0, width, height)
    const optimised = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', PUBLIC_IMAGE_QUALITY)
    })

    // Never replace an original with a failed conversion or a larger derivative.
    return optimised && optimised.size < source.size ? optimised : source
  } catch {
    // Publishing must still work on browsers that cannot decode a particular image.
    return source
  } finally {
    bitmap?.close()
  }
}

const storageFrom = supabase.storage.from.bind(supabase.storage)
supabase.storage.from = ((bucketId: string) => {
  const bucket = storageFrom(bucketId)
  if (bucketId !== 'calibre-public') return bucket

  const upload = bucket.upload.bind(bucket)
  bucket.upload = (async (path, fileBody, fileOptions) => {
    if (fileBody instanceof Blob && fileBody.type.startsWith('image/')) {
      const optimised = await optimisePublicImage(fileBody)
      if (optimised !== fileBody) {
        return upload(path, optimised, { ...fileOptions, contentType: optimised.type })
      }
    }
    return upload(path, fileBody, fileOptions)
  }) as typeof bucket.upload

  return bucket
}) as typeof supabase.storage.from
