import type { HerdrPane, HerdrSnapshot } from './model'

/**
 * Other computers the paired desktop reaches for Herdr (desktop 0.4.567):
 * `GET /api/herdr/computers` → `{computers:[{id,label,state}]}`, and
 * `/api/herdr/computers/<id>/<path>` forwards to that computer's
 * `/api/herdr/<path>`. Only JSON HTTP is forwarded: no WebSocket, no
 * binary bodies (uploads arrive empty, images come back as JSON errors).
 */
export interface HerdrComputer {
  id: string
  label: string
  /** "ready" when reachable; other values come from the desktop's tunnel. */
  state: string
}

export type HerdrComputersResult =
  | { status: 'ok'; computers: HerdrComputer[] }
  /** Desktop predates the route: hide the switcher. */
  | { status: 'unsupported' }
  /** 503 computers_unavailable: the desktop's native shell isn't attached. */
  | { status: 'unavailable' }

export const herdrComputerIdPattern = /^[a-f0-9]{16}$/

export function parseHerdrComputers(json: unknown): HerdrComputer[] {
  const list =
    json && typeof json === 'object' && 'computers' in json
      ? (json as { computers?: unknown }).computers
      : undefined
  if (!Array.isArray(list)) return []
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const { id, label, state } = item as Record<string, unknown>
    if (typeof id !== 'string' || !herdrComputerIdPattern.test(id)) return []
    return [
      {
        id,
        label: typeof label === 'string' && label.trim() ? label.trim() : id,
        state: typeof state === 'string' ? state : 'unknown',
      },
    ]
  })
}

const storagePrefix = 'alma.herdr.computer.'

const safeStorage = () => {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

/** The remembered computer for one paired desktop; null means this desktop. */
export function loadSelectedComputer(desktopId: string): string | null {
  try {
    return safeStorage()?.getItem(`${storagePrefix}${desktopId}`) ?? null
  } catch {
    return null
  }
}

export function saveSelectedComputer(desktopId: string, computerId?: string) {
  try {
    const storage = safeStorage()
    if (computerId) storage?.setItem(`${storagePrefix}${desktopId}`, computerId)
    else storage?.removeItem(`${storagePrefix}${desktopId}`)
  } catch {
    /* the choice just isn't remembered */
  }
}

/**
 * The computer Herdr requests go to. `computers` is undefined until the
 * desktop's list first loads: the remembered computer is trusted meanwhile,
 * so a cold start or deep link never briefly shows the desktop's own panes
 * under another computer's pane ids. Once loaded, a computer the desktop
 * doesn't list (removed, older desktop: null) falls back to the desktop
 * itself without forgetting the choice.
 */
export function effectiveComputer(
  computers: HerdrComputer[] | null | undefined,
  selected: string | null | undefined,
): string | undefined {
  if (!selected || computers === null) return undefined
  if (computers === undefined) return selected
  return computers.some((computer) => computer.id === selected)
    ? selected
    : undefined
}

/**
 * Remote computers have no snapshot socket, so the board polls
 * `GET /api/herdr/workspaces` (a reduced snapshot) and rebuilds the parts
 * the agent list reads.
 */
export function snapshotFromWorkspaces(json: unknown): HerdrSnapshot {
  const list =
    json && typeof json === 'object' && 'workspaces' in json
      ? (json as { workspaces?: unknown }).workspaces
      : undefined
  const snapshot: Required<
    Pick<HerdrSnapshot, 'workspaces' | 'tabs' | 'panes'>
  > = { workspaces: [], tabs: [], panes: [] }
  if (!Array.isArray(list)) return snapshot
  const tabs = new Set<string>()
  for (const workspace of list) {
    if (!workspace || typeof workspace !== 'object') continue
    const record = workspace as Record<string, unknown>
    if (typeof record.workspace_id !== 'string') continue
    const workspaceId = record.workspace_id
    snapshot.workspaces.push({
      workspace_id: workspaceId,
      ...(typeof record.label === 'string' ? { label: record.label } : {}),
    })
    for (const chat of Array.isArray(record.chats) ? record.chats : []) {
      if (!chat || typeof chat !== 'object') continue
      const item = chat as Record<string, unknown>
      if (typeof item.pane_id !== 'string') continue
      const tabId = typeof item.tab_id === 'string' ? item.tab_id : undefined
      if (tabId && !tabs.has(tabId)) {
        tabs.add(tabId)
        snapshot.tabs.push({
          tab_id: tabId,
          workspace_id: workspaceId,
          ...(typeof item.tab === 'string' ? { label: item.tab } : {}),
        })
      }
      const pane: HerdrPane = {
        pane_id: item.pane_id,
        workspace_id: workspaceId,
        agent: typeof item.agent === 'string' ? item.agent : null,
        agent_status: typeof item.status === 'string' ? item.status : 'unknown',
      }
      if (tabId) pane.tab_id = tabId
      if (typeof item.title === 'string') pane.title = item.title
      if (typeof item.cwd === 'string') pane.cwd = item.cwd
      snapshot.panes.push(pane)
    }
  }
  return snapshot
}

/** Poll interval for a remote computer: quick while an agent works. */
export function remotePollDelay(snapshot: HerdrSnapshot | undefined) {
  return snapshot?.panes?.some((pane) => pane.agent_status === 'working')
    ? 2_000
    : 10_000
}
