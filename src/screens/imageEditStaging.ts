import {
  buildImageEditDraft,
  type AnnotationRegion,
} from '../components/imageAnnotatorModel'
import { createPendingImageAttachment } from './attachmentUpload'

interface ImageEditCopy {
  visibleHeader: string
  overallLabel: string
  directive: string
  sourcePathLabel: string
}

export function stageImageEditResult({
  image,
  blob,
  regions,
  note,
  copy,
  createId,
  createObjectUrl,
}: {
  image: { source: string; name: string }
  blob: Blob
  regions: readonly AnnotationRegion[]
  note: string
  copy: ImageEditCopy
  createId?: () => string
  createObjectUrl?: (blob: Blob) => string
}) {
  return {
    attachment: createPendingImageAttachment({
      blob,
      name: image.name,
      id: createId?.(),
      previewUrl: createObjectUrl?.(blob),
    }),
    text: buildImageEditDraft({
      regions,
      note,
      ...copy,
      sourcePath: image.source.startsWith('/') ? image.source : undefined,
    }),
  }
}
