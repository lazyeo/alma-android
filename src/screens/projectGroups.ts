import type { Thread, Workspace } from '../relay'
import { workspaceName } from './workspaceOptions'
export const projectPathBasename = (path?: string): string => {
  const parts = path
    ?.replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
  return parts?.at(-1) || 'Project'
}

export const activityTime = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}
export function groupProjects(threads: Thread[], workspaces: Workspace[]) {
  const groups = new Map<
    string,
    {
      id: string
      name: string
      pathBasename: string
      count: number
      latestActivity: number
    }
  >()
  const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  for (const thread of threads) {
    if (thread.parentThreadId || thread.isIncognito) continue
    const id =
      thread.workspaceId && knownWorkspaceIds.has(thread.workspaceId)
        ? thread.workspaceId
        : 'none'
    const workspace = workspaces.find((item) => item.id === id)
    const group = groups.get(id) ?? {
      id,
      name: workspaceName(id === 'none' ? undefined : id, workspaces),
      pathBasename: workspace
        ? projectPathBasename(workspace.path)
        : 'Unassigned',
      count: 0,
      latestActivity: 0,
    }
    group.count++
    group.latestActivity = Math.max(
      group.latestActivity,
      activityTime(thread.updatedAt ?? thread.createdAt),
    )
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.id === 'none') return 1
    if (b.id === 'none') return -1
    return b.latestActivity - a.latestActivity || a.name.localeCompare(b.name)
  })
}
