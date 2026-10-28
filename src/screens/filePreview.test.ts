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
