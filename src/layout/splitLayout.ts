import { desktopGtdPath, desktopThreadsPath } from '../desktopRoutes'

// Below this width a thread is a full-screen page; at or above it the list
// stays beside the open thread.
export const SPLIT_MIN_WIDTH = 720

export type LayoutMode = 'single' | 'split'
export type SplitSidebarSection = 'threads' | 'gtd' | 'agents'

export function splitSidebarSection(pathname: string): SplitSidebarSection {
  if (/^\/d\/[^/]+\/agents(?:\/|$)/.test(pathname)) return 'agents'
  if (/^\/d\/[^/]+\/gtd(?:\/|$)/.test(pathname)) return 'gtd'
  return 'threads'
}

export function layoutModeForWidth(width: number): LayoutMode {
  return width >= SPLIT_MIN_WIDTH ? 'split' : 'single'
}

/** Thread lists that keep an opened conversation beside them. */
export type ThreadListSection = 'threads' | 'gtd'

export function threadRouteMatch(pathname: string):
  | {
      desktopId: string
      section: ThreadListSection
      threadId?: string
    }
  | undefined {
  const match = /^\/d\/([^/]+)\/(threads|gtd)(?:\/([^/]+))?\/?$/.exec(pathname)
  if (!match) return undefined
  return {
    desktopId: decodeURIComponent(match[1]),
    section: match[2] as ThreadListSection,
    ...(match[3] ? { threadId: decodeURIComponent(match[3]) } : {}),
  }
}

export function threadListPath(desktopId: string, section: ThreadListSection) {
  return section === 'gtd'
    ? desktopGtdPath(desktopId)
    : desktopThreadsPath(desktopId)
}

/** List/sidebar thread switches replace the currently open detail entry. */
export function threadNavigationOptions(pathname: string, targetPath: string) {
  const current = threadRouteMatch(pathname)
  const target = threadRouteMatch(targetPath)
  return current?.threadId && target ? { replace: true as const } : {}
}
