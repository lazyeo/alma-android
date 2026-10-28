import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadedAttachment } from './messageParts'
import {
  DRAFT_SAVE_DELAY_MS,
  clearDraft,
  createDraftAutosave,
  draftSnippet,
  listDrafts,
  loadDraft,
  saveDraft,
  type DraftStorage,
} from './threadDrafts'

class MemoryStorage implements DraftStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('thread drafts', () => {
  it('scopes drafts by desktop and thread', () => {
    const storage = new MemoryStorage()
    saveDraft(storage, 'desktop-a', 'thread-1', 'alpha', 10)
    saveDraft(storage, 'desktop-b', 'thread-1', 'beta', 20)
    saveDraft(storage, 'desktop-a', 'thread-2', 'gamma', 30)

    expect(loadDraft(storage, 'desktop-a', 'thread-1')?.text).toBe('alpha')
    expect(loadDraft(storage, 'desktop-b', 'thread-1')?.text).toBe('beta')
    expect(loadDraft(storage, 'desktop-a', 'thread-2')?.text).toBe('gamma')
  })

  it('clears only the requested draft', () => {
    const storage = new MemoryStorage()
    saveDraft(storage, 'desktop-a', 'thread-1', 'alpha', 10)
    saveDraft(storage, 'desktop-a', 'thread-2', 'beta', 20)

    clearDraft(storage, 'desktop-a', 'thread-1')

    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toBeUndefined()
    expect(loadDraft(storage, 'desktop-a', 'thread-2')?.text).toBe('beta')
  })

  it('removes a draft only when text and attachments are empty', () => {
    const storage = new MemoryStorage()
    const attachments: UploadedAttachment[] = [
      {
        kind: 'image',
        name: 'photo.jpg',
        mediaType: 'image/jpeg',
        url: 'http://localhost:23001/api/gallery/cache/photo.jpg',
        previewUrl: 'blob:must-not-persist',
      },
    ]
    saveDraft(storage, 'desktop-a', 'thread-1', '', 10, attachments)

    expect(loadDraft(storage, 'desktop-a', 'thread-1')?.attachments).toEqual([
      {
        kind: 'image',
        name: 'photo.jpg',
        mediaType: 'image/jpeg',
        url: 'http://localhost:23001/api/gallery/cache/photo.jpg',
      },
    ])
    saveDraft(storage, 'desktop-a', 'thread-1', '   ', 20, [])
    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toBeUndefined()
  })

  it('caps stored text at 20,000 characters', () => {
    const storage = new MemoryStorage()
    saveDraft(storage, 'desktop-a', 'thread-1', 'x'.repeat(20_100), 10)

    expect(loadDraft(storage, 'desktop-a', 'thread-1')?.text).toHaveLength(
      20_000,
    )
  })

  it('evicts the oldest drafts beyond 100 entries', () => {
    const storage = new MemoryStorage()
    for (let index = 0; index < 102; index += 1) {
      saveDraft(storage, 'desktop-a', `thread-${index}`, `${index}`, index)
    }

    const drafts = listDrafts(storage, 'desktop-a')
    expect(drafts).toHaveLength(100)
    expect(loadDraft(storage, 'desktop-a', 'thread-0')).toBeUndefined()
    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toBeUndefined()
    expect(loadDraft(storage, 'desktop-a', 'thread-101')?.text).toBe('101')
  })

  it('falls back safely when storage contains corrupt data', () => {
    const storage = new MemoryStorage()
    storage.setItem('alma-mobile.drafts.v1', '{not json')

    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toBeUndefined()
    expect(listDrafts(storage, 'desktop-a')).toEqual([])

    saveDraft(storage, 'desktop-a', 'thread-1', 'recovered', 10)
    expect(loadDraft(storage, 'desktop-a', 'thread-1')?.text).toBe('recovered')
  })
})

describe('draft autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores the saved text for its desktop and thread', () => {
    const storage = new MemoryStorage()
    saveDraft(storage, 'desktop-a', 'thread-1', 'saved', 10)

    expect(
      createDraftAutosave(storage, 'desktop-a', 'thread-1').savedText(),
    ).toBe('saved')
    expect(
      createDraftAutosave(storage, 'desktop-b', 'thread-1').savedText(),
    ).toBe('')
  })

  it('debounces writes until typing pauses', () => {
    const storage = new MemoryStorage()
    const autosave = createDraftAutosave(storage, 'desktop-a', 'thread-1')

    autosave.update('h')
    autosave.update('hi')
    vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS - 1)
    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(loadDraft(storage, 'desktop-a', 'thread-1')?.text).toBe('hi')
  })

  it('flushes pending text and attachment metadata immediately', () => {
    const storage = new MemoryStorage()
    const autosave = createDraftAutosave(storage, 'desktop-a', 'thread-1')

    autosave.update('leaving now', [
      {
        kind: 'file',
        name: 'notes.txt',
        mediaType: 'text/plain',
        filePath: '/tmp/notes.txt',
      },
    ])
    autosave.flush()

    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toMatchObject({
      text: 'leaving now',
      attachments: [
        {
          kind: 'file',
          name: 'notes.txt',
          mediaType: 'text/plain',
          filePath: '/tmp/notes.txt',
        },
      ],
    })
  })

  it('does not rewrite unchanged restored text', () => {
    const storage = new MemoryStorage()
    saveDraft(storage, 'desktop-a', 'thread-1', 'saved', 10)
    const autosave = createDraftAutosave(storage, 'desktop-a', 'thread-1')

    autosave.update('saved')
    autosave.flush()

    expect(loadDraft(storage, 'desktop-a', 'thread-1')?.updatedAt).toBe(10)
  })

  it('clear drops pending writes and the stored draft', () => {
    const storage = new MemoryStorage()
    saveDraft(storage, 'desktop-a', 'thread-1', 'saved', 10)
    const autosave = createDraftAutosave(storage, 'desktop-a', 'thread-1')

    autosave.update('about to send')
    autosave.clear()
    vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS)
    autosave.flush()

    expect(loadDraft(storage, 'desktop-a', 'thread-1')).toBeUndefined()
    expect(autosave.savedText()).toBe('')
  })
})

describe('draft snippet', () => {
  it('collapses whitespace and truncates long drafts', () => {
    expect(draftSnippet('  first\n\n second  ')).toBe('first second')
    expect(draftSnippet('x'.repeat(80), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

describe('draft snippets with references', () => {
  it('shows materialized reference tokens by label', () => {
    expect(draftSnippet('Ask @[Roadmap](alma://thread/a) about it')).toBe(
      'Ask @Roadmap about it',
    )
  })
})
