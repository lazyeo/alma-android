import { ChevronRight, RefreshCw } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { previewTailAttributes } from '../components/longPressPreview'
import { useLongPress } from '../components/useLongPress'
import { useT } from '../i18n'
import { PartView, type PartViewCapabilities } from '../messages/PartView'
import { ReactionChips } from '../messages/ReactionChips'
import { MessageVoice } from '../messages/VoiceCapsule'
import { parseVoiceNote } from '../messages/voiceNote'
import type { MessageRow } from '../relay'
import { LoadingOrb } from '../screens/LoadingOrbCanvas'
import { parseReactions } from '../screens/messageReactions'
import { AlmaFace } from './AlmaFace'
import type { FaceMood } from './faceState'
import { personaParts, type PersonaRowLayout } from './personaLayout'

export interface PersonaMessageViewProps {
  row: MessageRow
  layout: PersonaRowLayout
  generating?: boolean
  mood: FaceMood
  capabilities: PartViewCapabilities
  onActions?: (row: MessageRow) => void
  onRetryFailed?: (row: MessageRow) => void
  onToggleReaction?: (row: MessageRow, emoji: string) => void
}

/**
 * One message in Alma's messenger view: her words in a left bubble (with
 * her face on the first of a run), the user's on the right, tool work hidden
 * (the header status shows what she is doing live), reasoning on request.
 */
export const PersonaMessageView = memo(function PersonaMessageView({
  row,
  layout,
  generating = false,
  mood,
  capabilities,
  onActions,
  onRetryFailed,
  onToggleReaction,
}: PersonaMessageViewProps) {
  const t = useT()
  const press = useLongPress(() => onActions?.(row), { preview: true })
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const parts = useMemo(
    () => personaParts(row.message.parts),
    [row.message.parts],
  )
  const alma = layout.side === 'alma'
  // The long-press preview card shows a reply's final summary.
  const previewTail = useMemo(
    () => (alma ? previewTailAttributes(row.message.parts) : undefined),
    [alma, row.message.parts],
  )
  const status = row.metadata?.optimisticStatus
  const reactions = useMemo(() => parseReactions(row.metadata), [row.metadata])
  // A voice reply may have no text parts at all; it still needs a bubble.
  const hasVoice = parseVoiceNote(row.metadata).kind !== 'none'
  const hasReasoning = alma && parts.reasoning.length > 0
  const empty = !parts.body.length && !hasReasoning && !hasVoice
  // While she is still thinking (no words yet) the entry says so.
  const thinkingLive =
    hasReasoning && generating && !parts.body.length && !hasVoice
  // Her face and the thinking entry share one row; a later bubble in her
  // run without reasoning gets no row at all, so no blank line.
  const showHead = alma && (layout.first || hasReasoning)
  const thinkingId = `persona-thinking-${row.id}`
  return (
    <article
      {...press}
      {...previewTail}
      className={`persona-message ${layout.side}${layout.first ? ' first' : ''}${layout.last ? ' last' : ''}`}
    >
      {showHead ? (
        <div className="persona-head">
          <span className="persona-avatar-slot">
            {layout.first ? <AlmaFace size={28} mood={mood} still /> : null}
          </span>
          {hasReasoning ? (
            <button
              type="button"
              className={`quiet-text-button persona-thinking-toggle${thinkingLive ? ' live' : ''}`}
              data-preview-omit=""
              aria-expanded={thinkingOpen}
              aria-controls={thinkingId}
              onClick={() => setThinkingOpen((open) => !open)}
            >
              <ChevronRight size={14} aria-hidden />
              {thinkingLive
                ? t('message.reasoning.thinking')
                : thinkingOpen
                  ? t('threads.personal.hideThinking')
                  : t('threads.personal.showThinking')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="persona-stack">
        {thinkingOpen ? (
          <div
            id={thinkingId}
            className="persona-thinking"
            data-preview-omit=""
          >
            {parts.reasoning.map((part, index) => (
              <div key={index}>
                {capabilities.renderMarkdown(String(part.text ?? ''), {
                  linkUserFilePaths: false,
                })}
              </div>
            ))}
          </div>
        ) : null}
        {parts.body.length || hasVoice ? (
          <div className="persona-bubble">
            <MessageVoice
              metadata={row.metadata}
              renderVoice={capabilities.renderVoice}
            />
            {parts.body.map((part, index) => (
              <div
                key={`${part.type}-${index}`}
                data-message-part={row.message.parts.indexOf(part)}
              >
                <PartView
                  part={part}
                  live={false}
                  linkUserFilePaths={alma}
                  math={alma}
                  capabilities={capabilities}
                />
              </div>
            ))}
          </div>
        ) : alma && generating && empty ? (
          <div className="persona-bubble typing">
            <LoadingOrb size={14} />
          </div>
        ) : null}
        <ReactionChips
          reactions={reactions}
          onToggle={
            onToggleReaction
              ? (emoji) => onToggleReaction(row, emoji)
              : undefined
          }
        />
        {status === 'pending' ? (
          <p className="message-delivery-status">{t('message.sending')}</p>
        ) : status === 'failed' ? (
          <div className="message-delivery-status failed">
            <span>{t('message.notSent')}</span>
            {onRetryFailed ? (
              <button onClick={() => onRetryFailed(row)}>
                <RefreshCw size={13} />
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
})
