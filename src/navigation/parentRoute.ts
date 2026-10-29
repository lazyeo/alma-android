import type { LayoutMode } from '../layout/splitLayout'

function desktopRoute(pathname: string) {
  const match = /^\/d\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?\/?$/.exec(pathname)
  if (!match) return undefined
  const encodedDesktopId = match[1]
  return {
    encodedDesktopId,
    desktopId: decodeURIComponent(encodedDesktopId),
    section: match[2],
    detail: match[3],
    home: `/d/${encodedDesktopId}/threads`,
  }
}

/**
 * Route hierarchy used by hardware and header Back. Remote screen remembers
 * an explicit same-desktop origin when supplied; otherwise it belongs to Herdr.
 */
export function parentRoute(
  pathname: string,
  layout: LayoutMode,
  screenOrigin?: string,
): string | null {
  const route = desktopRoute(pathname)
  if (!route) {
    if (pathname === '/' || pathname === '/threads') return null
    if (pathname === '/settings') {
      const origin = screenOrigin ? desktopRoute(screenOrigin) : undefined
      return origin?.home ?? '/threads'
    }
    return '/threads'
  }

  const { encodedDesktopId, section, detail, home } = route
  if (!section || section === 'threads') {
    if (detail && layout === 'single') return home
    return null
  }

  if (layout === 'split') return home

  if (section === 'screen') {
    if (screenOrigin === '/settings') return screenOrigin
    const origin = screenOrigin ? desktopRoute(screenOrigin) : undefined
    if (origin?.desktopId === route.desktopId) return screenOrigin ?? null
    return `/d/${encodedDesktopId}/agents`
  }

  if (detail) return `/d/${encodedDesktopId}/${section}`
  return home
}
