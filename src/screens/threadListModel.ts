import type { Thread, Workspace } from '../relay'
import { activityTime, groupProjects } from './projectGroups'
import { workspaceName } from './workspaceOptions'

export const searchableThreads = (threads: Thread[]) =>
  threads.filter((thread) => !thread.parentThreadId && !thread.isIncognito)

export function filterThreadList(
  threads: Thread[],
  workspaces: Workspace[],
  query: string,
  workspaceId = 'all',
) {
  const needle = query.trim().toLowerCase()
  return searchableThreads(threads)
    .filter((thread) => {
      if (workspaceId === 'all') return true
      if (workspaceId !== 'none') return thread.workspaceId === workspaceId
      return (
        !thread.workspaceId ||
        !workspaces.some((workspace) => workspace.id === thread.workspaceId)
      )
    })
    .filter(
      (thread) =>
        !needle ||
        `${thread.title ?? ''} ${workspaceName(thread.workspaceId, workspaces)}`
          .toLowerCase()
          .includes(needle),
    )
    .sort(
      (a, b) =>
        activityTime(b.updatedAt ?? b.createdAt) -
        activityTime(a.updatedAt ?? a.createdAt),
    )
}

export function filterProjects(
  threads: Thread[],
  workspaces: Workspace[],
  query: string,
) {
  const needle = query.trim().toLowerCase()
  return groupProjects(threads, workspaces).filter((project) => {
    if (!needle) return true
    return project.name.toLowerCase().includes(needle)
  })
}
