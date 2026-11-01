import { Square } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useSharedSecond } from '../screens/useSharedSecond'
import type { HerdrChatItem } from './toMessageParts'

const elapsedClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1_000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function unfinishedTool(items: HerdrChatItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const tool = items[index].tool
    if (!tool || tool.done !== false) continue
    return [tool.name, tool.summary].filter(Boolean).join(' ')
  }
  return ''
}

export function HerdrWorkingBar({
  working,
  items,
  statusText,
  statusStartedAt,
  leading,
  onStop,
}: {
  working: boolean
  items: HerdrChatItem[]
  statusText?: string
  statusStartedAt?: number
  leading?: ReactNode
  onStop(): void
}) {
  const t = useT()
  const observedStart = useRef(Date.now())
  const wasWorking = useRef(false)
  if (working && !wasWorking.current) observedStart.current = Date.now()
  wasWorking.current = working
  const [visible] = useState(() => document.visibilityState === 'visible')
  const now = useSharedSecond(working && visible)
  if (!working && !leading) return null
  const startedAt = statusStartedAt ?? observedStart.current
  const activity = statusText || unfinishedTool(items) || t('agents.working')
  return (
    <div className="activity-bar agent-working-bar" role="status">
      {leading}
      {working ? (
        <>
          <span className="activity-bar-phase agent-working-phase">
            {activity}
          </span>
          <time className="activity-bar-elapsed">
            {elapsedClock(now - startedAt)}
          </time>
          <span className="activity-bar-actions">
            <button
              className="agent-working-stop"
              aria-label={t('agents.stop')}
              onClick={onStop}
            >
              <Square size={10} fill="currentColor" />
              <span>{t('agents.stop')}</span>
            </button>
          </span>
        </>
      ) : null}
    </div>
  )
}
