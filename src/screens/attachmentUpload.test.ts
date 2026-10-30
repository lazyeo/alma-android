import { describe, expect, it, vi } from 'vitest'
import type { ComposerAttachment } from './attachmentUpload'
import { uploadPendingAttachments } from './attachmentUpload'

function pending(
  kind: 'image' | 'file',
  blob = new Blob(['bytes'], { type: kind === 'image' ? 'image/jpeg' : 'text/plain' }),
): ComposerAttachment {
  return {
    id: `${kind}-1`,
    kind,
    name: kind === 'image' ? 'photo.jpg' : 'notes.txt',
    mediaType: blob.type,
    previewUrl: 'blob:preview',
    pending: { blob },
  }
}

describe('pending attachment upload', () => {
  it('uploads pending images and files while preserving uploaded attachments', async () => {
    const uploaded = {
      kind: 'file' as const,
      name: 'already.txt',
      mediaType: 'text/plain',
      filePath: '/cache/already.txt',
    }
    const api = {
      uploadImage: vi.fn().mockResolvedValue({
        url: 'http://localhost/photo.jpg',
        mediaType: 'image/jpeg',
      }),
      uploadFile: vi.fn().mockResolvedValue({ filePath: '/cache/notes.txt' }),
    }

    await expect(
      uploadPendingAttachments(api, [uploaded, pending('image'), pending('file')]),
    ).resolves.toEqual([
      uploaded,
      {
        kind: 'image',
        name: 'photo.jpg',
        mediaType: 'image/jpeg',
        url: 'http://localhost/photo.jpg',
        previewUrl: 'blob:preview',
      },
      {
        kind: 'file',
        name: 'notes.txt',
        mediaType: 'text/plain',
        filePath: '/cache/notes.txt',
        previewUrl: 'blob:preview',
      },
    ])
    expect(api.uploadImage).toHaveBeenCalledWith(
      new Uint8Array([98, 121, 116, 101, 115]),
      'image/jpeg',
    )
    expect(api.uploadFile).toHaveBeenCalledWith(
      new Uint8Array([98, 121, 116, 101, 115]),
      'notes.txt',
      'text/plain',
    )
  })

  it('stops and surfaces the upload error', async () => {
    const failure = new Error('relay unavailable')
    const api = {
      uploadImage: vi.fn().mockRejectedValue(failure),
      uploadFile: vi.fn(),
    }

    await expect(
      uploadPendingAttachments(api, [pending('image')]),
    ).rejects.toBe(failure)
    expect(api.uploadFile).not.toHaveBeenCalled()
  })
})
