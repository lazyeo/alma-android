import { ArrowUp, Copy } from 'lucide-react'
import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react'
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
/** Older rows are cut short; they sit above the fold. */
const SHELL_TEXT_CHARS = 600
/** The newest rows keep their full length so the bottom matches the thread. */
const SHELL_TAIL_ROWS = 3
const SHELL_TAIL_CHARS = 4000

/**
 * A block as the thread's Markdown would lay it out, found by a line scan
 * (no parser): paragraphs join soft line breaks, list items and fenced code
 * keep their lines.
 */
export type ShellBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'pre'; text: string; language?: string }

export interface ShellRow {
  id: string
  side: PersonaSide
  first: boolean
  blocks: ShellBlock[]
  /** Entrance order: the newest message rises first. */
  stagger: number
}

const FENCE = /^\s*(?:```|~~~)\s*([\w+#.-]*)/
const ITEM = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+/

/** Splits message text into the blocks its Markdown would render. */
export function shellBlocks(source: string): ShellBlock[] {
  const blocks: ShellBlock[] = []
  let paragraph: string[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | undefined
  let code: string[] | undefined
  let language: string | undefined
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') })
    paragraph = []
    if (list) blocks.push(list)
    list = undefined
  }
  for (const line of source.split('\n')) {
    if (code) {
      if (FENCE.test(line)) {
        blocks.push({ kind: 'pre', text: code.join('\n'), language })
        code = undefined
      } else code.push(line)
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      code = []
      language = fence[1] || undefined
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const item = ITEM.exec(line)
    if (item) {
      const kind = item[1] ? 'ul' : 'ol'
      if (paragraph.length || (list && list.kind !== kind)) flush()
      list ??= { kind, items: [] }
      list.items.push(item[2].trim())
      continue
    }
    if (list) {
      // A lazy continuation line belongs to the item above it.
      const last = list.items.length - 1
      list.items[last] = `${list.items[last]} ${line.trim()}`
      continue
    }
    paragraph.push(line.replace(HEADING, '').trim())
  }
  if (code) blocks.push({ kind: 'pre', text: code.join('\n'), language })
  flush()
  return blocks
}

/** Bold and inline code, the inline marks that change a line's width. */
function inline(text: string): ReactNode {
  const pieces = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  if (pieces.length === 1) return text
  return pieces.map((piece, index) =>
    index % 2 === 0 ? (
      <Fragment key={index}>{piece}</Fragment>
    ) : piece.startsWith('**') ? (
      <strong key={index}>{piece.slice(2, -2)}</strong>
    ) : (
      <code key={index}>{piece.slice(1, -1)}</code>
    ),
  )
}

function ShellBlockView({ block }: { block: ShellBlock }) {
  const t = useT()
  if (block.kind === 'p') return <p>{inline(block.text)}</p>
  // The code block's chrome as CodeBlock draws it, without its handlers.
  if (block.kind === 'pre')
    return (
      <div className="code-block">
        <div className="code-block-header">
          <span className="code-block-language">
            {block.language ?? t('message.code.language')}
          </span>
          <span className="code-block-actions">
            <button type="button" className="code-block-copy" tabIndex={-1}>
              <Copy size={14} aria-hidden="true" />
              <span>{t('common.copy')}</span>
            </button>
          </span>
        </div>
        <pre>
          <code>{block.text}</code>
        </pre>
      </div>
    )
  const List = block.kind
  return (
    <List>
      {block.items.map((item, index) => (
        <li key={index}>{inline(item)}</li>
      ))}
    </List>
  )
}

/** The last cached messages, laid out like the messenger without Markdown. */
export function shellRows(rows: readonly MessageRow[], limit = SHELL_ROWS) {
  const roots = rootRows(rows as MessageRow[])
  const layout = personaLayout(roots)
  const start = Math.max(0, roots.length - limit)
  const result: ShellRow[] = []
  for (let index = start; index < roots.length; index++) {
    const row = roots[index]
    const chars =
      roots.length - index <= SHELL_TAIL_ROWS
        ? SHELL_TAIL_CHARS
        : SHELL_TEXT_CHARS
    const text = personaParts(row.message.parts)
      .body.map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
      .join('\n\n')
      .slice(0, chars)
      .trim()
    if (!text) continue
    result.push({
      id: row.id,
      side: layout[index].side,
      first: layout[index].first,
      blocks: shellBlocks(text),
      stagger: 0,
    })
  }
  const last = result.length - 1
  for (const [index, row] of result.entries())
    row.stagger = Math.min(last - index, SHELL_STAGGER_MAX)
  return result
}

/**
 * What /alma renders under the expand: Alma's real header, her latest
 * cached messages in the thread's bubble and Markdown classes (blocks from
 * a line scan, no parser), and an inert composer of the real idle size. It
 * costs a few milliseconds where the full thread costs tens; AlmaScreen
 * mounts the real thread behind it once the entrance has played and fades
 * the shell off it (almaHandoff.ts). Without a thread yet (setup is still
 * finding or creating it) it stands in empty, with `notice` in the list.
 */
export function AlmaShell({
  desktopId,
  threadId,
  backPath,
  notice,
}: {
  desktopId: string
  threadId?: string
  backPath: string
  notice?: ReactNode
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
    () =>
      threadId
        ? shellRows(threadCache.getThread(desktopId, threadId)?.rows ?? [])
        : [],
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
          {notice}
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
                  <div className="markdown-content">
                    {row.blocks.map((block, index) => (
                      <ShellBlockView key={index} block={block} />
                    ))}
                  </div>
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
