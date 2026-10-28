import { Square } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  beginStopHold,
  calculateStopHoldOffset,
  STOP_HOLD_MS,
  updateStopHold,
  type StopHoldState,
} from './stopHold'
import { suppressNextTap } from './ghostTap'

// Real user-unit dash lengths: Android WebView did not draw the progress
// when it was normalised with pathLength="1".
const RING_RADIUS = 16
const RING_STROKE = 4
const RING_SCALE = 2.2
const RING_VIEWBOX_SIZE = 40
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const RING_VISUAL_RADIUS = (RING_VIEWBOX_SIZE / 2) * RING_SCALE

const EMPTY_HOLD: StopHoldState = {
  active: false,
  startedAt: 0,
  progress: 0,
}

export function HoldToStopButton({ onStop }: { onStop(): void }) {
  const t = useT()
  const [hold, setHold] = useState(EMPTY_HOLD)
  const [hint, setHint] = useState(false)
  const [hintPosition, setHintPosition] = useState({ left: 0, bottom: 0 })
  const [finishing, setFinishing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const holdRef = useRef(hold)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef(0)
  const hintTimerRef = useRef(0)
  holdRef.current = hold

  const positionHint = useCallback(() => {
    const pane = buttonRef.current?.closest('.thread-detail')
    const activity = buttonRef.current?.closest('.activity-bar')
    if (!(pane instanceof HTMLElement) || !(activity instanceof HTMLElement))
      return
    const paneRect = pane.getBoundingClientRect()
    const activityRect = activity.getBoundingClientRect()
    setHintPosition({
      left: paneRect.left + paneRect.width / 2,
      bottom: window.innerHeight - activityRect.top + 14,
    })
  }, [])

  const showHint = useCallback(() => {
    void haptic('selection')
    positionHint()
    window.clearTimeout(hintTimerRef.current)
    setHint(true)
    hintTimerRef.current = window.setTimeout(() => setHint(false), 1400)
  }, [positionHint])

  const apply = useCallback(
    (event: Parameters<typeof updateStopHold>[1]) => {
      const result = updateStopHold(holdRef.current, event)
      holdRef.current = result.state
      setHold(result.state)
      if (result.effect === 'stop') {
        window.clearTimeout(hintTimerRef.current)
        setHint(false)
        setFinishing(true)
        window.setTimeout(() => setFinishing(false), 260)
        void haptic('medium')
        suppressNextTap()
        onStop()
      } else if (result.effect === 'hint') showHint()
    },
    [onStop, showHint],
  )

  useEffect(() => {
    if (!hold.active) return
    const tick = (now: number) => {
      apply({ type: 'tick', now })
      if (holdRef.current.active) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [apply, hold.active])
  useEffect(() => {
    if (!hint && !hold.active) return
    const reposition = () => positionHint()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [hint, hold.active, positionHint])
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(hintTimerRef.current)
    },
    [],
  )

  const start = (origin?: { x: number; y: number }) => {
    if (holdRef.current.active) return
    const buttonRect = buttonRef.current?.getBoundingClientRect()
    const rootStyle = getComputedStyle(document.documentElement)
    const safeArea = {
      top: Number.parseFloat(rootStyle.getPropertyValue('--safe-top')) || 0,
      right: Number.parseFloat(rootStyle.getPropertyValue('--safe-right')) || 0,
      bottom:
        Number.parseFloat(rootStyle.getPropertyValue('--safe-bottom')) || 0,
      left: Number.parseFloat(rootStyle.getPropertyValue('--safe-left')) || 0,
    }
    setOffset(
      buttonRect
        ? calculateStopHoldOffset({
            center: {
              x: buttonRect.left + buttonRect.width / 2,
              y: buttonRect.top + buttonRect.height / 2,
            },
            radius: RING_VISUAL_RADIUS,
            viewport: {
              width: document.documentElement.clientWidth,
              height: document.documentElement.clientHeight,
            },
            safeArea,
          })
        : { x: 0, y: 0 },
    )
    const next = beginStopHold(performance.now(), origin)
    holdRef.current = next
    setHold(next)
    // The hint is shown for the whole hold and fills with it; `hint` only
    // keeps it up briefly after an early release.
    window.clearTimeout(hintTimerRef.current)
    setHint(false)
    positionHint()
  }
  const pointerStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    start({ x: event.clientX, y: event.clientY })
  }
  return (
    <span
      className={`hold-stop-wrap${hold.active ? ' holding' : ''}${finishing ? ' finishing' : ''}`}
      style={
        {
          '--stop-offset-x': `${offset.x}px`,
          '--stop-offset-y': `${offset.y}px`,
        } as CSSProperties
      }
    >
      <button
        ref={buttonRef}
        type="button"
        className="activity-bar-stop"
        aria-label={t('composer.stop.label')}
        aria-description={t('composer.stop.description', { ms: STOP_HOLD_MS })}
        onPointerDown={pointerStart}
        onPointerMove={(event) =>
          apply({
            type: 'move',
            now: performance.now(),
            point: { x: event.clientX, y: event.clientY },
          })
        }
        onPointerUp={() => apply({ type: 'release', now: performance.now() })}
        onPointerCancel={() =>
          apply({ type: 'cancel', now: performance.now() })
        }
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
            event.preventDefault()
            start()
          }
        }}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            apply({ type: 'release', now: performance.now() })
          }
        }}
        onBlur={() => apply({ type: 'cancel', now: performance.now() })}
        onClick={(event) => event.preventDefault()}
      >
        <svg className="stop-hold-ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle className="stop-hold-track" cx="20" cy="20" r={RING_RADIUS} />
          <circle
            className="stop-hold-progress"
            cx="20"
            cy="20"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - hold.progress)}
          />
        </svg>
        <Square size={14} fill="currentColor" strokeWidth={2} />
      </button>
      {createPortal(
        <span
          className={`stop-hold-hint${hold.active || hint ? ' visible' : ''}${hold.active ? ' holding' : ''}`}
          style={
            {
              left: hintPosition.left,
              bottom: hintPosition.bottom,
              '--hold-progress': hold.progress,
            } as CSSProperties
          }
          role="status"
          aria-live="polite"
        >
          {t('composer.stop.hint')}
        </span>,
        document.body,
      )}
    </span>
  )
}
