import { LayoutList, PanelsTopLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '../i18n'
import {
  buildWorkspaceSwitcher,
  loadAgentsViewMode,
  loadSelectedWorkspace,
  resolveSelectedWorkspace,
  saveAgentsViewMode,
  saveSelectedWorkspace,
  type AgentsViewMode,
} from './agentsBoardModel'
import { AgentsBoard, AgentsList } from './AgentsBoard'
import { AgentsState } from './AgentsScreen'
import { useHerdr } from './HerdrProvider'

export function AgentsSidebar() {
  const t = useT()
  const { desktopId = '', paneId } = useParams()
  const decodedDesktopId = decodeURIComponent(desktopId)
  const selectedPaneId = paneId ? decodeURIComponent(paneId) : undefined
  const { agents, byDesktop, setWorkspaceMuted } = useHerdr()
  const workspaces = agents(decodedDesktopId)
  const state = byDesktop[decodedDesktopId]
  const [mode, setMode] = useState<AgentsViewMode>(loadAgentsViewMode)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>()
  const ordered = useMemo(
    () => buildWorkspaceSwitcher(workspaces),
    [workspaces],
  )

  useEffect(() => {
    const selectedPaneWorkspace = workspaces.find((workspace) =>
      workspace.panes.some((pane) => pane.id === selectedPaneId),
    )?.id
    const selected = resolveSelectedWorkspace(
      workspaces,
      selectedPaneWorkspace ?? loadSelectedWorkspace(decodedDesktopId),
    )
    setSelectedWorkspaceId(selected)
    if (selected) saveSelectedWorkspace(decodedDesktopId, selected)
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
      </header>
      <div className="agents-sidebar-body">
        <AgentsState state={state} />
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
