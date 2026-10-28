import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import { createLongPress } from './longPress'
import { haptic } from '../haptics'
/**
 * Android WebView can deliver its own contextmenu before our timer fires, and
 * the pointerdown that would have recorded the point may have been skipped
 * (press started on a nested control). Prefer the event's own coordinates and
 * fall back to the pressed element, never the stale or initial (0, 0) point.
 */
export function contextMenuPoint(
  event: { clientX: number; clientY: number; currentTarget: Element },
  recorded: { x: number; y: number },
) {
  if (event.clientX > 0 || event.clientY > 0)
    return { x: event.clientX, y: event.clientY }
  if (recorded.x > 0 || recorded.y > 0) return recorded
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: rect.right - 16, y: rect.top + rect.height / 2 }
}

export function useLongPress(
  action: (point: { x: number; y: number }) => void,
) {
  const latest = useRef(action),
    fired = useRef(false),
    point = useRef({ x: 0, y: 0 })
  latest.current = action
  const press = useMemo(
    () =>
      createLongPress(() => {
        fired.current = true
        void haptic('medium')
        latest.current(point.current)
      }),
    [],
  )
  useEffect(() => {
    window.addEventListener('scroll', press.cancel, true)
    return () => {
      window.removeEventListener('scroll', press.cancel, true)
      press.cancel()
    }
  }, [press])
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      fired.current = false
      if (
        event.button !== 0 ||
        (event.target as HTMLElement).closest(
          'button, a, input, textarea, summary',
        )
      )
        return
      point.current = { x: event.clientX, y: event.clientY }
      press.start(event.clientX, event.clientY)
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      press.move(event.clientX, event.clientY)
    },
    onPointerUp: press.cancel,
    onPointerCancel: press.cancel,
    onPointerLeave: press.cancel,
    onClickCapture(event: React.MouseEvent) {
      if (fired.current) {
        event.preventDefault()
        event.stopPropagation()
        fired.current = false
      }
    },
    onContextMenu(event: React.MouseEvent<HTMLElement>) {
      event.preventDefault()
      press.cancel()
      if (!fired.current) {
        void haptic('medium')
        latest.current(contextMenuPoint(event, point.current))
      }
    },
  }
}
