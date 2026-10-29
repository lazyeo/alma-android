import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { desktopAgentPanePath } from '../desktopRoutes'
import { useT } from '../i18n'
import { useHerdr } from './HerdrProvider'
import { relative } from '../screens/ThreadListRow'
import {
  parseBlockedPrompt,
  type AgentPaneModel,
  type AgentWorkspaceModel,
  type BlockedPrompt,
} from './model'
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
  // The split sidebar sits outside ConnectionProvider; resolve the api here.
  const api = useHerdr().apiFor(desktopId)
  const [prompt, setPrompt] = useState<BlockedPrompt | null>(null)
  const [answering, setAnswering] = useState(false)
  useEffect(() => {
    setPrompt(null)
    if (pane.status !== 'blocked' || !api) return
    let cancelled = false
    void api
      .readHerdrPane(pane.id, 'text', { source: 'visible' })
      .then((result) => {
        if (!cancelled) setPrompt(parseBlockedPrompt(result?.read?.text ?? ''))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, pane.id, pane.status])
  const choose = async (optionNumber: number) => {
    if (!prompt || answering || !api) return
    setAnswering(true)
    try {
      await api.chooseHerdrMenuOption(
        pane.id,
        prompt.selectedIndex,
        optionNumber,
      )
    } finally {
      setAnswering(false)
    }
  }
  // Already viewing a pane (split layout): switching sessions replaces the
  // entry so Back leaves Agents instead of stepping through every session.
  const { paneId: openPaneId } = useParams()
  const changed = pane.lastChangedAt ? relative(pane.lastChangedAt) : ''
  return (
    <div className="agent-pane-row-wrap">
      <Link
        className={`agent-pane-row${selected ? ' selected' : ''}${compact ? ' compact' : ''}`}
        to={desktopAgentPanePath(desktopId, pane.id)}
        replace={Boolean(selected || openPaneId)}
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
      {prompt ? (
        <aside className="agent-row-blocked-card">
          <strong>{prompt.question}</strong>
          <div className="agent-menu-options">
            {prompt.options.map((option, index) => (
              <button
                className={`chip-button agent-menu-option${index === prompt.selectedIndex ? ' active' : ''}`}
                disabled={answering}
                key={option.number}
                aria-label={`${option.number}. ${option.label}`}
                onClick={() => void choose(option.number)}
              >
                <span>{option.number}.</span> {option.label}
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
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
  const switcherRef = useRef<HTMLDivElement>(null)
  const selected = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  )
  const muted = selected ? mutedWorkspaces.includes(selected.id) : false
  useEffect(() => {
    const active = switcherRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    )
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedWorkspaceId])
  return (
    <div className={`agents-board${compact ? ' compact' : ''}`}>
      <div
        ref={switcherRef}
        className="agent-project-switcher"
        role="tablist"
        data-sidebar-swipe-exclude
      >
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
