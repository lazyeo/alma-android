import { expect, it } from 'vitest'
import { previewKind, previewMime } from './filePreview'
it('classifies media and SVG, including generic relay MIME types', () => {
  expect(previewKind('clip.MP4', 'application/octet-stream')).toBe('video')
  expect(previewKind('song.mp3', 'application/octet-stream')).toBe('audio')
  expect(previewKind('drawing.svg', 'text/plain')).toBe('svg')
  expect(previewKind('unknown', 'audio/flac')).toBe('audio')
  expect(previewKind('unknown', 'application/octet-stream')).toBe('none')
  expect(previewMime('clip.mp4', 'application/octet-stream')).toBe('video/mp4')
  expect(previewMime('drawing.svg', 'text/plain')).toBe('image/svg+xml')
})

import { previewPolicy } from './filePreview'
it('bounds each renderer and returns a typed fallback at the exact byte boundary', () => {
  expect(previewPolicy('a.pdf', 'application/pdf', 20 * 1024 * 1024)).toEqual({
    status: 'ready',
    kind: 'pdf',
  })
  expect(
    previewPolicy('a.pdf', 'application/pdf', 20 * 1024 * 1024 + 1),
  ).toEqual({ status: 'too-large', kind: 'pdf', limit: 20 * 1024 * 1024 })
  expect(previewPolicy('a.svg', 'image/svg+xml', 2 * 1024 * 1024).status).toBe(
    'too-large',
  )
  expect(previewPolicy('a.mp4', 'video/mp4', 50 * 1024 * 1024).status).toBe(
    'ready',
  )
  expect(previewPolicy('a.bin', 'application/octet-stream', 1).status).toBe(
    'unsupported',
  )
})
