import { useEffect, useRef } from 'react'
import { haptic } from '../haptics'

export const SNACKBAR_DURATION_MS = 5000

/**
 * One short confirmation with an optional single action (usually Undo).
 * Non-modal: it never takes focus or joins the overlay stack, so Back still
 * navigates. A new `message` restarts the timer.
 */
export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = SNACKBAR_DURATION_MS,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  durationMs?: number
}) {
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(), durationMs)
    return () => window.clearTimeout(timer)
  }, [message, durationMs])
  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span className="snackbar-message">{message}</span>
      {actionLabel && onAction ? (
        <button
          className="snackbar-action"
          onClick={() => {
            void haptic('light')
            onAction()
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
