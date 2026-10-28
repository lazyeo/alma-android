import { useState } from 'react'
import type { MessageRow } from '../relay'
import { activityBarState, defaultActivityPhase } from './generationActivity'
import { HoldToStopButton } from './HoldToStopButton'
import { LoadingOrb } from './LoadingOrbCanvas'
import type { PendingAssistant } from './optimisticThread'
import { presenceClass, usePresence } from '../components/usePresence'
import { TodoProgressButton } from './TodoProgress'
import type { TodoProgress } from './threadTodos'
import { useSharedSecond } from './useSharedSecond'

/**
 * Persistent "still working" strip above the composer, ported from the
 * desktop ActivityOrb. It owns its clock so the per-second tick re-renders
 * only this bar, and it stops ticking while the page is hidden.
 */
export function GenerationActivityBar({
  generating,
  rows,
  pending,
  startedAt,
  todoProgress,
  onOpenTodos,
  onStop,
}: {
  generating: boolean
  rows: MessageRow[]
  pending?: PendingAssistant
  startedAt?: number
  todoProgress: TodoProgress
  onOpenTodos(): void
  onStop(): void
}) {
  const [documentVisible] = useState(
    () => document.visibilityState === 'visible',
  )
  const now = useSharedSecond(generating && documentVisible)
  const state = activityBarState({
    generating,
    rows,
    pending,
    startedAt,
    now,
    documentVisible,
  })
  const visible = state.visible || todoProgress.visible
  const presence = usePresence(visible)
  if (!presence.rendered) return null
  return (
    <div className={`activity-stack ${presenceClass(presence.phase)}`}>
      {todoProgress.visible ? (
        <TodoProgressButton progress={todoProgress} onOpen={onOpenTodos} />
      ) : null}
      {state.visible ? (
        <div className="activity-bar" role="status">
          <LoadingOrb size={20} />
          <span className="activity-bar-phase" aria-live="polite">
            {state.phase || defaultActivityPhase()}
          </span>
          {state.elapsed ? (
            <time className="activity-bar-elapsed">{state.elapsed}</time>
          ) : null}
          <span className="activity-bar-actions">
            <HoldToStopButton onStop={onStop} />
          </span>
        </div>
      ) : null}
    </div>
  )
}
