import type { AlmaSettings, Thread, Workspace } from '../relay'
import { t } from '../i18n/runtime'

/** Desktop's registered Default workspace on this installation. */
export const DEFAULT_WORKSPACE_ID = 'mj9z72xykncpbti42ht'

export type WorkspaceFilter = 'all' | 'none' | string

export function resolveDefaultWorkspaceId(
  settings: AlmaSettings,
  workspaces: Workspace[],
) {
  const configured = settings.general?.defaultWorkspaceId
  if (
    configured &&
    workspaces.some((workspace) => workspace.id === configured)
  ) {
    return configured
  }
  if (workspaces.some((workspace) => workspace.id === DEFAULT_WORKSPACE_ID)) {
    return DEFAULT_WORKSPACE_ID
  }
  return workspaces[0]?.id
}

export function workspaceName(
  workspaceId: string | undefined,
  workspaces: Workspace[],
) {
  if (!workspaceId) return t('common.uncategorized')
  return (
    workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    t('common.uncategorized')
  )
}

export function filterThreadsByWorkspace(
  threads: Thread[],
  workspaceFilter: WorkspaceFilter,
  workspaces: Workspace[] = [],
) {
  if (workspaceFilter === 'all') return threads
  if (workspaceFilter === 'none') {
    const known = new Set(workspaces.map((workspace) => workspace.id))
    return threads.filter(
      (thread) => !thread.workspaceId || !known.has(thread.workspaceId),
    )
  }
  return threads.filter((thread) => thread.workspaceId === workspaceFilter)
}

export function filterWorkspaces(workspaces: Workspace[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return workspaces
  return workspaces.filter((workspace) =>
    `${workspace.name} ${workspace.path ?? ''}`.toLowerCase().includes(needle),
  )
}
