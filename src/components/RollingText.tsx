import { useEffect, useState } from 'react'
import { FADE_EXIT_MS } from '../motionTokens'

type Line = { id: number; text: string }

type RollingState = { current: Line; previous?: Line }

export function nextRolling(state: RollingState, text: string): RollingState {
  if (text === state.current.text) return state
  return {
    current: { id: state.current.id + 1, text },
    previous: state.current,
  }
}

/**
 * A one-line status word that rolls to its next value inside a fixed slot:
 * the old word rises out and fades while the new one rises in under it. The
 * slot sizes to the new word only, so neighbours move once, not twice. The
 * word on screen at mount appears without a roll.
 */
export function RollingText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const [state, setState] = useState<RollingState>(() => ({
    current: { id: 0, text },
  }))
  // Derive during render so the new word and the outgoing one paint together.
  const next = nextRolling(state, text)
  if (next !== state) setState(next)

  const previousId = state.previous?.id
  useEffect(() => {
    if (previousId === undefined) return
    const timer = window.setTimeout(
      () =>
        setState((current) =>
          current.previous?.id === previousId
            ? { current: current.current }
            : current,
        ),
      FADE_EXIT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [previousId])

  return (
    <span className={`rolling-text${className ? ` ${className}` : ''}`}>
      {state.previous ? (
        <span
          key={state.previous.id}
          className="rolling-text-line rolling-text-previous"
          aria-hidden="true"
        >
          {state.previous.text}
        </span>
      ) : null}
      <span
        key={state.current.id}
        className={`rolling-text-line${state.current.id ? ' rolling-text-current' : ''}`}
      >
        {state.current.text}
      </span>
    </span>
  )
}
