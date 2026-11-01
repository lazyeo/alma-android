import { LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { desktopAgentPanePath } from '../desktopRoutes'
import { useT } from '../i18n'
import { firstString, type HerdrAgentKind } from './manage'
import type { AgentPaneModel, AgentWorkspaceModel } from './model'
import { useHerdr } from './HerdrProvider'

type Target =
  | { kind: 'pane'; pane: AgentPaneModel }
  | { kind: 'workspace'; workspace: AgentWorkspaceModel }

type EditTarget =
  | { kind: 'pane'; id: string; value: string }
  | { kind: 'workspace'; id: string; value: string }

interface AgentsManageValue {
  openPane(pane: AgentPaneModel): void
  openWorkspace(workspace: AgentWorkspaceModel): void
  openNewWorkspace(): void
  startingWorkspaceId?: string
}

const Context = createContext<AgentsManageValue | null>(null)

const unavailableManage: AgentsManageValue = {
  openPane: () => undefined,
  openWorkspace: () => undefined,
  openNewWorkspace: () => undefined,
}

export function useAgentsManage() {
  return useContext(Context) ?? unavailableManage
}

const kinds: HerdrAgentKind[] = ['claude', 'codex', 'pi']

export function AgentsManageProvider({
  desktopId,
  children,
}: {
  desktopId: string
  children: ReactNode
}) {
  const t = useT()
  const navigate = useNavigate()
  const herdr = useHerdr()
  const api = herdr.apiFor(desktopId)
  const [target, setTarget] = useState<Target>()
  const [editing, setEditing] = useState<EditTarget>()
  const [closing, setClosing] = useState<Target>()
  const [agentWorkspace, setAgentWorkspace] = useState<AgentWorkspaceModel>()
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [workspaceLabel, setWorkspaceLabel] = useState('')
  const [workspaceKind, setWorkspaceKind] = useState<HerdrAgentKind>()
  const [busy, setBusy] = useState(false)
  const [startingWorkspaceId, setStartingWorkspaceId] = useState<string>()
  const [error, setError] = useState<string>()

  const fail = (reason: unknown) =>
    setError(reason instanceof Error ? reason.message : String(reason))

  const waitForPane = async (paneId: string) => {
    const deadline = Date.now() + 4_000
    while (Date.now() < deadline) {
      if (
        herdr.byDesktop[desktopId]?.snapshot?.panes?.some(
          (pane) => pane.pane_id === paneId,
        )
      )
        return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  const start = async (workspace: AgentWorkspaceModel, kind: HerdrAgentKind) => {
    if (!api || busy) return
    setBusy(true)
    setStartingWorkspaceId(workspace.id)
    setAgentWorkspace(undefined)
    try {
      const cwd = workspace.panes[0]?.cwd
      const created = await api.herdrCreateTab(workspace.id, cwd)
      const paneId = firstString('pane_id', created)
      if (!paneId) throw new Error(t('agents.newTabFailed'))
      await api.herdrStartAgent(kind, paneId)
      await waitForPane(paneId)
      navigate(desktopAgentPanePath(desktopId, paneId))
    } catch (reason) {
      fail(reason)
    } finally {
      setBusy(false)
      setStartingWorkspaceId(undefined)
    }
  }

  const createWorkspace = async () => {
    if (!api || busy) return
    setBusy(true)
    try {
      const created = await api.herdrCreateWorkspace(
        workspaceLabel.trim() || undefined,
      )
      const paneId = firstString('pane_id', created)
      if (!paneId) throw new Error(t('agents.newWorkspaceFailed'))
      if (workspaceKind) await api.herdrStartAgent(workspaceKind, paneId)
      setCreatingWorkspace(false)
      await waitForPane(paneId)
      navigate(desktopAgentPanePath(desktopId, paneId))
    } catch (reason) {
      fail(reason)
    } finally {
      setBusy(false)
    }
  }

  const rename = async () => {
    if (!api || !editing || busy || !editing.value.trim()) return
    setBusy(true)
    try {
      if (editing.kind === 'pane')
        await api.herdrRenameTab(editing.id, editing.value.trim())
      else await api.herdrRenameWorkspace(editing.id, editing.value.trim())
      setEditing(undefined)
    } catch (reason) {
      fail(reason)
    } finally {
      setBusy(false)
    }
  }

  const close = async () => {
    if (!api || !closing || busy) return
    setBusy(true)
    try {
      if (closing.kind === 'pane' && closing.pane.tabId)
        await api.herdrCloseTab(closing.pane.tabId)
      if (closing.kind === 'workspace')
        await api.herdrCloseWorkspace(closing.workspace.id)
      setClosing(undefined)
    } catch (reason) {
      fail(reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Context.Provider
      value={{
        openPane: (pane) => setTarget({ kind: 'pane', pane }),
        openWorkspace: (workspace) => setTarget({ kind: 'workspace', workspace }),
        openNewWorkspace: () => setCreatingWorkspace(true),
        startingWorkspaceId,
      }}
    >
      {children}
      {error ? (
        <div className="herdr-manage-error error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(undefined)}>{t('common.close')}</button>
        </div>
      ) : null}
      {target ? (
        <BottomSheet
          title={
            target.kind === 'pane'
              ? t('agents.tabActions')
              : t('agents.workspaceActions')
          }
          onClose={() => setTarget(undefined)}
        >
          <div className="sheet-list">
            <button
              className="sheet-row"
              onClick={() => {
                setEditing(
                  target.kind === 'pane'
                    ? {
                        kind: 'pane',
                        id: target.pane.tabId ?? '',
                        value: target.pane.title,
                      }
                    : {
                        kind: 'workspace',
                        id: target.workspace.id,
                        value: target.workspace.label,
                      },
                )
                setTarget(undefined)
              }}
            >
              <Pencil size={18} />
              <span>
                {target.kind === 'pane'
                  ? t('agents.renameTab')
                  : t('agents.renameWorkspace')}
              </span>
            </button>
            {target.kind === 'workspace' ? (
              <button
                className="sheet-row"
                onClick={() => {
                  setAgentWorkspace(target.workspace)
                  setTarget(undefined)
                }}
              >
                <Plus size={18} />
                <span>{t('agents.newAgentTab')}</span>
              </button>
            ) : null}
            <button
              className="sheet-row danger"
              onClick={() => {
                setClosing(target)
                setTarget(undefined)
              }}
            >
              <Trash2 size={18} />
              <span>
                {target.kind === 'pane'
                  ? t('agents.closeTab')
                  : t('agents.closeWorkspace')}
              </span>
            </button>
          </div>
        </BottomSheet>
      ) : null}
      {editing ? (
        <BottomSheet
          title={
            editing.kind === 'pane'
              ? t('agents.renameTabTitle')
              : t('agents.renameWorkspaceTitle')
          }
          onClose={() => !busy && setEditing(undefined)}
          footer={
            <button
              className="primary"
              disabled={busy || !editing.value.trim()}
              onClick={() => void rename()}
            >
              {busy ? t('thread.rename.saving') : t('common.save')}
            </button>
          }
        >
          <input
            className="rename-input"
            autoFocus
            placeholder={t('agents.renamePlaceholder')}
            value={editing.value}
            onChange={(event) =>
              setEditing({ ...editing, value: event.target.value })
            }
          />
        </BottomSheet>
      ) : null}
      {closing ? (
        <BottomSheet
          title={t('agents.closeTitle')}
          onClose={() => !busy && setClosing(undefined)}
          footer={
            <button className="danger" disabled={busy} onClick={() => void close()}>
              {closing.kind === 'pane'
                ? t('agents.closeTabAction')
                : t('agents.closeWorkspaceAction')}
            </button>
          }
        >
          <p>
            {closing.kind === 'pane'
              ? t('agents.closeTabDescription')
              : t('agents.closeWorkspaceDescription')}
          </p>
        </BottomSheet>
      ) : null}
      {agentWorkspace ? (
        <BottomSheet
          title={t('agents.newAgentTab')}
          onClose={() => !busy && setAgentWorkspace(undefined)}
        >
          <AgentKinds disabled={busy} onSelect={(kind) => void start(agentWorkspace, kind)} />
        </BottomSheet>
      ) : null}
      {creatingWorkspace ? (
        <BottomSheet
          title={t('agents.newWorkspace')}
          onClose={() => !busy && setCreatingWorkspace(false)}
          footer={
            <button className="primary" disabled={busy} onClick={() => void createWorkspace()}>
              {busy ? <LoaderCircle className="spinner" size={16} /> : null}
              {t('agents.createWorkspace')}
            </button>
          }
        >
          <input
            className="rename-input"
            autoFocus
            placeholder={t('agents.workspaceLabelPlaceholder')}
            value={workspaceLabel}
            onChange={(event) => setWorkspaceLabel(event.target.value)}
          />
          <fieldset className="agent-kind-fieldset">
            <legend>{t('agents.optionalAgent')}</legend>
            <button
              className={!workspaceKind ? 'selected' : ''}
              onClick={() => setWorkspaceKind(undefined)}
            >
              {t('agents.noAgent')}
            </button>
            {kinds.map((kind) => (
              <button
                className={workspaceKind === kind ? 'selected' : ''}
                key={kind}
                onClick={() => setWorkspaceKind(kind)}
              >
                {t(`agents.kind.${kind}`)}
              </button>
            ))}
          </fieldset>
        </BottomSheet>
      ) : null}
    </Context.Provider>
  )
}

function AgentKinds({
  disabled,
  onSelect,
}: {
  disabled: boolean
  onSelect(kind: HerdrAgentKind): void
}) {
  const t = useT()
  return (
    <div className="sheet-list">
      {kinds.map((kind) => (
        <button
          className="sheet-row"
          disabled={disabled}
          key={kind}
          onClick={() => onSelect(kind)}
        >
          <span>{t(`agents.kind.${kind}`)}</span>
        </button>
      ))}
    </div>
  )
}
