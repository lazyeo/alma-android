import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { MessagePart } from './index'
import { useT } from '../i18n'
import { teammateMessageTitle } from '../uiCopy'

const LONG_MESSAGE_LINES = 6
const APPROXIMATE_CHARACTERS_PER_LINE = 44

function shouldCollapseMessage(text: string, summary?: string) {
  const estimatedLines = text
    .split(/\r?\n/)
    .reduce(
      (lines, line) =>
        lines +
        Math.max(1, Math.ceil(line.length / APPROXIMATE_CHARACTERS_PER_LINE)),
      0,
    )
  return Boolean(summary) || estimatedLines > LONG_MESSAGE_LINES
}

export function TeammateMessagePart({
  part,
  renderMarkdown,
}: {
  part: MessagePart
  renderMarkdown: (text: string) => ReactNode
}) {
  const t = useT()
  const text = typeof part.text === 'string' ? part.text : ''
  const summary = typeof part.summary === 'string' ? part.summary : undefined
  const from = typeof part.from === 'string' ? part.from : undefined
  const collapsible = shouldCollapseMessage(text, summary)
  const [expanded, setExpanded] = useState(!collapsible)

  return (
    <aside className="teammate-message-card">
      <header>
        <Users aria-hidden="true" />
        <strong>{teammateMessageTitle(from)}</strong>
      </header>
      {summary ? (
        <div className="teammate-message-summary">
          {renderMarkdown(summary)}
        </div>
      ) : null}
      {expanded ? (
        <div className="teammate-message-body">{renderMarkdown(text)}</div>
      ) : null}
      {collapsible ? (
        <button
          className="quiet-text-button teammate-message-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? t('agents.hideFullMessage') : t('agents.showFullMessage')}
        </button>
      ) : null}
    </aside>
  )
}
