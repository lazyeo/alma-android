import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import { createLongPress } from './longPress'
import { haptic } from '../haptics'
import { armLongPressLift, disarmLongPressLift } from './longPressLift'
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

/**
 * A context menu from a touch or mouse press lifts the row; one from the
 * keyboard (Shift+F10, the menu key) does not. Chromium reports keyboard
 * menus with an empty pointerType; older engines with (0, 0) coordinates.
 */
export function isPointerContextMenu(event: {
  clientX: number
  clientY: number
  nativeEvent?: Event
}) {
  const pointerType: unknown = (
    event.nativeEvent as { pointerType?: unknown } | undefined
  )?.pointerType
  if (typeof pointerType === 'string') return pointerType !== ''
  return event.clientX > 0 || event.clientY > 0
}

/**
 * `preview`: the pressed element is a message, shown as a reduced preview
 * card while its actions are open (see longPressLift.ts).
 */
export function useLongPress(
  action: (point: { x: number; y: number }) => void,
  { preview = false }: { preview?: boolean } = {},
) {
  const latest = useRef(action),
    fired = useRef(false),
    point = useRef({ x: 0, y: 0 }),
    source = useRef<HTMLElement | null>(null),
    previewRef = useRef(preview)
  latest.current = action
  previewRef.current = preview
  const press = useMemo(
    () =>
      createLongPress(() => {
        fired.current = true
        // The lift that follows reuses this tick; it never adds its own.
        void haptic('medium')
        if (source.current)
          armLongPressLift(source.current, { preview: previewRef.current })
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
      // Nested controls keep their own press; the row itself may be a button.
      const control = (event.target as HTMLElement).closest(
        'button, a, input, textarea, summary',
      )
      if (event.button !== 0 || (control && control !== event.currentTarget))
        return
      point.current = { x: event.clientX, y: event.clientY }
      source.current = event.currentTarget
      disarmLongPressLift()
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
        if (isPointerContextMenu(event))
          armLongPressLift(event.currentTarget, {
            preview: previewRef.current,
          })
        else disarmLongPressLift()
        latest.current(contextMenuPoint(event, point.current))
      }
    },
  }
}
