import type { Workspace } from '../../relay/almaApi'

export function selectLocalWakeWorkspace(
  workspaces: Workspace[],
  defaultWorkspaceId?: string,
) {
  const local = workspaces.filter((workspace) => !workspace.remoteHostId)
  return (
    local.find((workspace) => workspace.id === defaultWorkspaceId) ?? local[0]
  )
}
