import {
  Grid3X3,
  MessageCircle,
  Send,
  TerminalSquare,
  WrapText,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useParams } from 'react-router-dom'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import { MarkdownContent } from '../screens/MarkdownContent'
import {
  HERDR_KEY_MAP,
  loadSnapshotDisplayMode,
  saveSnapshotDisplayMode,
  type SnapshotDisplayMode,
  type TerminalKey,
} from '../terminal/terminal'
import { useHerdr } from './HerdrProvider'
import { mergeChatItems, parseBlockedPrompt, type HerdrPane } from './model'
import {
  cleanAgentText,
  stripAnsi,
  toolView,
  type ToolView,
} from './transcript'

const TerminalView = lazy(() =>
  import('../terminal/TerminalView').then((module) => ({
    default: module.TerminalView,
  })),
)

type ChatItem = {
  id: string
  kind: string
  text?: string
  tool?: {
    name?: string
    summary?: string
    done?: boolean
    input?: unknown
    result?: unknown
    is_error?: boolean
  }
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

export { AgentsScreen } from './AgentsScreen'

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
  const [terminalDisplayMode, setTerminalDisplayMode] =
    useState<SnapshotDisplayMode>(loadSnapshotDisplayMode)
  const [items, setItems] = useState<ChatItem[]>([])
  const [queued, setQueued] = useState<Array<{ id: string; text: string }>>([])
  const [start, setStart] = useState(-1)
  const endRef = useRef(0)
  const [chatReady, setChatReady] = useState(false)
  const [chatUnsupported, setChatUnsupported] = useState(false)
  const [terminal, setTerminal] = useState('')
  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const toggleTerminalDisplayMode = () => {
    setTerminalDisplayMode((current) => {
      const next = current === 'reflow' ? 'grid' : 'reflow'
      saveSnapshotDisplayMode(next)
      return next
    })
  }

  const loadChat = useCallback(
    async (before = -1, prepend = false) => {
      const response = (await api.getHerdrChat(
        decodedPaneId,
        before,
        60,
      )) as ChatResponse
      if (response.error) {
        if (
          response.error.code === 'unsupported_agent' ||
          response.error.code === 'no_session'
        ) {
          setChatUnsupported(true)
          setView('terminal')
          return
        }
        throw new Error(response.error.message || response.error.code)
      }
      const page = response.page ?? {}
      setItems((current) =>
        prepend
          ? mergeChatItems(current, page.items ?? [], 'prepend')
          : mergeChatItems([], page.items ?? [], 'append'),
      )
      setQueued(response.queued ?? [])
      setStart(page.start ?? -1)
      if (!prepend) {
        endRef.current = page.end ?? 0
        setChatReady(true)
      }
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
          if (typeof event.cols === 'number' && typeof event.rows === 'number')
            setTerminalSize({ cols: event.cols, rows: event.rows })
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
  // Opened once the first page is in, so `from` resumes after it; `end` lives
  // in a ref so each batch doesn't tear the socket down and reopen it.
  useEffect(() => {
    if (!chatReady) return
    const socket = api.openJsonSocket(
      `/ws/herdr/chat?pane=${encodeURIComponent(decodedPaneId)}&from=${endRef.current}`,
      (event) => {
        if (event.type === 'items' && Array.isArray(event.items)) {
          setItems((current) =>
            mergeChatItems(current, event.items as ChatItem[], 'append'),
          )
          if (typeof event.end === 'number') endRef.current = event.end
        }
        if (event.type === 'queued' && Array.isArray(event.queued))
          setQueued(event.queued as Array<{ id: string; text: string }>)
        if (event.type === 'session_changed') {
          setItems([])
          setQueued([])
          endRef.current = 0
          setChatReady(false)
          void loadChat().catch((reason) => setError(String(reason)))
        }
      },
    )
    socket.opened.catch(() => undefined)
    return () => socket.close()
  }, [api, chatReady, decodedPaneId, loadChat])

  const blockedPrompt = useMemo(
    () =>
      pane?.agent_status === 'blocked'
        ? parseBlockedPrompt(stripAnsi(terminal))
        : null,
    [pane?.agent_status, terminal],
  )
  useEffect(() => {
    if (pane?.agent_status !== 'blocked' || terminal) return
    void api
      .readHerdrPane(decodedPaneId)
      .then((result) => setTerminal(result?.read?.text ?? ''))
      .catch(() => undefined)
  }, [api, decodedPaneId, pane?.agent_status, terminal])

  // Each view keeps its own scroll offset; null means "pinned to the bottom",
  // which is also where a view starts and what keeps it following new output.
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollMemory = useRef<Record<'chat' | 'terminal', number | null>>({
    chat: null,
    terminal: null,
  })
  const prependAnchor = useRef<number | null>(null)
  const rememberScroll = () => {
    const body = bodyRef.current
    if (!body) return
    scrollMemory.current[view] = isPinnedToBottom(body) ? null : body.scrollTop
  }
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const saved = scrollMemory.current[view]
    body.scrollTop = saved ?? body.scrollHeight
  }, [view])
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (prependAnchor.current !== null) {
      // Older messages were inserted above: keep the same message in view.
      body.scrollTop = body.scrollHeight - prependAnchor.current
      prependAnchor.current = null
      rememberScroll()
    } else if (scrollMemory.current[view] === null)
      body.scrollTop = body.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, queued, terminal, blockedPrompt])
  const loadOlder = () => {
    const body = bodyRef.current
    if (body) prependAnchor.current = body.scrollHeight - body.scrollTop
    void loadChat(start, true).catch((reason) => {
      prependAnchor.current = null
      setError(String(reason))
    })
  }
  // Only the newest unanswered question offers its options as replies.
  const answerableId = useMemo(() => {
    const last = items.at(-1)
    return last?.tool && toolView(last.tool).questions ? last.id : undefined
  }, [items])

  const send = async (text = draft) => {
    const prompt = text.trim()
    if (!prompt || sending) return
    setSending(true)
    setError('')
    try {
      if (pane?.agent_status === 'blocked')
        await api.sendHerdrBlockedText(decodedPaneId, prompt)
      else await api.promptHerdrAgent(decodedPaneId, prompt)
      if (text === draft) setDraft('')
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
  const sendTerminalKey = async (key: TerminalKey) => {
    setSending(true)
    setError('')
    try {
      await api.sendHerdrPaneKeys(decodedPaneId, [HERDR_KEY_MAP[key]])
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
            {chatUnsupported ? null : (
              <button
                className={`chip-button${view === 'chat' ? ' active' : ''}`}
                aria-label={t('agents.chat')}
                onClick={() => setView('chat')}
              >
                <MessageCircle size={15} />
                <span>{t('agents.chat')}</span>
              </button>
            )}
            <button
              className={`chip-button${view === 'terminal' ? ' active' : ''}`}
              aria-label={t('agents.terminal')}
              onClick={() => setView('terminal')}
            >
              <TerminalSquare size={15} />
              <span>{t('agents.terminal')}</span>
            </button>
          </div>
        }
      />
      <div
        className={`agent-pane-body agent-pane-body-${view}`}
        ref={bodyRef}
        onScroll={view === 'chat' ? rememberScroll : undefined}
      >
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
                onClick={loadOlder}
              >
                {t('agents.loadOlder')}
              </button>
            ) : null}
            {items.map((item) =>
              item.tool ? (
                <AgentToolItem
                  key={item.id}
                  view={toolView(item.tool)}
                  onAnswer={
                    item.id === answerableId && !sending
                      ? (label) => void send(label)
                      : undefined
                  }
                />
              ) : (
                <AgentTextItem
                  key={item.id}
                  kind={item.kind}
                  text={item.text}
                />
              ),
            )}
            {queued.map((item) => (
              <article className="agent-message queued" key={item.id}>
                {item.text}
              </article>
            ))}
          </div>
        ) : (
          <div className="agent-terminal-workspace">
            {chatUnsupported ? (
              <p className="agent-terminal-note">
                {t('agents.chatUnsupported')}
              </p>
            ) : null}
            <div className="agent-terminal-area">
              <Suspense
                fallback={
                  <div className="agent-terminal-loading">
                    {t('agents.terminalWaiting')}
                  </div>
                }
              >
                <TerminalView
                  className="agent-terminal"
                  mode="snapshot"
                  displayMode={terminalDisplayMode}
                  ariaLabel={t('agents.terminalOutput')}
                  frame={{
                    text: terminal,
                    cols: terminalSize.cols,
                    rows: terminalSize.rows,
                  }}
                  waitingText={t('agents.terminalWaiting')}
                />
              </Suspense>
            </div>
            <TerminalKeyRow
              disabled={sending}
              onKey={sendTerminalKey}
              leading={
                <button
                  className="chip-button agent-terminal-mode"
                  aria-label={
                    terminalDisplayMode === 'reflow'
                      ? t('agents.terminalUseGrid')
                      : t('agents.terminalUseReflow')
                  }
                  title={
                    terminalDisplayMode === 'reflow'
                      ? t('agents.terminalUseGrid')
                      : t('agents.terminalUseReflow')
                  }
                  onClick={toggleTerminalDisplayMode}
                >
                  {terminalDisplayMode === 'reflow' ? (
                    <Grid3X3 size={16} />
                  ) : (
                    <WrapText size={16} />
                  )}
                </button>
              }
            />
          </div>
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
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
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

function AgentTextItem({ kind, text }: { kind: string; text?: string }) {
  const cleaned = text ? cleanAgentText(text) : ''
  if (!cleaned) return null
  return (
    <article className={`agent-message ${kind}`}>
      <MarkdownContent text={cleaned} />
    </article>
  )
}

function AgentToolItem({
  view,
  onAnswer,
}: {
  view: ToolView
  onAnswer?: (label: string) => void
}) {
  const t = useT()
  if (view.questions)
    return (
      <article className="agent-message agent-question">
        {view.questions.map((question, index) => (
          <div key={index}>
            {question.question ? <strong>{question.question}</strong> : null}
            <div className="agent-question-options">
              {question.options.map((option) => (
                <button
                  key={option.label}
                  className="chip-button"
                  disabled={!onAnswer}
                  title={option.description}
                  onClick={() => onAnswer?.(option.label)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </article>
    )
  return (
    <details className={`agent-tool${view.error ? ' error' : ''}`}>
      <summary>
        <strong>{view.name}</strong>
        {view.detail ? <code>{view.detail}</code> : null}
        {view.error ? <span>{t('agents.toolFailed')}</span> : null}
      </summary>
      {view.result ? <pre>{view.result}</pre> : null}
    </details>
  )
}

const TERMINAL_KEYS: Array<{
  key: TerminalKey
  label: string
  aria:
    | 'terminalKeyEscape'
    | 'terminalKeyInterrupt'
    | 'terminalKeyEnter'
    | 'terminalKeyTab'
    | 'terminalKeyBacktab'
    | 'terminalKeyUp'
    | 'terminalKeyDown'
    | 'terminalKeyLeft'
    | 'terminalKeyRight'
    | 'terminalKeyBackspace'
}> = [
  { key: 'escape', label: 'esc', aria: 'terminalKeyEscape' },
  { key: 'interrupt', label: '⌃C', aria: 'terminalKeyInterrupt' },
  { key: 'enter', label: '⏎', aria: 'terminalKeyEnter' },
  { key: 'tab', label: 'tab', aria: 'terminalKeyTab' },
  { key: 'backtab', label: '⇧tab', aria: 'terminalKeyBacktab' },
  { key: 'up', label: '↑', aria: 'terminalKeyUp' },
  { key: 'down', label: '↓', aria: 'terminalKeyDown' },
  { key: 'left', label: '←', aria: 'terminalKeyLeft' },
  { key: 'right', label: '→', aria: 'terminalKeyRight' },
  { key: 'backspace', label: '⌫', aria: 'terminalKeyBackspace' },
]

function TerminalKeyRow({
  disabled,
  onKey,
  leading,
}: {
  disabled: boolean
  onKey: (key: TerminalKey) => void
  leading?: ReactNode
}) {
  const t = useT()
  return (
    <div
      className="agent-terminal-keys"
      role="toolbar"
      aria-label={t('agents.terminalKeys')}
    >
      {leading}
      {TERMINAL_KEYS.map((item) => (
        <button
          className="chip-button"
          key={item.key}
          disabled={disabled}
          aria-label={t(`agents.${item.aria}`)}
          onClick={() => onKey(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

const isPinnedToBottom = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight < 32
