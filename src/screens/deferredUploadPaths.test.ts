import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('deferred attachment send paths', () => {
  it('keeps composer picking local without calling relay upload APIs', () => {
    const source = read('../components/ComposerAttachments.tsx')

    expect(source).not.toContain('api.uploadImage')
    expect(source).not.toContain('api.uploadFile')
    expect(source).toContain('pending: {')
    expect(source).toContain('downscaleImage(file)')
  })

  it('uploads before normal send, queueing, and the first send', () => {
    const source = read('./ThreadScreen.tsx')

    expect(source).toContain('const uploaded = await uploadForSend(attachments)')
    expect(source).toContain('composerContent(),\n      uploaded,')
    expect(source).toContain(
      'uploaded = await uploadPendingAttachments(api, pending.attachments)',
    )
    expect(source).toContain('const parts = buildMessageParts(pending.content, uploaded)')
    expect(source).not.toContain(
      'addQueuedMessage(\n            queuedRef.current,\n            pending.content,\n            pending.attachments,',
    )
  })
})
