import { useEffect, useRef } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import type { MessagePart } from '../relay'
import { thoughtLabel } from './streamingPresentation'
import { elapsedDuration } from './toolDurations'
import { useSharedSecond } from './useSharedSecond'
import { useT } from '../i18n'
export function ReasoningPart({
  part,
  live,
  duration,
}: {
  part: MessagePart
  live: boolean
  duration?: number
}) {
  const t = useT()
  const start = useRef<number>()
  if (live) start.current ??= Date.now()
  const now = useSharedSecond(live)
  const elapsed =
    start.current === undefined
      ? undefined
      : elapsedDuration(now, start.current)
  const tail = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (live && tail.current) tail.current.scrollTop = tail.current.scrollHeight
  }, [part.text, live])
  return (
    <details
      className={`reasoning ${live ? 'live' : ''}`}
      open={live || undefined}
      key={String(live)}
    >
      <summary>
        <Brain size={16} />
        {live ? (
          <span className="reasoning-label">
            <span>{t('message.reasoning.thinking')}</span>
            <time>{Math.floor((elapsed ?? 0) / 1000)}s</time>
          </span>
        ) : (
          thoughtLabel(duration, elapsed)
        )}
        <ChevronRight size={14} />
      </summary>
      <div className={live ? 'live-tail' : ''} ref={tail}>
        {part.text}
      </div>
    </details>
  )
}
