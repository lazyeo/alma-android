import type { Location } from '@remix-run/router'
import type { LayoutMode } from './layout/splitLayout'

export type NavigationMotion =
  'none' | 'push' | 'pop' | 'fade' | 'shared-composer' | 'alma'

// GTD mirrors Threads: a list with conversations pushed above it.
const threadList = /^\/d\/[^/]+\/(?:threads|gtd)\/?$/
const threadDetail = /^\/d\/[^/]+\/(?:threads|gtd)\/[^/]+\/?$/
const threadsList = /^\/d\/[^/]+\/threads\/?$/
const gtdList = /^\/d\/[^/]+\/gtd\/?$/
const gtdDetail = /^\/d\/[^/]+\/gtd\/[^/]+\/?$/
const crystalList = /^\/d\/[^/]+\/crystals\/?$/
const crystalDetail = /^\/d\/[^/]+\/crystals\/[^/]+\/?$/
const almaRoute = /^\/d\/[^/]+\/alma\/?$/

/**
 * On phones GTD and Settings open from the Threads header, one level above
 * it; in split view they are rail roots beside Threads.
 */
function headerChild(pathname: string, layoutMode: LayoutMode) {
  return (
    layoutMode === 'single' &&
    (gtdList.test(pathname) || pathname === '/settings')
  )
}

function depth(pathname: string, layoutMode: LayoutMode) {
  const lift = layoutMode === 'single' ? 1 : 0
  if (gtdDetail.test(pathname)) return 2 + lift
  if (pathname === '/pair') return 2 + lift
  if (threadDetail.test(pathname) || crystalDetail.test(pathname)) return 2
  if (headerChild(pathname, layoutMode)) return 2
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

function sameHierarchy(from: string, to: string, layoutMode: LayoutMode) {
  const headerPair = (parent: string, child: string) =>
    (threadsList.test(parent) || parent === '/threads') &&
    headerChild(child, layoutMode)
  return (
    (threadList.test(from) && threadDetail.test(to)) ||
    (threadDetail.test(from) && threadList.test(to)) ||
    (crystalList.test(from) && crystalDetail.test(to)) ||
    (crystalDetail.test(from) && crystalList.test(to)) ||
    headerPair(from, to) ||
    headerPair(to, from) ||
    (from === '/settings' && to === '/pair') ||
    (from === '/pair' && to === '/settings')
  )
}

function isRootSibling(pathname: string, layoutMode: LayoutMode) {
  if (headerChild(pathname, layoutMode)) return false
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
  // Entering or leaving Alma flies her avatar between nav and header, for
  // pushes, history pops, and the replace that hardware Back performs.
  if (
    from.pathname !== to.pathname &&
    almaRoute.test(from.pathname) !== almaRoute.test(to.pathname)
  )
    return 'alma'
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

  if (sameHierarchy(from.pathname, to.pathname, layoutMode))
    return depth(to.pathname, layoutMode) > depth(from.pathname, layoutMode)
      ? 'push'
      : 'pop'

  if (
    isRootSibling(from.pathname, layoutMode) &&
    isRootSibling(to.pathname, layoutMode)
  )
    return 'fade'

  const fromDepth = depth(from.pathname, layoutMode)
  const toDepth = depth(to.pathname, layoutMode)
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
