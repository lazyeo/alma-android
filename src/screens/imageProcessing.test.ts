import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RELAY_UPLOAD_BYTES,
  constrainedDimensions,
  downscaleImage,
  imageDecodeError,
  nextImageEncodingAttempt,
  relayUploadError,
  encodeCanvas,
} from './imageProcessing'

describe('image decode failures', () => {
  it('names an empty file as not yet downloaded', () => {
    expect(
      imageDecodeError({ name: 'IMG_1.jpg', type: 'image/jpeg', size: 0 }),
    ).toMatch(/IMG_1\.jpg is empty/)
  })

  it('reports the type and size of an unreadable file', () => {
    expect(
      imageDecodeError({ name: 'a.heic', type: 'image/heic', size: 2048 }),
    ).toBe('a.heic (image/heic, 2 KB) could not be read as an image.')
  })

  it('rejects an empty file before decoding', async () => {
    const file = new File([], 'cloud.jpg', { type: 'image/jpeg' })
    await expect(downscaleImage(file)).rejects.toThrow(/cloud\.jpg is empty/)
  })
})

describe('constrainedDimensions', () => {
  it('keeps small images unchanged', () => {
    expect(constrainedDimensions(1200, 800, 2048)).toEqual({
      width: 1200,
      height: 800,
    })
  })

  it('scales the longest edge to the limit', () => {
    expect(constrainedDimensions(4000, 3000, 2048)).toEqual({
      width: 2048,
      height: 1536,
    })
    expect(constrainedDimensions(1000, 4000, 2048)).toEqual({
      width: 512,
      height: 2048,
    })
  })
})

describe('relay-aware image encoding', () => {
  it('uses a conservative six MiB raw-body cap below the observed eight MiB safe upload', () => {
    expect(MAX_RELAY_UPLOAD_BYTES).toBe(6 * 1024 * 1024)
  })

  it('reduces JPEG quality before reducing dimensions', () => {
    expect(nextImageEncodingAttempt({ maxEdge: 2048, quality: 0.85 })).toEqual({
      maxEdge: 2048,
      quality: 0.72,
    })
    expect(nextImageEncodingAttempt({ maxEdge: 2048, quality: 0.58 })).toEqual({
      maxEdge: 1792,
      quality: 0.72,
    })
  })

  it('stops after the minimum practical dimensions and quality', () => {
    expect(
      nextImageEncodingAttempt({ maxEdge: 1024, quality: 0.58 }),
    ).toBeNull()
  })

  it('explains the relay-frame cap clearly', () => {
    expect(relayUploadError('archive.zip')).toContain('archive.zip')
    expect(relayUploadError('archive.zip')).toContain('6 MB')
    expect(relayUploadError('archive.zip')).toContain('single encrypted frame')
  })
})

describe('encodeCanvas', () => {
  const png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  it('prefers the synchronous data URL and decodes it to a blob', async () => {
    const toBlob = vi.fn()
    const blob = await encodeCanvas(
      { toDataURL: () => `data:image/png;base64,${png1x1}`, toBlob },
      'image/png',
    )
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(atob(png1x1).length)
    expect(toBlob).not.toHaveBeenCalled()
  })

  it('falls back to toBlob when the data URL is unusable', async () => {
    const fallback = new Blob(['x'], { type: 'image/jpeg' })
    const blob = await encodeCanvas(
      {
        toDataURL: () => 'data:,',
        toBlob: (cb: BlobCallback) => cb(fallback),
      },
      'image/jpeg',
      0.8,
    )
    expect(blob).toBe(fallback)
  })
})
