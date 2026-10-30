import { t } from '../i18n/runtime'
import { MAX_RELAY_UPLOAD_BYTES } from '../relay'

export { MAX_RELAY_UPLOAD_BYTES }

export interface ImageEncodingAttempt {
  maxEdge: number
  quality: number
}

const IMAGE_QUALITIES = [0.85, 0.72, 0.58]
const IMAGE_MAX_EDGES = [2048, 1792, 1536, 1280, 1024]

export function relayUploadError(filename: string) {
  return t('composer.attachments.tooLarge', { name: filename })
}

export function nextImageEncodingAttempt({
  maxEdge,
  quality,
}: ImageEncodingAttempt): ImageEncodingAttempt | null {
  const qualityIndex = IMAGE_QUALITIES.indexOf(quality)
  if (qualityIndex >= 0 && qualityIndex < IMAGE_QUALITIES.length - 1) {
    return { maxEdge, quality: IMAGE_QUALITIES[qualityIndex + 1] }
  }

  const edgeIndex = IMAGE_MAX_EDGES.indexOf(maxEdge)
  if (edgeIndex < 0 || edgeIndex >= IMAGE_MAX_EDGES.length - 1) return null
  return {
    maxEdge: IMAGE_MAX_EDGES[edgeIndex + 1],
    quality: IMAGE_QUALITIES[1],
  }
}

export function constrainedDimensions(
  width: number,
  height: number,
  maxEdge = 2048,
) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mediaType: 'image/jpeg' | 'image/png',
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('Could not encode image')),
      mediaType,
      quality,
    ),
  )
}

export async function encodeImageCanvas(
  source: HTMLCanvasElement,
  options: {
    preserveAlpha?: boolean
    byteLimit?: number
    maxEdge?: number
  } = {},
): Promise<Blob> {
  const byteLimit = options.byteLimit ?? MAX_RELAY_UPLOAD_BYTES
  const limit = Math.min(options.maxEdge ?? 2200, 2200)
  const mediaType = options.preserveAlpha ? 'image/png' : 'image/jpeg'
  let attempt: ImageEncodingAttempt | null = options.preserveAlpha
    ? { maxEdge: limit, quality: 1 }
    : {
        maxEdge: Math.min(limit, IMAGE_MAX_EDGES[0]),
        quality: IMAGE_QUALITIES[0],
      }
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is unavailable')
  while (attempt) {
    const size = constrainedDimensions(
      source.width,
      source.height,
      attempt.maxEdge,
    )
    canvas.width = size.width
    canvas.height = size.height
    context.clearRect(0, 0, size.width, size.height)
    context.drawImage(source, 0, 0, size.width, size.height)
    const blob = await encodeCanvas(
      canvas,
      mediaType,
      mediaType === 'image/jpeg' ? attempt.quality : undefined,
    )
    if (blob.size <= byteLimit) return blob
    if (options.preserveAlpha) {
      const nextEdge = Math.round(attempt.maxEdge * 0.8)
      attempt = nextEdge >= 640 ? { maxEdge: nextEdge, quality: 1 } : null
    } else attempt = nextImageEncodingAttempt(attempt)
  }
  throw new Error(relayUploadError('Image'))
}

/** Formats every model accepts as-is, so they can bypass re-encoding. */
const PASSTHROUGH_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export function imageDecodeError(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (file.size === 0)
    return `${file.name} is empty. If it is a cloud photo, open it in Gallery once so it downloads, then try again.`
  const kind = file.type || 'unknown type'
  return `${file.name} (${kind}, ${Math.round(file.size / 1024)} KB) could not be read as an image.`
}

function loadImageElement(file: File) {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  return image
    .decode()
    .then(() => image)
    .finally(() => URL.revokeObjectURL(url))
}

/**
 * createImageBitmap is the fast path; an <img> decode covers the files it
 * rejects but the regular image pipeline still renders.
 */
async function decodeImage(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file)
  } catch {
    return loadImageElement(file)
  }
}

export async function downscaleImage(
  file: File,
  byteLimit = MAX_RELAY_UPLOAD_BYTES,
): Promise<{ bytes: Uint8Array; mediaType: string; previewUrl: string }> {
  if (file.size === 0) throw new Error(imageDecodeError(file))
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await decodeImage(file)
  } catch {
    // Undecodable here, but small and in a common format: let the desktop
    // and model read the original instead of failing the send.
    if (PASSTHROUGH_TYPES.has(file.type) && file.size <= byteLimit) {
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType: file.type,
        previewUrl: URL.createObjectURL(file),
      }
    }
    throw new Error(imageDecodeError(file))
  }
  const release = () => {
    if ('close' in bitmap) bitmap.close()
  }
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    release()
    throw new Error('Image processing is unavailable')
  }

  let attempt: ImageEncodingAttempt | null = {
    maxEdge: IMAGE_MAX_EDGES[0],
    quality: IMAGE_QUALITIES[0],
  }
  try {
    while (attempt) {
      const size = constrainedDimensions(
        bitmap.width,
        bitmap.height,
        attempt.maxEdge,
      )
      canvas.width = size.width
      canvas.height = size.height
      context.drawImage(bitmap, 0, 0, size.width, size.height)
      const blob = await encodeCanvas(canvas, 'image/jpeg', attempt.quality)
      if (blob.size <= byteLimit) {
        return {
          bytes: new Uint8Array(await blob.arrayBuffer()),
          mediaType: 'image/jpeg',
          previewUrl: URL.createObjectURL(blob),
        }
      }
      attempt = nextImageEncodingAttempt(attempt)
    }
  } finally {
    release()
  }

  throw new Error(relayUploadError(file.name))
}
