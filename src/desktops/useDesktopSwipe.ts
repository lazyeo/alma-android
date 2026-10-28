import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../haptics'
import { threadNavigationOptions } from '../layout/splitLayout'
import { overlayCount } from '../overlayStack'
import { suppressNextTap } from '../screens/ghostTap'
import type { DesktopSummary } from './DesktopContext'
import {
  desktopSwipeOffset,
  desktopSwipeTarget,
  wrapDesktopIndex,
  shouldClaimDesktopSwipe,
} from './desktopSwipe'

type Drag = {
  pointerId: number
  startX: number
  startY: number
  lastY: number
  lastAt: number
  velocityY: number
  claimed: boolean
  height: number
}

export function useDesktopSwipe(
  desktops: DesktopSummary[],
  desktopId: string,
  pathForDesktop: (desktopId: string) => string,
  pathname: string,
) {
  const navigate = useNavigate()
  const currentIndex = desktops.findIndex(
    (desktop) => desktop.pairing.id === desktopId,
  )
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)
  const dragRef = useRef<Drag | null>(null)
  const timerRef = useRef(0)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
    },
    [],
  )

  const finish = (targetIndex: number | null) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.claimed) return
    suppressNextTap()
    if (targetIndex === null) {
      if (reducedMotion) setOffset(0)
      else {
        setAnimate(true)
        setOffset(0)
      }
      return
    }
    const target = desktops[targetIndex]
    if (!target) return
    void haptic('selection')
    if (reducedMotion) {
      setOffset(0)
      const path = pathForDesktop(target.pairing.id)
      navigate(path, threadNavigationOptions(pathname, path))
      return
    }
    setAnimate(true)
    // Follow the finger, not the index: a wrap from last to first still
    // slides out upward.
    setOffset(drag.lastY < drag.startY ? -drag.height : drag.height)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setAnimate(false)
      setOffset(0)
      const path = pathForDesktop(target.pairing.id)
      navigate(path, threadNavigationOptions(pathname, path))
    }, 160)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (desktops.length <= 1 || overlayCount() > 0 || event.button !== 0) return
    window.clearTimeout(timerRef.current)
    setAnimate(false)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocityY: 0,
      claimed: false,
      height: event.currentTarget.getBoundingClientRect().height,
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.claimed) {
      if (!shouldClaimDesktopSwipe(dx, dy)) return
      drag.claimed = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    const now = performance.now()
    const elapsed = now - drag.lastAt
    if (elapsed > 0) drag.velocityY = (event.clientY - drag.lastY) / elapsed
    drag.lastY = event.clientY
    drag.lastAt = now
    setOffset(desktopSwipeOffset(dy, desktops.length > 1))
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    finish(
      desktopSwipeTarget(
        event.clientY - drag.startY,
        drag.velocityY,
        drag.height,
        currentIndex,
        desktops.length,
      ),
    )
  }
  const onPointerCancel = () => finish(null)

  const direction = offset < 0 ? 1 : -1
  const neighbor =
    desktops.length > 1
      ? desktops[wrapDesktopIndex(currentIndex + direction, desktops.length)]
      : undefined
  return {
    offset,
    neighbor,
    style: {
      '--desktop-swipe-y': `${offset}px`,
      '--desktop-swipe-direction': direction,
    } as CSSProperties,
    className: animate ? ' swiping-settle' : offset ? ' swiping' : '',
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  }
}
