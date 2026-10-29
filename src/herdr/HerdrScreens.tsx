import { BellOff, BellRing, Send, TerminalSquare } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import { MarkdownContent } from '../screens/MarkdownContent'
import { useHerdr } from './HerdrProvider'
import { mergeChatItems, parseBlockedPrompt, type HerdrPane } from './model'

type ChatItem = {
  id: string
  kind: string
  text?: string
  tool?: { name?: string; summary?: string; done?: boolean }
}
type ChatPage = { items?: ChatItem[]; start?: number; end?: number }
type ChatResponse = {
  session_id?: string
  page?: ChatPage
  queued?: Array<{ id: string; text: string }>
  error?: { code?: string; message?: string }
}

const statusClass = (
  status: string,
): 'blocked' | 'working' | 'done' | 'idle' | 'unknown' =>
  status === 'blocked' ||
  status === 'working' ||
  status === 'done' ||
  status === 'idle'
    ? status
    : 'unknown'

export function AgentsScreen() {
  const t = useT()
  const { desktopId = '' } = useParams()
  const decodedDesktopId = decodeURIComponent(desktopId)
  const { agents, byDesktop, setWorkspaceMuted } = useHerdr()
  const workspaces = agents(decodedDesktopId)
  const state = byDesktop[decodedDesktopId]
  return (
    <section className="root-page agents-page">
      <ScopedRootHeader title={t('agents.title')} />
      <div className="page-body agents-page-body">
        {state?.supported === false ? (
          <p className="empty">{t('agents.unsupported')}</p>
        ) : state?.error ? (
          <p className="settings-error agents-state-error">
            {t('agents.loadFailed')}
          </p>
        ) : !state?.online ? (
          <p className="empty">{t('agents.offline')}</p>
        ) : null}
        {workspaces.map((workspace) => {
          const muted = state.mutedWorkspaces.includes(workspace.id)
          return (
            <section className="agent-workspace" key={workspace.id}>
              <header>
                <h2>{workspace.label}</h2>
                <button
                  className="quiet-icon-button"
                  aria-label={muted ? t('agents.unmute') : t('agents.mute')}
                  onClick={() =>
                    void setWorkspaceMuted(
                      decodedDesktopId,
                      workspace.id,
                      !muted,
                    )
                  }
                >
                  {muted ? <BellOff size={17} /> : <BellRing size={17} />}
                </button>
              </header>
              <div className="agent-pane-list">
                {workspace.panes.map((pane) => (
                  <Link
                    className="agent-pane-row"
                    to={`/d/${encodeURIComponent(decodedDesktopId)}/agents/${encodeURIComponent(pane.id)}`}
                    key={pane.id}
                  >
                    <span
                      className={`agent-status ${statusClass(pane.status)}`}
                    />
                    <span className="agent-pane-copy">
                      <strong>{pane.title}</strong>
                      <small>{pane.agent}</small>
                    </span>
                    <span
                      className={`agent-status-badge ${statusClass(pane.status)}`}
                    >
                      {t(`agents.status.${statusClass(pane.status)}`)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

export function AgentPaneScreen() {
  const t = useT()
  const { desktopId = '', paneId = '' } = useParams()
  const decodedDesktopId = decodeURIComponent(desktopId)
  const decodedPaneId = decodeURIComponent(paneId)
  const { api } = useConnection()
  const { byDesktop } = useHerdr()
  const pane = byDesktop[decodedDesktopId]?.snapshot?.panes?.find(
    (item) => item.pane_id === decodedPaneId,
  ) as HerdrPane | undefined
  const [view, setView] = useState<'chat' | 'terminal'>('chat')
  const [items, setItems] = useState<ChatItem[]>([])
  const [queued, setQueued] = useState<Array<{ id: string; text: string }>>([])
  const [start, setStart] = useState(-1)
  const [end, setEnd] = useState(0)
  const [terminal, setTerminal] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const loadChat = useCallback(
    async (before = -1, prepend = false) => {
      const response = (await api.getHerdrChat(
        decodedPaneId,
        before,
        60,
      )) as ChatResponse
      if (response.error)
        throw new Error(response.error.message || response.error.code)
      const page = response.page ?? {}
      setItems((current) =>
        prepend
          ? mergeChatItems(current, page.items ?? [], 'prepend')
          : mergeChatItems([], page.items ?? [], 'append'),
      )
      setQueued(response.queued ?? [])
      setStart(page.start ?? -1)
      setEnd(page.end ?? 0)
    },
    [api, decodedPaneId],
  )

  useEffect(() => {
    void loadChat().catch((reason) => setError(String(reason)))
  }, [loadChat])
  useEffect(() => {
    if (view !== 'terminal') return
    const socket = api.openJsonSocket(
      `/ws/herdr/screen?pane=${encodeURIComponent(decodedPaneId)}`,
      (event) => {
        if (event.type === 'screen') {
          const read = event.read as { text?: string } | undefined
          if (typeof read?.text === 'string') setTerminal(read.text)
        }
      },
    )
    socket.opened.catch(() =>
      api
        .readHerdrPane(decodedPaneId)
        .then((result) => setTerminal(result?.read?.text ?? ''))
        .catch(() => undefined),
    )
    return () => socket.close()
  }, [api, decodedPaneId, view])
  useEffect(() => {
    const socket = api.openJsonSocket(
      `/ws/herdr/chat?pane=${encodeURIComponent(decodedPaneId)}&from=${end}`,
      (event) => {
        if (event.type === 'items' && Array.isArray(event.items)) {
          setItems((current) =>
            mergeChatItems(current, event.items as ChatItem[], 'append'),
          )
          if (typeof event.end === 'number') setEnd(event.end)
        }
        if (event.type === 'queued' && Array.isArray(event.queued))
          setQueued(event.queued as Array<{ id: string; text: string }>)
        if (event.type === 'session_changed') {
          setItems([])
          setQueued([])
          setEnd(0)
          void loadChat()
        }
      },
    )
    socket.opened.catch(() => undefined)
    return () => socket.close()
  }, [api, decodedPaneId, end, loadChat])

  const blockedPrompt = useMemo(
    () =>
      pane?.agent_status === 'blocked' ? parseBlockedPrompt(terminal) : null,
    [pane?.agent_status, terminal],
  )
  useEffect(() => {
    if (pane?.agent_status !== 'blocked' || terminal) return
    void api
      .readHerdrPane(decodedPaneId)
      .then((result) => setTerminal(result?.read?.text ?? ''))
      .catch(() => undefined)
  }, [api, decodedPaneId, pane?.agent_status, terminal])

  const send = async () => {
    const prompt = draft.trim()
    if (!prompt || sending) return
    setSending(true)
    setError('')
    try {
      if (pane?.agent_status === 'blocked')
        await api.sendHerdrBlockedText(decodedPaneId, prompt)
      else await api.promptHerdrAgent(decodedPaneId, prompt)
      setDraft('')
    } catch (reason) {
      if (
        reason &&
        typeof reason === 'object' &&
        'code' in reason &&
        reason.code === 'agent_blocked'
      ) {
        void api
          .readHerdrPane(decodedPaneId)
          .then((result) => setTerminal(result?.read?.text ?? ''))
          .catch(() => undefined)
        return
      }
      setError(
        reason instanceof Error ? reason.message : t('agents.sendFailed'),
      )
    } finally {
      setSending(false)
    }
  }
  const choose = async (key: string) => {
    setSending(true)
    try {
      await api.chooseHerdrMenuOption(decodedPaneId, key)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('agents.sendFailed'),
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="root-page agent-pane-page">
      <ScopedRootHeader
        title={
          pane?.terminal_title_stripped || pane?.agent || t('agents.agent')
        }
        childOnPhone
        actions={
          <div
            className="agent-view-toggle"
            role="group"
            aria-label={t('agents.view')}
          >
            <button
              className={`chip-button${view === 'chat' ? ' active' : ''}`}
              onClick={() => setView('chat')}
            >
              {t('agents.chat')}
            </button>
            <button
              className={`chip-button${view === 'terminal' ? ' active' : ''}`}
              onClick={() => setView('terminal')}
            >
              <TerminalSquare size={15} /> {t('agents.terminal')}
            </button>
          </div>
        }
      />
      <div className="agent-pane-body">
        {blockedPrompt ? (
          <aside className="agent-blocked-card">
            <span>{t('agents.needsYou')}</span>
            <strong>{blockedPrompt.question}</strong>
            <div>
              <button
                className="quiet-text-button"
                disabled={sending}
                onClick={() => void choose(blockedPrompt.deny.key)}
              >
                {t('agents.deny')}
              </button>
              <button
                className="chip-button active"
                disabled={sending}
                onClick={() => void choose(blockedPrompt.allow.key)}
              >
                {t('agents.allow')}
              </button>
            </div>
          </aside>
        ) : null}
        {view === 'chat' ? (
          <div className="agent-chat" aria-live="polite">
            {start > 0 ? (
              <button
                className="quiet-text-button agent-load-older"
                onClick={() => void loadChat(start, true)}
              >
                {t('agents.loadOlder')}
              </button>
            ) : null}
            {items.map((item) => (
              <article className={`agent-message ${item.kind}`} key={item.id}>
                {item.text ? <MarkdownContent text={item.text} /> : null}
                {item.tool ? (
                  <p>
                    <strong>{item.tool.name}</strong>
                    {item.tool.summary ? ` — ${item.tool.summary}` : ''}
                  </p>
                ) : null}
              </article>
            ))}
            {queued.map((item) => (
              <article className="agent-message queued" key={item.id}>
                {item.text}
              </article>
            ))}
          </div>
        ) : (
          <pre className="agent-terminal">
            {terminal || t('agents.terminalWaiting')}
          </pre>
        )}
        {error ? <p className="settings-error agent-error">{error}</p> : null}
      </div>
      <footer className="agent-composer">
        <textarea
          value={draft}
          aria-label={t('agents.message')}
          placeholder={t('agents.messagePlaceholder')}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          className="quiet-icon-button agent-send"
          aria-label={t('agents.send')}
          disabled={!draft.trim() || sending}
          onClick={() => void send()}
        >
          <Send size={19} />
        </button>
      </footer>
    </section>
  )
}
