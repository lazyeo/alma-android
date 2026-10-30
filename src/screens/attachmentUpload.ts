import type { AlmaApi } from '../relay/almaApi'
import type { UploadedAttachment } from './messageParts'

export interface PendingAttachment {
  id: string
  kind: 'image' | 'file'
  name: string
  mediaType: string
  previewUrl: string
  pending: { blob: Blob; storeKey?: string }
}

export type ComposerAttachment = UploadedAttachment | PendingAttachment

export function isPendingAttachment(
  attachment: ComposerAttachment,
): attachment is PendingAttachment {
  return 'pending' in attachment
}

type AttachmentUploadApi = Pick<AlmaApi, 'uploadImage' | 'uploadFile'>

export async function uploadPendingAttachments(
  api: AttachmentUploadApi,
  attachments: ComposerAttachment[],
): Promise<UploadedAttachment[]> {
  const uploaded: UploadedAttachment[] = []
  for (const attachment of attachments) {
    if (!isPendingAttachment(attachment)) {
      uploaded.push(attachment)
      continue
    }
    const bytes = new Uint8Array(await attachment.pending.blob.arrayBuffer())
    if (attachment.kind === 'image') {
      const result = await api.uploadImage(bytes, attachment.mediaType)
      uploaded.push({
        kind: 'image',
        name: attachment.name,
        mediaType: result.mediaType || attachment.mediaType,
        url: result.url,
        previewUrl: attachment.previewUrl,
      })
    } else {
      const result = await api.uploadFile(
        bytes,
        attachment.name,
        attachment.mediaType,
      )
      uploaded.push({
        kind: 'file',
        name: attachment.name,
        mediaType: attachment.mediaType,
        filePath: result.filePath,
        previewUrl: attachment.previewUrl,
      })
    }
  }
  return uploaded
}
