import { Camera, File, Image, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../haptics'
import {
  MAX_RELAY_UPLOAD_BYTES,
  downscaleImage,
  relayUploadError,
} from '../screens/imageProcessing'
import {
  createPendingImageAttachment,
  imageAttachmentName,
  isPendingAttachment,
  type ComposerAttachment,
  type PendingAttachment,
} from '../screens/attachmentUpload'
import type { AlmaApi } from '../relay/almaApi'
import { imageCache } from '../screens/relayImages'
import { BottomSheet } from './BottomSheet'
import { ImageAnnotator } from './ImageAnnotator'
import { buildMarkupNotes } from './imageAnnotatorModel'
import { useT } from '../i18n'

export function ComposerAttachmentTray({
  api,
  attachments,
  onChange,
  onAnnotationText,
}: {
  api: AlmaApi
  attachments: ComposerAttachment[]
  onChange(value: ComposerAttachment[]): void
  onAnnotationText?(text: string): void
}) {
  const t = useT()
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<{
    index: number
    attachment: PendingAttachment
  }>()
  useEffect(() => {
    let active = true
    const urls: string[] = []
    void Promise.all(
      attachments.map(async (attachment, index) => {
        if (
          attachment.previewUrl ||
          attachment.kind !== 'image' ||
          !('url' in attachment) ||
          !attachment.url
        )
          return
        try {
          const blob = await imageCache(api).get(attachment.url)
          if (!active) return
          const url = URL.createObjectURL(blob)
          urls.push(url)
          setPreviews((current) => ({ ...current, [index]: url }))
        } catch {
          // Keep the image placeholder when a restored relay preview is unavailable.
        }
      }),
    )
    return () => {
      active = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [api, attachments])
  if (!attachments.length) return null
  return (
    <>
      <div className="attachment-tray">
        {attachments.map((attachment, index) => {
          const annotatable =
            attachment.kind === 'image' && isPendingAttachment(attachment)
          const previewUrl = attachment.previewUrl || previews[index]
          return (
            <div
              className={`attachment-chip${annotatable ? ' annotatable' : ''}`}
              key={`${attachment.name}-${index}`}
            >
              {annotatable ? (
                <button
                  className="attachment-annotate"
                  aria-label={t('composer.attachments.annotate', {
                    name: attachment.name,
                  })}
                  onClick={() => setEditing({ index, attachment })}
                >
                  {previewUrl ? <img src={previewUrl} alt="" /> : <Image />}
                  <span
                    className="attachment-annotate-badge"
                    aria-hidden="true"
                  >
                    <Pencil size={12} />
                  </span>
                </button>
              ) : previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : (
                <span>
                  {attachment.kind === 'image' ? (
                    <Image size={22} />
                  ) : (
                    <File size={22} />
                  )}
                </span>
              )}
              <strong>{attachment.name}</strong>
              <button
                className="attachment-remove"
                aria-label={t('composer.attachments.remove', {
                  name: attachment.name,
                })}
                onClick={() => {
                  if (attachment.previewUrl)
                    URL.revokeObjectURL(attachment.previewUrl)
                  onChange(attachments.filter((_, item) => item !== index))
                }}
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
      {editing ? (
        <ImageAnnotator
          source={editing.attachment.pending.blob}
          mode="markup"
          onCancel={() => setEditing(undefined)}
          onDone={(blob, regions) => {
            const previewUrl = URL.createObjectURL(blob)
            const current = attachments[editing.index]
            if (
              current !== editing.attachment ||
              !isPendingAttachment(current)
            ) {
              URL.revokeObjectURL(previewUrl)
              setEditing(undefined)
              return
            }
            const next = [...attachments]
            next[editing.index] = {
              ...current,
              name: imageAttachmentName(current.name, blob.type),
              mediaType: blob.type,
              previewUrl,
              pending: { ...current.pending, blob },
            }
            if (current.previewUrl) URL.revokeObjectURL(current.previewUrl)
            setEditing(undefined)
            onChange(next)
            const annotationText = buildMarkupNotes(regions)
            if (annotationText) onAnnotationText?.(annotationText)
          }}
        />
      ) : null}
    </>
  )
}

export function ComposerAttachments({
  attachments,
  onChange,
  onError,
  goalControl,
  vision = true,
}: {
  attachments: ComposerAttachment[]
  onChange(value: ComposerAttachment[]): void
  onError(value: string): void
  goalControl?: ReactNode
  vision?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const photos = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)

  async function pick(list: FileList | null, images: boolean) {
    if (!list?.length) return
    if (images && !vision) {
      onError(t('composer.attachments.noVision'))
      return
    }
    onError('')
    const pending: ComposerAttachment[] = []
    try {
      for (const file of Array.from(list)) {
        if (!images && file.size > MAX_RELAY_UPLOAD_BYTES)
          throw new Error(relayUploadError(file.name))
        if (images) {
          const processed = await downscaleImage(file)
          pending.push(
            createPendingImageAttachment({
              blob: new Blob([processed.bytes.slice().buffer], {
                type: processed.mediaType,
              }),
              name: file.name,
              previewUrl: processed.previewUrl,
            }),
          )
        } else {
          const mediaType = file.type || 'application/octet-stream'
          pending.push({
            id: crypto.randomUUID(),
            kind: 'file',
            name: file.name,
            mediaType,
            previewUrl: URL.createObjectURL(file),
            pending: { blob: file },
          })
        }
      }
      onChange([...attachments, ...pending])
    } catch (error) {
      for (const attachment of pending) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
      onError(
        error instanceof Error
          ? error.message
          : t('composer.attachments.uploadFailed'),
      )
    } finally {
      for (const input of [photos.current, camera.current, files.current])
        if (input) input.value = ''
    }
  }

  return (
    <>
      <input
        ref={photos}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => void pick(event.target.files, true)}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => void pick(event.target.files, true)}
      />
      <input
        ref={files}
        type="file"
        multiple
        hidden
        onChange={(event) => void pick(event.target.files, false)}
      />
      <button
        className="attach"
        aria-label={t('composer.attachments.add')}
        onClick={() => {
          void haptic('light')
          setOpen(true)
        }}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
      {open ? (
        <BottomSheet
          title={t('composer.attachments.add')}
          className="action-sheet"
          onClose={() => setOpen(false)}
        >
          {[
            [Camera, t('composer.attachments.camera'), camera],
            [Image, t('composer.attachments.photos'), photos],
            [File, t('composer.attachments.file'), files],
          ].map(([Icon, label, input]) => {
            const AttachmentIcon = Icon as typeof Camera
            return (
              <button
                key={String(label)}
                onClick={() => {
                  setOpen(false)
                  ;(input as typeof files).current?.click()
                }}
              >
                <AttachmentIcon size={20} />
                {String(label)}
              </button>
            )
          })}
          {goalControl ? (
            <div className="action-sheet-separator" role="separator" />
          ) : null}
          {goalControl}
        </BottomSheet>
      ) : null}
    </>
  )
}
