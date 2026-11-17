import type { AlmaApi } from '../relay'

type FaviconSource = Pick<AlmaApi, 'getWorkspaceFavicon'>

interface CachedFavicon {
  icon: string | null
  /** The list round (reconnect / pull-to-refresh) the answer belongs to. */
  round: string
}

interface DesktopFavicons {
  icons: Map<string, CachedFavicon>
  pending: Map<string, Promise<string | null>>
}

// Workspace ids are only unique within one desktop, so each connection's API
// owns its own entries (as relayImages and the platform probe do).
const desktops = new WeakMap<FaviconSource, DesktopFavicons>()
// Data URLs are small but not free; a long project list stays well under this.
const LIMIT = 100

function favicons(api: FaviconSource) {
  let entry = desktops.get(api)
  if (!entry) {
    entry = { icons: new Map(), pending: new Map() }
    desktops.set(api, entry)
  }
  return entry
}

/** The last known answer for a workspace, `undefined` while unknown. */
export function peekWorkspaceFavicon(
  api: FaviconSource,
  workspaceId: string,
): string | null | undefined {
  return favicons(api).icons.get(workspaceId)?.icon
}

/**
 * The workspace's icon, fetched at most once per `round`. The API object
 * outlives reconnects and desktop restarts, so an answer is only trusted
 * within the round it was fetched in: a desktop updated to serve the route,
 * or an icon set since, shows up after the next reconnect or refresh, while
 * re-renders within a round never ask again (no storm on old desktops).
 */
export function getCachedWorkspaceFavicon(
  api: FaviconSource,
  workspaceId: string,
  round: string,
): Promise<string | null> {
  const { icons, pending } = favicons(api)
  const cached = icons.get(workspaceId)
  if (cached?.round === round) return Promise.resolve(cached.icon)
  const existing = pending.get(workspaceId)
  if (existing) return existing

  const request = api
    .getWorkspaceFavicon(workspaceId)
    .then(
      (icon) => {
        icons.delete(workspaceId)
        icons.set(workspaceId, { icon, round })
        while (icons.size > LIMIT) icons.delete(icons.keys().next().value!)
        return icon
      },
      (error) => {
        // Usually the relay dropping. Keep showing what was known and leave
        // this round unanswered so the next reconnect or refresh asks again.
        console.warn('Workspace favicon unavailable', error)
        return icons.get(workspaceId)?.icon ?? null
      },
    )
    .finally(() => pending.delete(workspaceId))
  pending.set(workspaceId, request)
  return request
}
