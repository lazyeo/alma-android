import { BellOff, BellRing } from 'lucide-react'
import { Link } from 'react-router-dom'
import { desktopAgentPanePath } from '../desktopRoutes'
import { useT } from '../i18n'
import { relative } from '../screens/ThreadListRow'
import type { AgentPaneModel, AgentWorkspaceModel } from './model'
import type { WorkspaceSwitcherItem } from './agentsBoardModel'

export const agentStatusClass = (
  status: string,
): 'blocked' | 'working' | 'done' | 'idle' | 'unknown' =>
  status === 'blocked' ||
  status === 'working' ||
  status === 'done' ||
  status === 'idle'
    ? status
    : 'unknown'

export function AgentPaneRow({
  desktopId,
  pane,
  selected,
  compact = false,
}: {
  desktopId: string
  pane: AgentPaneModel
  selected?: boolean
  compact?: boolean
}) {
  const t = useT()
  const changed = pane.lastChangedAt ? relative(pane.lastChangedAt) : ''
  return (
    <Link
      className={`agent-pane-row${selected ? ' selected' : ''}${compact ? ' compact' : ''}`}
      to={desktopAgentPanePath(desktopId, pane.id)}
      replace={Boolean(selected)}
      aria-current={selected ? 'page' : undefined}
    >
      <span className={`agent-status ${agentStatusClass(pane.status)}`} />
      <span className="agent-pane-copy">
        <span className="agent-pane-heading">
          <strong>{pane.agent}</strong>
          {changed ? <small>{changed}</small> : null}
        </span>
        <span className="agent-pane-title">{pane.title}</span>
      </span>
      <span className={`agent-status-badge ${agentStatusClass(pane.status)}`}>
        {t(`agents.status.${agentStatusClass(pane.status)}`)}
      </span>
    </Link>
  )
}

export function AgentsBoard({
  desktopId,
  workspaces,
  selectedWorkspaceId,
  selectedPaneId,
  mutedWorkspaces,
  compact = false,
  onSelectWorkspace,
  onSetWorkspaceMuted,
}: {
  desktopId: string
  workspaces: WorkspaceSwitcherItem[]
  selectedWorkspaceId?: string
  selectedPaneId?: string
  mutedWorkspaces: string[]
  compact?: boolean
  onSelectWorkspace(workspaceId: string): void
  onSetWorkspaceMuted(workspaceId: string, muted: boolean): void
}) {
  const t = useT()
  const selected = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  )
  const muted = selected ? mutedWorkspaces.includes(selected.id) : false
  return (
    <div className={`agents-board${compact ? ' compact' : ''}`}>
      <div className="agent-project-switcher" role="tablist">
        {workspaces.map((workspace) => (
          <button
            className={`agent-project-tab${workspace.id === selected?.id ? ' active' : ''}`}
            role="tab"
            aria-selected={workspace.id === selected?.id}
            key={workspace.id}
            onClick={() => onSelectWorkspace(workspace.id)}
          >
            <strong>{workspace.label}</strong>
            <span className="agent-project-counts">
              {workspace.blocked ? (
                <span className="agent-project-count blocked">
                  {t('agents.blockedCount', { count: workspace.blocked })}
                </span>
              ) : null}
              {workspace.working ? (
                <span className="agent-project-count working">
                  {t('agents.workingCount', { count: workspace.working })}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      {selected ? (
        <section className="agent-board-project">
          <header>
            <div>
              <h2>{selected.label}</h2>
              <span>
                {t('agents.sessionCount', { count: selected.panes.length })}
              </span>
            </div>
            <button
              className="quiet-icon-button"
              aria-label={muted ? t('agents.unmute') : t('agents.mute')}
              onClick={() => onSetWorkspaceMuted(selected.id, !muted)}
            >
              {muted ? <BellOff size={17} /> : <BellRing size={17} />}
            </button>
          </header>
          <div className="agent-pane-list">
            {selected.panes.map((pane) => (
              <AgentPaneRow
                desktopId={desktopId}
                pane={pane}
                selected={pane.id === selectedPaneId}
                compact={compact}
                key={pane.id}
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="empty">{t('agents.empty')}</p>
      )}
    </div>
  )
}

export function AgentsList({
  desktopId,
  workspaces,
  selectedPaneId,
  mutedWorkspaces,
  compact = false,
  onSetWorkspaceMuted,
}: {
  desktopId: string
  workspaces: AgentWorkspaceModel[]
  selectedPaneId?: string
  mutedWorkspaces: string[]
  compact?: boolean
  onSetWorkspaceMuted(workspaceId: string, muted: boolean): void
}) {
  const t = useT()
  if (!workspaces.length) return <p className="empty">{t('agents.empty')}</p>
  return (
    <div className={`agents-list${compact ? ' compact' : ''}`}>
      {workspaces.map((workspace) => {
        const muted = mutedWorkspaces.includes(workspace.id)
        return (
          <section className="agent-workspace" key={workspace.id}>
            <header>
              <h2>{workspace.label}</h2>
              <button
                className="quiet-icon-button"
                aria-label={muted ? t('agents.unmute') : t('agents.mute')}
                onClick={() => onSetWorkspaceMuted(workspace.id, !muted)}
              >
                {muted ? <BellOff size={17} /> : <BellRing size={17} />}
              </button>
            </header>
            <div className="agent-pane-list">
              {workspace.panes.map((pane) => (
                <AgentPaneRow
                  desktopId={desktopId}
                  pane={pane}
                  selected={pane.id === selectedPaneId}
                  compact={compact}
                  key={pane.id}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
