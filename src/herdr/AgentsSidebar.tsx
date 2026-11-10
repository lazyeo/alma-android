import { LayoutList, MonitorUp, PanelsTopLeft, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { desktopScreenPath } from '../desktopRoutes'
import { useT } from '../i18n'
import {
  buildWorkspaceSwitcher,
  loadAgentsViewMode,
  loadSelectedWorkspace,
  reconcileSelectedWorkspace,
  saveAgentsViewMode,
  saveSelectedWorkspace,
  type AgentsViewMode,
} from './agentsBoardModel'
import { AgentsBoard, AgentsList } from './AgentsBoard'
import { AgentsState } from './AgentsScreen'
import { HerdrComputerSwitcher } from './HerdrComputerSwitcher'
import { useHerdr } from './HerdrProvider'
import { AgentsManageProvider, useAgentsManage } from './AgentsManage'

export function AgentsSidebar() {
  const { desktopId = '' } = useParams()
  const decodedDesktopId = decodeURIComponent(desktopId)
  return (
    <AgentsManageProvider desktopId={decodedDesktopId}>
      <AgentsSidebarContent desktopId={decodedDesktopId} />
    </AgentsManageProvider>
  )
}

function AgentsSidebarContent({
  desktopId: decodedDesktopId,
}: {
  desktopId: string
}) {
  const t = useT()
  const navigate = useNavigate()
  const manage = useAgentsManage()
  const { paneId } = useParams()
  const selectedPaneId = paneId ? decodeURIComponent(paneId) : undefined
  const { agents, byDesktop, retry, setWorkspaceMuted } = useHerdr()
  const workspaces = agents(decodedDesktopId)
  const state = byDesktop[decodedDesktopId]
  const [mode, setMode] = useState<AgentsViewMode>(loadAgentsViewMode)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>()
  const ordered = useMemo(
    () => buildWorkspaceSwitcher(workspaces),
    [workspaces],
  )

  // Follow the open pane's workspace only when the pane changes; herdr pushes
  // must not pull the switcher back after the user picks another project.
  const syncedPaneRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const paneChanged = syncedPaneRef.current !== selectedPaneId
    const selectedPaneWorkspace = paneChanged
      ? workspaces.find((workspace) =>
          workspace.panes.some((pane) => pane.id === selectedPaneId),
        )?.id
      : undefined
    if (selectedPaneWorkspace || !selectedPaneId)
      syncedPaneRef.current = selectedPaneId
    setSelectedWorkspaceId((current) => {
      const selected = reconcileSelectedWorkspace(
        workspaces,
        selectedPaneWorkspace ?? current,
        loadSelectedWorkspace(decodedDesktopId),
      )
      if (selected && selected !== current)
        saveSelectedWorkspace(decodedDesktopId, selected)
      return selected
    })
  }, [decodedDesktopId, selectedPaneId, workspaces])

  const changeMode = () => {
    const next = mode === 'board' ? 'list' : 'board'
    setMode(next)
    saveAgentsViewMode(next)
  }
  const selectWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId)
    saveSelectedWorkspace(decodedDesktopId, workspaceId)
  }

  return (
    <section className="root-page agents-sidebar-page">
      <header className="agents-sidebar-header">
        <h1>{t('agents.title')}</h1>
        <button
          className="header-icon-button"
          aria-label={t('agents.newWorkspace')}
          onClick={manage.openNewWorkspace}
        >
          <Plus size={18} />
        </button>
        <button
          className="header-icon-button"
          aria-label={
            mode === 'board'
              ? t('agents.showListView')
              : t('agents.showBoardView')
          }
          onClick={changeMode}
        >
          {mode === 'board' ? (
            <LayoutList size={18} />
          ) : (
            <PanelsTopLeft size={18} />
          )}
        </button>
        {state?.desktopOnline ? (
          <button
            className="header-icon-button"
            aria-label={t('agents.openRemoteDesktop')}
            onClick={() =>
              navigate(desktopScreenPath(decodedDesktopId), {
                state: {
                  screenOrigin: `/d/${encodeURIComponent(decodedDesktopId)}/agents`,
                },
              })
            }
          >
            <MonitorUp size={18} />
          </button>
        ) : null}
      </header>
      <div className="agents-sidebar-body">
        <HerdrComputerSwitcher desktopId={decodedDesktopId} />
        <AgentsState
          state={state}
          desktopId={decodedDesktopId}
          onRetry={() => retry(decodedDesktopId)}
        />
        {mode === 'board' ? (
          <AgentsBoard
            desktopId={decodedDesktopId}
            workspaces={ordered}
            selectedWorkspaceId={selectedWorkspaceId}
            selectedPaneId={selectedPaneId}
            mutedWorkspaces={state?.mutedWorkspaces ?? []}
            compact
            onSelectWorkspace={selectWorkspace}
            onSetWorkspaceMuted={(workspaceId, muted) =>
              void setWorkspaceMuted(decodedDesktopId, workspaceId, muted)
            }
          />
        ) : (
          <AgentsList
            desktopId={decodedDesktopId}
            workspaces={workspaces}
            selectedPaneId={selectedPaneId}
            mutedWorkspaces={state?.mutedWorkspaces ?? []}
            compact
            onSetWorkspaceMuted={(workspaceId, muted) =>
              void setWorkspaceMuted(decodedDesktopId, workspaceId, muted)
            }
          />
        )}
      </div>
    </section>
  )
}
