import { ArrowUp } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLayoutMode } from '../layout/useLayoutMode'
import { useT } from '../i18n'
import { rootRows, type MessageRow } from '../relay'
import { threadCache } from '../relay/threadCache'
import { AlmaFace } from './AlmaFace'
import { AlmaHeader } from './AlmaHeader'
import { presenceFace, useAlmaPresence } from './AlmaPresence'
import { personaLayout, personaParts, type PersonaSide } from './personaLayout'

/** How many cached messages the shell draws; the rest are off screen. */
export const SHELL_ROWS = 12
/** Messages past this many from the bottom rise together. */
export const SHELL_STAGGER_MAX = 3
const SHELL_TEXT_CHARS = 600

export interface ShellRow {
  id: string
  side: PersonaSide
  first: boolean
  /** Plain text paragraphs; no Markdown is parsed in the shell. */
  paragraphs: string[]
  /** Entrance order: the newest message rises first. */
  stagger: number
}

/** The last cached messages as plain text, laid out like the messenger. */
export function shellRows(rows: readonly MessageRow[], limit = SHELL_ROWS) {
  const roots = rootRows(rows as MessageRow[])
  const layout = personaLayout(roots)
  const start = Math.max(0, roots.length - limit)
  const result: ShellRow[] = []
  for (let index = start; index < roots.length; index++) {
    const row = roots[index]
    const text = personaParts(row.message.parts)
      .body.map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
      .join('\n\n')
      .slice(0, SHELL_TEXT_CHARS)
      .trim()
    if (!text) continue
    result.push({
      id: row.id,
      side: layout[index].side,
      first: layout[index].first,
      paragraphs: text.split(/\n{2,}/),
      stagger: 0,
    })
  }
  const last = result.length - 1
  for (const [index, row] of result.entries())
    row.stagger = Math.min(last - index, SHELL_STAGGER_MAX)
  return result
}

/**
 * What the expand renders inside its View Transition update: Alma's header,
 * her latest cached messages without Markdown, and an inert composer. It
 * costs a few milliseconds where the full thread costs tens; AlmaScreen
 * swaps in the real thread once the entrance has played.
 */
export function AlmaShell({
  desktopId,
  threadId,
  backPath,
}: {
  desktopId: string
  threadId: string
  backPath: string
}) {
  const t = useT()
  const navigate = useNavigate()
  const layoutMode = useLayoutMode()
  const presence = useAlmaPresence()
  const mood = presenceFace(
    presence?.state ?? { status: 'loading' },
    Boolean(presence?.generating),
  ).mood
  const rows = useMemo(
    () => shellRows(threadCache.getThread(desktopId, threadId)?.rows ?? []),
    [desktopId, threadId],
  )
  return (
    <div className="thread-detail persona alma-shell">
      <AlmaHeader
        generating={false}
        onBack={layoutMode === 'single' ? () => navigate(backPath) : undefined}
      />
      <div className="message-area">
        <div className="message-scroll alma-shell-scroll">
          {rows.map((row) => (
            <article
              key={row.id}
              className={`persona-message ${row.side}${row.first ? ' first' : ''}`}
              style={{ '--alma-stagger': row.stagger } as CSSProperties}
            >
              {row.side === 'alma' ? (
                <span className="persona-avatar-slot">
                  {row.first ? <AlmaFace size={28} mood={mood} still /> : null}
                </span>
              ) : null}
              <div className="persona-stack">
                <div className="persona-bubble">
                  {row.paragraphs.map((text, index) => (
                    <p key={index} className="alma-shell-text">
                      {text}
                    </p>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <footer className="composer-shell" aria-hidden="true">
        <div className="composer">
          <div className="composer-input">
            <textarea
              rows={1}
              readOnly
              tabIndex={-1}
              placeholder={t('thread.placeholder.message')}
            />
          </div>
          <div className="composer-controls">
            <span className="composer-spacer" />
            <button className="send" tabIndex={-1} disabled>
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
