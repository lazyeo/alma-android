import { RefreshCw } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { previewTailAttributes } from '../components/longPressPreview'
import { useLongPress } from '../components/useLongPress'
import { useT } from '../i18n'
import { PartView, type PartViewCapabilities } from '../messages/PartView'
import type { MessageRow } from '../relay'
import { LoadingOrb } from '../screens/LoadingOrbCanvas'
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
  const empty = !parts.body.length && !parts.reasoning.length
  return (
    <article
      {...press}
      {...previewTail}
      className={`persona-message ${layout.side}${layout.first ? ' first' : ''}${layout.last ? ' last' : ''}`}
    >
      {alma ? (
        <span className="persona-avatar-slot">
          {layout.first ? <AlmaFace size={28} mood={mood} still /> : null}
        </span>
      ) : null}
      <div className="persona-stack">
        {parts.reasoning.length ? (
          <button
            type="button"
            className="quiet-text-button persona-thinking-toggle"
            data-preview-omit=""
            aria-expanded={thinkingOpen}
            onClick={() => setThinkingOpen((open) => !open)}
          >
            {thinkingOpen
              ? t('threads.personal.hideThinking')
              : t('threads.personal.showThinking')}
          </button>
        ) : null}
        {thinkingOpen ? (
          <div className="persona-thinking" data-preview-omit="">
            {parts.reasoning.map((part, index) => (
              <div key={index}>
                {capabilities.renderMarkdown(String(part.text ?? ''), false)}
              </div>
            ))}
          </div>
        ) : null}
        {parts.body.length ? (
          <div className="persona-bubble">
            {parts.body.map((part, index) => (
              <div
                key={`${part.type}-${index}`}
                data-message-part={row.message.parts.indexOf(part)}
              >
                <PartView
                  part={part}
                  live={false}
                  linkUserFilePaths={alma}
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
