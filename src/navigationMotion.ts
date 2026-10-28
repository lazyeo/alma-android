import type { Location } from '@remix-run/router'
import type { LayoutMode } from './layout/splitLayout'

export type NavigationMotion =
  'none' | 'push' | 'pop' | 'fade' | 'shared-composer'

// GTD mirrors Threads: a list root with conversations pushed above it.
const threadList = /^\/d\/[^/]+\/(?:threads|gtd)\/?$/
const threadDetail = /^\/d\/[^/]+\/(?:threads|gtd)\/[^/]+\/?$/
const crystalList = /^\/d\/[^/]+\/crystals\/?$/
const crystalDetail = /^\/d\/[^/]+\/crystals\/[^/]+\/?$/

function depth(pathname: string) {
  if (threadDetail.test(pathname) || crystalDetail.test(pathname)) return 2
  if (pathname === '/pair') return 2
  if (
    threadList.test(pathname) ||
    crystalList.test(pathname) ||
    pathname === '/inbox' ||
    pathname === '/settings'
  )
    return 1
  return 0
}

function desktopId(pathname: string) {
  return pathname.match(/^\/d\/([^/]+)/)?.[1]
}

function sameHierarchy(from: string, to: string) {
  return (
    (threadList.test(from) && threadDetail.test(to)) ||
    (threadDetail.test(from) && threadList.test(to)) ||
    (crystalList.test(from) && crystalDetail.test(to)) ||
    (crystalDetail.test(from) && crystalList.test(to)) ||
    (from === '/settings' && to === '/pair') ||
    (from === '/pair' && to === '/settings')
  )
}

function isRootSibling(pathname: string) {
  return (
    threadList.test(pathname) ||
    crystalList.test(pathname) ||
    pathname === '/inbox' ||
    pathname === '/settings'
  )
}

export function decideNavigationMotion(
  from: Pick<Location, 'pathname' | 'search' | 'state'>,
  to: Pick<Location, 'pathname' | 'search' | 'state'>,
  action: 'POP' | 'PUSH' | 'REPLACE',
  delta: number | null,
  layoutMode: LayoutMode,
): NavigationMotion {
  if (
    action === 'REPLACE' &&
    (to.state as { navigationMotion?: string } | null)?.navigationMotion ===
      'shared-composer'
  )
    return 'shared-composer'
  if (action === 'REPLACE' || from.pathname === to.pathname) return 'none'

  if (action === 'POP' && delta) return delta < 0 ? 'pop' : 'push'

  const fromDesktop = desktopId(from.pathname)
  const toDesktop = desktopId(to.pathname)
  if (fromDesktop && toDesktop && fromDesktop !== toDesktop) return 'fade'

  if (
    layoutMode === 'split' &&
    threadDetail.test(from.pathname) &&
    threadDetail.test(to.pathname)
  )
    return 'fade'

  if (sameHierarchy(from.pathname, to.pathname))
    return depth(to.pathname) > depth(from.pathname) ? 'push' : 'pop'

  if (isRootSibling(from.pathname) && isRootSibling(to.pathname)) return 'fade'

  const fromDepth = depth(from.pathname)
  const toDepth = depth(to.pathname)
  if (fromDepth && toDepth && fromDepth !== toDepth)
    return toDepth > fromDepth ? 'push' : 'pop'

  return 'fade'
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let lastScrollAt = 0
export function installScrollMotionGuard() {
  const mark = () => {
    lastScrollAt = performance.now()
  }
  window.addEventListener('scroll', mark, { capture: true, passive: true })
  window.addEventListener('touchmove', mark, { capture: true, passive: true })
  return () => {
    window.removeEventListener('scroll', mark, true)
    window.removeEventListener('touchmove', mark, true)
  }
}

export function isGestureScrolling() {
  return performance.now() - lastScrollAt < 140
}
