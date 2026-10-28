import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import {
  clampGalleryIndex,
  extractThreadImages,
  gallerySwipeTarget,
  thumbnailScrollLeft,
} from './galleryModel'

const row = (
  id: string,
  role: string,
  parts: MessageRow['message']['parts'],
): MessageRow => ({
  id,
  threadId: 'thread',
  message: { id, role, parts },
})

describe('image gallery logic', () => {
  it('extracts image parts and image attachments in message order', () => {
    const rows = [
      row('one', 'user', [
        { type: 'text', text: 'hello' },
        { type: 'image', url: '/api/gallery/cache/one', filename: 'one.png' },
      ]),
      row('two', 'assistant', [
        {
          type: 'file',
          url: '/api/gallery/cache/two',
          filename: 'two.jpg',
          mediaType: 'image/jpeg',
        },
        { type: 'file', url: '/api/files/notes', filename: 'notes.txt' },
      ]),
    ]

    expect(extractThreadImages(rows)).toEqual([
      { source: '/api/gallery/cache/one', name: 'one.png' },
      { source: '/api/gallery/cache/two', name: 'two.jpg' },
    ])
  })

  it('clamps indices and commits horizontal swipes by distance or velocity', () => {
    expect(clampGalleryIndex(-2, 3)).toBe(0)
    expect(clampGalleryIndex(8, 3)).toBe(2)
    expect(gallerySwipeTarget(1, -90, 0.1, 3, 400)).toBe(2)
    expect(gallerySwipeTarget(1, 20, 0.8, 3, 400)).toBe(0)
    expect(gallerySwipeTarget(1, -20, 0.1, 3, 400)).toBe(1)
  })

  it('centres the selected thumbnail without scrolling beyond the strip', () => {
    expect(thumbnailScrollLeft(0, 56, 8, 320, 12)).toBe(0)
    expect(thumbnailScrollLeft(5, 56, 8, 320, 12)).toBe(188)
    expect(thumbnailScrollLeft(11, 56, 8, 320, 12)).toBe(440)
  })
})
