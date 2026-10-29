import type { AgentPaneModel, AgentWorkspaceModel } from './model'

export type AgentsViewMode = 'board' | 'list'

export interface WorkspaceSwitcherItem extends AgentWorkspaceModel {
  blocked: number
  working: number
}

export const agentsViewModeStorageKey = 'alma.agents.view-mode'
const selectedWorkspacePrefix = 'alma.agents.selected-workspace.'
const lastViewedPanePrefix = 'alma.agents.last-viewed-pane.'

const safeStorage = () => {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

export const selectedWorkspaceStorageKey = (desktopId: string) =>
  `${selectedWorkspacePrefix}${desktopId}`

const lastViewedPaneStorageKey = (desktopId: string) =>
  `${lastViewedPanePrefix}${desktopId}`

export function buildWorkspaceSwitcher(
  workspaces: AgentWorkspaceModel[],
): WorkspaceSwitcherItem[] {
  return workspaces
    .map((workspace) => ({
      ...workspace,
      blocked: workspace.panes.filter((pane) => pane.status === 'blocked')
        .length,
      working: workspace.panes.filter((pane) => pane.status === 'working')
        .length,
    }))
    .sort(
      (a, b) =>
        Number(b.blocked > 0) - Number(a.blocked > 0) ||
        b.blocked - a.blocked ||
        Number(b.working > 0) - Number(a.working > 0) ||
        b.working - a.working,
    )
}

export function reconcileSelectedWorkspace(
  workspaces: AgentWorkspaceModel[],
  currentId?: string,
  fallbackId?: string | null,
) {
  if (currentId && workspaces.some((workspace) => workspace.id === currentId))
    return currentId
  return resolveSelectedWorkspace(workspaces, fallbackId)
}

export function resolveSelectedWorkspace(
  workspaces: AgentWorkspaceModel[],
  selectedId?: string | null,
) {
  const ordered = buildWorkspaceSwitcher(workspaces)
  if (selectedId && ordered.some((workspace) => workspace.id === selectedId))
    return selectedId
  return ordered[0]?.id
}

export function loadSelectedWorkspace(desktopId: string) {
  return safeStorage()?.getItem(selectedWorkspaceStorageKey(desktopId)) ?? null
}

export function saveSelectedWorkspace(desktopId: string, workspaceId: string) {
  safeStorage()?.setItem(selectedWorkspaceStorageKey(desktopId), workspaceId)
}

export function loadAgentsViewMode(): AgentsViewMode {
  return safeStorage()?.getItem(agentsViewModeStorageKey) === 'list'
    ? 'list'
    : 'board'
}

export function saveAgentsViewMode(mode: AgentsViewMode) {
  safeStorage()?.setItem(agentsViewModeStorageKey, mode)
}

export function rememberLastViewedPane(desktopId: string, paneId: string) {
  safeStorage()?.setItem(lastViewedPaneStorageKey(desktopId), paneId)
}

const preferredActivePane = (workspaces: AgentWorkspaceModel[]) => {
  const panes = buildWorkspaceSwitcher(workspaces).flatMap(
    (workspace) => workspace.panes,
  )
  return (
    panes.find((pane) => pane.status === 'blocked') ??
    panes.find((pane) => pane.status === 'working')
  )
}

export function resolveLastViewedPane(
  desktopId: string,
  workspaces: AgentWorkspaceModel[],
): string | undefined {
  const remembered = safeStorage()?.getItem(lastViewedPaneStorageKey(desktopId))
  if (
    remembered &&
    workspaces.some((workspace) =>
      workspace.panes.some((pane) => pane.id === remembered),
    )
  )
    return remembered
  return preferredActivePane(workspaces)?.id
}

export function paneLastChanged(pane: AgentPaneModel) {
  return pane.lastChangedAt
}
