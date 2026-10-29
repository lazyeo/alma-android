import {
  LayoutList,
  LoaderCircle,
  MonitorUp,
  PanelsTopLeft,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { desktopScreenPath } from '../desktopRoutes'
import { useT } from '../i18n'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
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
import { useHerdr, type DesktopHerdrState } from './HerdrProvider'

export function AgentsScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { desktopId = '' } = useParams()
  const decodedDesktopId = decodeURIComponent(desktopId)
  const { agents, byDesktop, retry, setWorkspaceMuted } = useHerdr()
  const workspaces = agents(decodedDesktopId)
  const state = byDesktop[decodedDesktopId]
  const [mode, setMode] = useState<AgentsViewMode>(loadAgentsViewMode)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>()
  const ordered = useMemo(
    () => buildWorkspaceSwitcher(workspaces),
    [workspaces],
  )

  useEffect(() => {
    setSelectedWorkspaceId((current) => {
      const selected = reconcileSelectedWorkspace(
        workspaces,
        current,
        loadSelectedWorkspace(decodedDesktopId),
      )
      if (selected && selected !== current)
        saveSelectedWorkspace(decodedDesktopId, selected)
      return selected
    })
  }, [decodedDesktopId, workspaces])

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
    <section className="root-page agents-page">
      <ScopedRootHeader
        title={t('agents.title')}
        actions={
          <>
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
                <LayoutList size={19} />
              ) : (
                <PanelsTopLeft size={19} />
              )}
            </button>
            {state?.online ? (
              <button
                className="header-icon-button"
                aria-label={t('agents.openRemoteDesktop')}
                onClick={() => navigate(desktopScreenPath(decodedDesktopId))}
              >
                <MonitorUp size={19} />
              </button>
            ) : null}
          </>
        }
      />
      <div className="page-body agents-page-body">
        <AgentsState state={state} onRetry={() => retry(decodedDesktopId)} />
        {!herdrReady(state) ? null : mode === 'board' ? (
          <AgentsBoard
            desktopId={decodedDesktopId}
            workspaces={ordered}
            selectedWorkspaceId={selectedWorkspaceId}
            mutedWorkspaces={state?.mutedWorkspaces ?? []}
            onSelectWorkspace={selectWorkspace}
            onSetWorkspaceMuted={(workspaceId, muted) =>
              void setWorkspaceMuted(decodedDesktopId, workspaceId, muted)
            }
          />
        ) : (
          <AgentsList
            desktopId={decodedDesktopId}
            workspaces={workspaces}
            mutedWorkspaces={state?.mutedWorkspaces ?? []}
            onSetWorkspaceMuted={(workspaceId, muted) =>
              void setWorkspaceMuted(decodedDesktopId, workspaceId, muted)
            }
          />
        )}
      </div>
    </section>
  )
}

function herdrReady(state?: DesktopHerdrState) {
  return Boolean(
    state?.desktopOnline && state.supported && state.online && !state.error,
  )
}

export function AgentsState({
  state,
  onRetry,
}: {
  state?: DesktopHerdrState
  onRetry(): void
}) {
  const t = useT()
  if (!state)
    return (
      <p className="empty agents-state" aria-live="polite">
        <LoaderCircle className="spinner" size={16} />
        {t('agents.connecting')}
      </p>
    )
  if (!state.desktopOnline)
    return <p className="empty agents-state">{t('agents.desktopOffline')}</p>
  if (!state.supported)
    return <p className="empty agents-state">{t('agents.unsupported')}</p>
  if (state.error || !state.online)
    return (
      <div className="empty agents-state">
        <p>{t('agents.unreachable')}</p>
        <button className="quiet-text-button" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      </div>
    )
  return null
}
