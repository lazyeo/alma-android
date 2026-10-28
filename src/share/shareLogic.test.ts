import { describe, expect, it } from 'vitest'
import {
  composeSharedMessage,
  decodeShareShortcutId,
  encodeNewChatShortcutId,
  encodeThreadShortcutId,
  mergeSharedThreads,
  normalizeSharePayload,
  searchSharedThreads,
} from './shareLogic'

describe('normalizeSharePayload', () => {
  it('keeps valid text, subject, image files, and shortcut id', () => {
    expect(
      normalizeSharePayload({
        text: ' https://alma.now/docs ',
        subject: ' Alma docs ',
        shortcutId: 'thread:desk:thread',
        files: [
          {
            name: 'photo.png',
            mimeType: 'image/png',
            size: 42,
            path: 'file:///cache/photo.png',
          },
          { name: '', mimeType: 4 },
        ],
      }),
    ).toEqual({
      text: 'https://alma.now/docs',
      subject: 'Alma docs',
      shortcutId: 'thread:desk:thread',
      files: [
        {
          name: 'photo.png',
          mimeType: 'image/png',
          size: 42,
          path: 'file:///cache/photo.png',
        },
      ],
    })
  })

  it('returns undefined for an empty payload', () => {
    expect(normalizeSharePayload({ files: [] })).toBeUndefined()
  })
})

describe('cross-desktop thread rows', () => {
  const desktops = [
    {
      desktopId: 'mba',
      desktopName: 'Alma@MBA',
      status: 'online' as const,
      threads: [
        { id: 'older', title: 'Release notes', updatedAt: 100 },
        { id: 'newer', title: 'Share target', updatedAt: 300 },
      ],
    },
    {
      desktopId: 'mini',
      desktopName: 'Studio Mini',
      status: 'offline' as const,
      note: 'Desktop is offline',
      threads: [{ id: 'design', title: 'Cover screen', updatedAt: 200 }],
    },
  ]

  it('merges and sorts recent rows while preserving desktop status', () => {
    expect(mergeSharedThreads(desktops).map((row) => row.threadId)).toEqual([
      'newer',
      'design',
      'older',
    ])
    expect(mergeSharedThreads(desktops)[1]).toMatchObject({
      desktopName: 'Studio Mini',
      status: 'offline',
      note: 'Desktop is offline',
    })
  })

  it('searches thread and desktop names', () => {
    expect(
      searchSharedThreads(mergeSharedThreads(desktops), 'studio'),
    ).toHaveLength(1)
    expect(
      searchSharedThreads(mergeSharedThreads(desktops), 'share')[0].threadId,
    ).toBe('newer')
  })
})

describe('share shortcut ids', () => {
  it('round trips thread ids containing punctuation', () => {
    const id = encodeThreadShortcutId('desk/a', 'thread:42')
    expect(decodeShareShortcutId(id)).toEqual({
      kind: 'thread',
      desktopId: 'desk/a',
      threadId: 'thread:42',
    })
  })

  it('round trips a new-chat desktop id', () => {
    expect(decodeShareShortcutId(encodeNewChatShortcutId('desk/a'))).toEqual({
      kind: 'new-chat',
      desktopId: 'desk/a',
    })
  })

  it('rejects malformed ids', () => {
    expect(decodeShareShortcutId('thread:broken')).toBeUndefined()
  })
})

describe('composeSharedMessage', () => {
  it('combines a question, subject, and shared text without duplicate text', () => {
    expect(
      composeSharedMessage(
        { subject: 'Alma docs', text: 'https://alma.now/docs', files: [] },
        'Summarize this',
      ),
    ).toBe('Summarize this\n\nAlma docs\nhttps://alma.now/docs')
  })

  it('uses a useful fallback for image-only shares', () => {
    expect(
      composeSharedMessage(
        {
          files: [
            {
              name: 'fold.png',
              mimeType: 'image/png',
              size: 10,
              path: 'file:///fold.png',
            },
          ],
        },
        '',
      ),
    ).toBe('Shared fold.png')
  })
})
