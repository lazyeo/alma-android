import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_STORED_ATTACHMENT_BYTES,
  createAttachmentStore,
} from './attachmentStore'
import {
  createDraftAutosave,
  loadDraft,
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

describe('attachment store', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  it('stores, restores, and deletes attachment blobs by key', async () => {
    const store = createAttachmentStore(factory)
    const blob = new Blob(['photo'], { type: 'image/jpeg' })

    await store.put('desktop:thread:attachment', blob)
    const restored = await store.get('desktop:thread:attachment')

    expect(await restored?.text()).toBe('photo')
    expect(restored?.type).toBe('image/jpeg')
    await store.delete('desktop:thread:attachment')
    await expect(
      store.get('desktop:thread:attachment'),
    ).resolves.toBeUndefined()
  })

  it('updates a restored draft blob when markup replaces the attachment', async () => {
    const store = createAttachmentStore(factory)
    const storage = new MemoryStorage()
    const original = new Blob(['original'], { type: 'image/png' })
    const annotated = new Blob(['annotated'], { type: 'image/png' })
    const attachment = {
      id: 'attachment',
      kind: 'image' as const,
      name: 'photo.png',
      mediaType: 'image/png',
      previewUrl: 'blob:original',
      pending: { blob: original },
    }
    const initial = createDraftAutosave(storage, 'desktop', 'thread', 0, store)
    initial.update('', [attachment])
    initial.flush()
    const storedDraft = loadDraft(storage, 'desktop', 'thread')
    const pendingKey = storedDraft?.attachments[0]
    if (!pendingKey || !('pendingKey' in pendingKey))
      throw new Error('expected stored pending attachment')
    await vi.waitFor(async () => {
      expect(await (await store.get(pendingKey.pendingKey))?.text()).toBe(
        'original',
      )
    })

    const autosave = createDraftAutosave(storage, 'desktop', 'thread', 0, store)
    await autosave.restoreAttachments()
    autosave.update('', [
      {
        ...attachment,
        previewUrl: 'blob:annotated',
        pending: { blob: annotated, storeKey: pendingKey.pendingKey },
      },
    ])
    autosave.flush()

    await vi.waitFor(async () => {
      expect(await (await store.get(pendingKey.pendingKey))?.text()).toBe(
        'annotated',
      )
    })
    const reopened = createDraftAutosave(storage, 'desktop', 'thread', 0, store)
    const [restored] = await reopened.restoreAttachments()
    expect(restored && 'pending' in restored).toBe(true)
    if (!restored || !('pending' in restored))
      throw new Error('expected restored pending attachment')
    expect(await restored.pending.blob.text()).toBe('annotated')
  })

  it('rejects blobs over the per-attachment size cap', async () => {
    const store = createAttachmentStore(factory)
    const blob = new Blob([new Uint8Array(MAX_STORED_ATTACHMENT_BYTES + 1)])

    await expect(store.put('too-large', blob)).rejects.toThrow(
      'too large to save in a draft',
    )
  })
})
