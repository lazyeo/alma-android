import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'
import { haptic } from '../haptics'
import { overlayCount } from '../overlayStack'
import {
  canScrollableAncestorConsume,
  shouldClaimSidebarSwipe,
  shouldCommitSidebarSwipe,
  sidebarSwipeProgress,
} from './sidebarSwipe'

type Drag = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastAt: number
  velocityX: number
  claimed: boolean
  fullWidth: number
  target: EventTarget | null
}

// GTD rows own horizontal swipes (status actions) inside the sidebar.
const BLOCKED_TARGETS =
  'input, textarea, [contenteditable="true"], .queue-item, .activity-bar-stop, .gtd-swipe-row'

export function useSidebarSwipe(
  shellRef: RefObject<HTMLDivElement | null>,
  collapsed: boolean,
  setCollapsed: (collapsed: boolean) => void,
) {
  const dragRef = useRef<Drag | null>(null)
  const collapsedRef = useRef(collapsed)
  const setCollapsedRef = useRef(setCollapsed)
  collapsedRef.current = collapsed
  setCollapsedRef.current = setCollapsed
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const settleFollow = (
    startWidth: number,
    startProgress: number,
    targetOpen: boolean,
  ) => {
    const shell = shellRef.current
    if (!shell) return
    if (reducedMotion) {
      shell.classList.remove('sidebar-swiping', 'sidebar-swipe-settle')
      shell.style.removeProperty('--sidebar-swipe-width')
      shell.style.removeProperty('--sidebar-swipe-progress')
      return
    }
    shell.style.setProperty('--sidebar-swipe-width', `${startWidth}px`)
    shell.style.setProperty('--sidebar-swipe-progress', String(startProgress))
    shell.classList.add('sidebar-swipe-settle')
    shell.classList.remove('sidebar-swiping')
    void shell.offsetWidth
    requestAnimationFrame(() => {
      shell.style.setProperty(
        '--sidebar-swipe-width',
        targetOpen
          ? `${shell.querySelector<HTMLElement>('.split-sidebar-content')?.offsetWidth ?? startWidth}px`
          : '0px',
      )
      shell.style.setProperty(
        '--sidebar-swipe-progress',
        targetOpen ? '1' : '0',
      )
    })
    window.setTimeout(() => {
      shell.classList.remove('sidebar-swipe-settle')
      shell.style.removeProperty('--sidebar-swipe-width')
      shell.style.removeProperty('--sidebar-swipe-progress')
    }, 250)
  }

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const onTouchMove = (event: TouchEvent) => {
      if (dragRef.current?.claimed) event.preventDefault()
    }
    shell.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => shell.removeEventListener('touchmove', onTouchMove)
  }, [shellRef])

  const startAllowed = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.clientX < 24 || overlayCount() > 0) return false
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest(BLOCKED_TARGETS)) return false
    const rail = target?.closest('.split-rail')
    const sidebar = target?.closest('.split-sidebar')
    const main = target?.closest('.split-main')
    if (!collapsedRef.current) return Boolean(rail || sidebar)
    if (rail) return true
    if (!main) return false
    const rect = main.getBoundingClientRect()
    return event.clientX <= rect.left + rect.width * 0.4
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !startAllowed(event)) return
    const sidebar = shellRef.current?.querySelector('.split-sidebar')
    const sidebarContent = shellRef.current?.querySelector(
      '.split-sidebar-content',
    )
    const fullWidth =
      sidebar instanceof HTMLElement &&
      sidebar.getBoundingClientRect().width > 0
        ? sidebar.getBoundingClientRect().width
        : sidebarContent instanceof HTMLElement
          ? sidebarContent.offsetWidth
          : 0
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      claimed: false,
      fullWidth,
      target: event.target,
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.claimed) {
      if (!shouldClaimSidebarSwipe(dx, dy, collapsedRef.current)) return
      if (canScrollableAncestorConsume(drag.target, dx)) {
        dragRef.current = null
        return
      }
      drag.claimed = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    const now = performance.now()
    const elapsed = now - drag.lastAt
    if (elapsed > 0) drag.velocityX = (event.clientX - drag.lastX) / elapsed
    drag.lastX = event.clientX
    drag.lastAt = now
    if (reducedMotion) return
    const progress = sidebarSwipeProgress(
      dx,
      drag.fullWidth,
      collapsedRef.current,
    )
    const shell = shellRef.current
    if (!shell) return
    shell.classList.add('sidebar-swiping')
    shell.style.setProperty(
      '--sidebar-swipe-width',
      `${drag.fullWidth * progress}px`,
    )
    shell.style.setProperty('--sidebar-swipe-progress', String(progress))
  }
  const finish = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.claimed) return
    const wasCollapsed = collapsedRef.current
    const progress = sidebarSwipeProgress(
      drag.lastX - drag.startX,
      drag.fullWidth,
      wasCollapsed,
    )
    const commit =
      !cancelled &&
      shouldCommitSidebarSwipe(progress, drag.velocityX, wasCollapsed)
    const targetCollapsed = commit ? !wasCollapsed : wasCollapsed
    const startWidth = reducedMotion
      ? targetCollapsed
        ? 0
        : drag.fullWidth
      : drag.fullWidth * progress
    if (commit) {
      void haptic('selection')
      flushSync(() => setCollapsedRef.current(targetCollapsed))
    }
    settleFollow(
      startWidth,
      reducedMotion ? (targetCollapsed ? 0 : 1) : progress,
      !targetCollapsed,
    )
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) =>
      finish(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) =>
      finish(event, true),
  }
}
