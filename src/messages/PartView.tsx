import { AudioLines, CircleHelp } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import type { MessagePart } from './index'
import { ReasoningPart } from './ReasoningPart'
import { ToolPart, type NestedMessageRow } from './ToolPart'
import { useT } from '../i18n'
import { parseAlmaImageEdit } from '../components/imageAnnotatorModel'
import { ImageEditCard } from './ImageEditCard'
import { TeammateMessagePart } from './TeammateMessagePart'
import { FileTypeIcon } from './FileTypeIcon'
import { fileExtensionLabel, formatBytes } from './fileAttachment'
import { isVoiceLikePart, type VoiceNote } from './voiceNote'

export interface MarkdownRenderOptions {
  linkUserFilePaths?: boolean
  /** False for user-authored text, which is never rendered as formulas. */
  math?: boolean
}

export interface PartViewCapabilities {
  renderMarkdown: (text: string, options?: MarkdownRenderOptions) => ReactNode
  renderImage?: (source: string, name: string) => ReactNode
  /** Plays a row's voice note; absent hosts show the "can't play" note. */
  renderVoice?: (voice: VoiceNote) => ReactNode
  renderNestedRuns?: (
    rows: readonly NestedMessageRow[],
    live: boolean,
  ) => ReactNode
  nestedActivity?: (rows: readonly NestedMessageRow[]) => string | undefined
}

export const PartView = memo(function PartView({
  part,
  live = false,
  duration,
  nested,
  linkUserFilePaths = false,
  math = true,
  capabilities,
}: {
  part: MessagePart
  live?: boolean
  duration?: number
  nested?: readonly NestedMessageRow[]
  linkUserFilePaths?: boolean
  math?: boolean
  capabilities: PartViewCapabilities
}) {
  const t = useT()
  if (part.type === 'step-start') return null
  if (
    (part.type === 'file' || part.type === 'image') &&
    typeof part.url === 'string'
  ) {
    const mediaType =
      typeof part.mediaType === 'string'
        ? part.mediaType
        : 'application/octet-stream'
    const filename =
      typeof part.filename === 'string'
        ? part.filename
        : t('message.attachment')
    if (part.type === 'image' || mediaType.startsWith('image/'))
      return capabilities.renderImage?.(part.url, filename) ?? null
    // Desktop file parts rarely say their size; the extension stands in.
    const detail =
      typeof part.size === 'number' &&
      Number.isFinite(part.size) &&
      part.size >= 0
        ? formatBytes(part.size)
        : fileExtensionLabel(filename)
    return (
      <span className="message-file">
        <span className="end-resource-icon">
          <FileTypeIcon name={filename} mediaType={mediaType} />
        </span>
        <span className="end-resource-copy">
          <strong>{filename}</strong>
          {detail ? <span>{detail}</span> : null}
        </span>
      </span>
    )
  }

  if (part.type === 'reasoning')
    return <ReasoningPart part={part} live={live} duration={duration} />
  if (part.type === 'teammate-message')
    return (
      <TeammateMessagePart
        part={part}
        renderMarkdown={(text) => capabilities.renderMarkdown(text)}
      />
    )
  if (part.type === 'text') {
    const parsed = parseAlmaImageEdit(part.text ?? '')
    // The card carries the same numbered requests as the visible text, so
    // the phone shows only the card.
    if (parsed.request) return <ImageEditCard request={parsed.request} />
    return capabilities.renderMarkdown(parsed.visibleText, {
      linkUserFilePaths,
      math,
    })
  }
  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    return (
      <ToolPart
        part={part}
        nested={nested}
        renderMarkdown={(text) => capabilities.renderMarkdown(text)}
        renderNestedRuns={capabilities.renderNestedRuns}
        nestedActivity={capabilities.nestedActivity}
      />
    )
  }
  if (part.text) return <p>{part.text}</p>
  // AI SDK bookkeeping parts carry no content of their own.
  if (part.type.startsWith('source-') || part.type.startsWith('data-'))
    return null
  return isVoiceLikePart(part) ? (
    <VoiceUnavailable />
  ) : (
    <p className="message-unsupported">
      <CircleHelp size={16} aria-hidden />
      {t('message.unsupportedPart')}
    </p>
  )
})

/** Shown wherever a voice message exists but this client cannot play it. */
export function VoiceUnavailable() {
  const t = useT()
  return (
    <p className="message-unsupported">
      <AudioLines size={16} aria-hidden />
      {t('message.voice.unsupported')}
    </p>
  )
}
