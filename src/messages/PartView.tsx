import { AudioLines, CircleHelp } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import type { MessagePart } from './index'
import { ReasoningPart } from './ReasoningPart'
import { ToolPart, type NestedMessageRow } from './ToolPart'
import { useT } from '../i18n'
import { parseAlmaImageEdit } from '../components/imageAnnotatorModel'
import { ImageEditCard } from './ImageEditCard'
import { TeammateMessagePart } from './TeammateMessagePart'
import { isVoiceLikePart, type VoiceNote } from './voiceNote'

export interface PartViewCapabilities {
  renderMarkdown: (text: string, linkUserFilePaths?: boolean) => ReactNode
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
  capabilities,
}: {
  part: MessagePart
  live?: boolean
  duration?: number
  nested?: readonly NestedMessageRow[]
  linkUserFilePaths?: boolean
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
    return part.type === 'image' || mediaType.startsWith('image/') ? (
      (capabilities.renderImage?.(part.url, filename) ?? null)
    ) : (
      <span className="message-file">{filename}</span>
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
    return capabilities.renderMarkdown(parsed.visibleText, linkUserFilePaths)
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
