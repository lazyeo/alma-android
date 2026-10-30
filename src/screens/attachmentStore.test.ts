import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_STORED_ATTACHMENT_BYTES,
  createAttachmentStore,
} from './attachmentStore'

describe('attachment store', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('alma-mobile-attachments')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })

  it('stores, restores, and deletes attachment blobs by key', async () => {
    const store = createAttachmentStore(indexedDB)
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

  it('rejects blobs over the per-attachment size cap', async () => {
    const store = createAttachmentStore(indexedDB)
    const blob = new Blob([new Uint8Array(MAX_STORED_ATTACHMENT_BYTES + 1)])

    await expect(store.put('too-large', blob)).rejects.toThrow(
      'too large to save in a draft',
    )
  })
})
