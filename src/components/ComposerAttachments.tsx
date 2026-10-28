import { Camera, File, Image, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../haptics'
import {
  MAX_RELAY_UPLOAD_BYTES,
  downscaleImage,
  relayUploadError,
} from '../screens/imageProcessing'
import type { UploadedAttachment } from '../screens/messageParts'
import type { AlmaApi } from '../relay/almaApi'
import { imageCache } from '../screens/relayImages'
import { BottomSheet } from './BottomSheet'
import { useT } from '../i18n'

export function ComposerAttachmentTray({
  api,
  attachments,
  onChange,
}: {
  api: AlmaApi
  attachments: UploadedAttachment[]
  onChange(value: UploadedAttachment[]): void
}) {
  const t = useT()
  const [previews, setPreviews] = useState<Record<number, string>>({})
  useEffect(() => {
    let active = true
    const urls: string[] = []
    void Promise.all(
      attachments.map(async (attachment, index) => {
        if (
          attachment.previewUrl ||
          attachment.kind !== 'image' ||
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
    <div className="attachment-tray">
      {attachments.map((attachment, index) => (
        <div className="attachment-chip" key={`${attachment.name}-${index}`}>
          {attachment.previewUrl || previews[index] ? (
            <img src={attachment.previewUrl || previews[index]} alt="" />
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
      ))}
    </div>
  )
}

export function ComposerAttachments({
  api,
  attachments,
  onChange,
  onUploading,
  onError,
  goalControl,
  vision = true,
}: {
  api: AlmaApi
  attachments: UploadedAttachment[]
  onChange(value: UploadedAttachment[]): void
  onUploading(value: boolean): void
  onError(value: string): void
  goalControl?: ReactNode
  vision?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const photos = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)

  async function upload(list: FileList | null, images: boolean) {
    if (!list?.length) return
    if (images && !vision) {
      onError(t('composer.attachments.noVision'))
      return
    }
    onUploading(true)
    onError('')
    try {
      const uploaded: UploadedAttachment[] = []
      for (const file of Array.from(list)) {
        if (!images && file.size > MAX_RELAY_UPLOAD_BYTES)
          throw new Error(relayUploadError(file.name))
        if (images) {
          const processed = await downscaleImage(file)
          const result = await api.uploadImage(
            processed.bytes,
            processed.mediaType,
          )
          uploaded.push({
            kind: 'image',
            name:
              file.name.replace(/\.[^.]+$/, '') +
              (processed.mediaType === 'image/jpeg'
                ? '.jpg'
                : '.' + processed.mediaType.split('/')[1]),
            mediaType: result.mediaType || processed.mediaType,
            url: result.url,
            previewUrl: processed.previewUrl,
          })
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const result = await api.uploadFile(
            bytes,
            file.name,
            file.type || 'application/octet-stream',
          )
          uploaded.push({
            kind: 'file',
            name: file.name,
            mediaType: file.type || 'application/octet-stream',
            filePath: result.filePath,
          })
        }
      }
      onChange([...attachments, ...uploaded])
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : t('composer.attachments.uploadFailed'),
      )
    } finally {
      onUploading(false)
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
        onChange={(event) => void upload(event.target.files, true)}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => void upload(event.target.files, true)}
      />
      <input
        ref={files}
        type="file"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files, false)}
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
