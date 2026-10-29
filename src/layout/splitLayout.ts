import {
  desktopGtdPath,
  desktopThreadsPath,
  isRootPath,
} from '../desktopRoutes'

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

export type BackDecision =
  { kind: 'exit' } | { kind: 'pop' } | { kind: 'navigate'; to: string }

/** Android hardware Back. */
export function decideBack(
  pathname: string,
  canGoBack: boolean,
  mode: LayoutMode,
): BackDecision {
  if (isRootPath(pathname)) return { kind: 'exit' }
  const thread = threadRouteMatch(pathname)
  // Two panes: Back closes the detail pane rather than replaying every
  // thread visited from the always-visible list.
  if (thread?.threadId && (mode === 'split' || !canGoBack))
    return {
      kind: 'navigate',
      to: threadListPath(thread.desktopId, thread.section),
    }
  if (canGoBack) return { kind: 'pop' }
  return { kind: 'navigate', to: '/' }
}
