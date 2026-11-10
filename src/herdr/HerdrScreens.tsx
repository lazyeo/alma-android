import {
  CornerDownLeft,
  Grid3X3,
  Keyboard,
  KeyboardOff,
  MessageCircle,
  Send,
  SquareTerminal,
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
  type CSSProperties,
} from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { THIS_HERDR_COMPUTER } from '../desktopRoutes'
import { herdrComputerIdPattern } from './computers'
import { BottomSheet } from '../components/BottomSheet'
import {
  ComposerAttachments,
  ComposerAttachmentTray,
} from '../components/ComposerAttachments'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import { MessageView } from '../messages'
import { MarkdownContent } from '../screens/MarkdownContent'
import { ImageGalleryProvider } from '../screens/ImageGallery'
import { RelayImage } from '../screens/RelayImage'
import { downscaleImage } from '../screens/imageProcessing'
import {
  isPendingAttachment,
  type ComposerAttachment,
} from '../screens/attachmentUpload'
import {
  HERDR_KEY_MAP,
  loadKeysHidden,
  loadSnapshotDisplayMode,
  mergeTerminalHistory,
  saveKeysHidden,
  saveSnapshotDisplayMode,
  type SnapshotDisplayMode,
  type TerminalKey,
} from '../terminal/terminal'
import { useHerdr } from './HerdrProvider'
import { dictationInsertion, MicButton } from '../speech/MicButton'
import { createChatResync } from './chatResync'
import { AgentMark } from './AgentMark'
import {
  mergeChatItems,
  paneTurnTitle,
  parseBlockedPrompt,
  type HerdrPane,
} from './model'
import {
  parseAnsi,
  stripAnsi,
  TERMINAL_COLORS,
  toolView,
  type AnsiStyle,
  type AgentQuestion,
} from './transcript'
import { toMessageRows, type HerdrChatItem } from './toMessageParts'
import { pendingAgentQuestion } from './lastAssistantText'
import { nextTerminalScrollTop } from '../terminal/terminalScroll'
import { agentStatusLine } from './statusLine'
import { HerdrWorkingBar } from './HerdrWorkingBar'
import { HerdrSubagentPill, HerdrSubagentsSheet } from './HerdrSubagents'
import { listSubagents, runningCount } from './subagents'
import { usePageVisible } from './usePageVisible'
import { HerdrUploadUnsupportedError } from '../relay/almaApi'
import {
  commandInsertion,
  filterHerdrCommands,
  mergeHerdrCommands,
  normalizeHerdrCommands,
  type HerdrCommand,
} from './commands'
import { BUILTIN_HERDR_COMMANDS } from './builtinCommands'
import { detectOpenMenu } from './menuGuard'
import {
  buildHerdrPrompt,
  HERDR_CHUNK_BYTES,
  HERDR_MAX_UPLOAD_BYTES,
  planHerdrUpload,
} from './attachments'

const TerminalView = lazy(() =>
  import('../terminal/TerminalView').then((module) => ({
    default: module.TerminalView,
  })),
)

type ChatItem = HerdrChatItem
type ChatPage = { items?: ChatItem[]; start?: number; end?: number }
type ChatResponse = {
  session_id?: string
  page?: ChatPage
  queued?: Array<{ id: string; text: string }>
  error?: { code?: string; message?: string }
}

/** `?computer=` of a pane link: an id, undefined (this desktop) or none. */
function herdrComputerFromSearch(search: string | undefined) {
  const value = new URLSearchParams(search ?? '').get('computer')
  if (value === null) return null
  if (value === THIS_HERDR_COMPUTER) return undefined
  return herdrComputerIdPattern.test(value) ? value : null
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
  const pageVisible = usePageVisible()
  const { desktopId = '', paneId = '' } = useParams()
  const decodedDesktopId = decodeURIComponent(desktopId)
  const decodedPaneId = decodeURIComponent(paneId)
  const connection = useConnection()
  const { byDesktop, apiFor, computerFor, selectComputer } = useHerdr()
  // A link from a notification names its computer; it wins over the current
  // choice (pane ids repeat across computers) and becomes the choice.
  const pinnedComputer = herdrComputerFromSearch(useLocation().search)
  useEffect(() => {
    if (
      pinnedComputer !== null &&
      computerFor(decodedDesktopId) !== pinnedComputer
    )
      selectComputer(decodedDesktopId, pinnedComputer)
    // Only when the link changes; later choices on the page stay the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedDesktopId, pinnedComputer])
  // Herdr may be on another computer the desktop reaches; that API has the
  // computer's prefix and no live sockets, so this screen polls instead.
  const api =
    pinnedComputer !== null
      ? connection.api.forHerdrComputer(pinnedComputer)
      : (apiFor(decodedDesktopId) ?? connection.api)
  const remote = api.herdrComputer !== undefined
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
  const sessionRef = useRef<string>()
  const [chatReady, setChatReady] = useState(false)
  const [chatUnsupported, setChatUnsupported] = useState(false)
  const [terminal, setTerminal] = useState('')
  const [workingStatus, setWorkingStatus] = useState<{
    text: string
    startedAt?: number
  }>({ text: '' })
  const workingPollState = useRef<{
    working: boolean
    stoppedAt?: number
    statusLive: boolean
  }>({ working: false, statusLive: false })
  const paneWorking = pane?.agent_status === 'working'
  if (paneWorking) workingPollState.current.stoppedAt = undefined
  else if (workingPollState.current.working)
    workingPollState.current.stoppedAt = Date.now()
  workingPollState.current.working = paneWorking
  const [terminalHistory, setTerminalHistory] = useState('')
  const [terminalHistoryEmpty, setTerminalHistoryEmpty] = useState(false)
  const [loadingTerminalHistory, setLoadingTerminalHistory] = useState(false)
  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 })
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const commandCache = useRef(new Map<string, HerdrCommand[]>())
  const [commands, setCommands] = useState<HerdrCommand[]>([])
  const [commandsLoading, setCommandsLoading] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [commandsDismissed, setCommandsDismissed] = useState(false)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  const [keysHidden, setKeysHidden] = useState(loadKeysHidden)
  const [composing, setComposing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [pendingMenuSend, setPendingMenuSend] = useState<string | null>(null)
  const [subagentSheetOpen, setSubagentSheetOpen] = useState(false)

  const toggleTerminalDisplayMode = () => {
    setTerminalHistory('')
    setTerminalHistoryEmpty(false)
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
      if (!prepend) sessionRef.current = response.session_id
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
    setView('chat')
    setItems([])
    setQueued([])
    setStart(-1)
    endRef.current = 0
    setChatReady(false)
    setChatUnsupported(false)
    setTerminal('')
    setWorkingStatus({ text: '' })
    setTerminalHistory('')
    setTerminalHistoryEmpty(false)
    setLoadingTerminalHistory(false)
    setTerminalSize({ cols: 80, rows: 24 })
    setDraft('')
    commandCache.current.clear()
    setCommands([])
    setCommandsLoading(false)
    setComposerFocused(false)
    setCommandsDismissed(false)
    revokeAttachmentPreviews(attachmentsRef.current)
    setAttachments([])
    setSending(false)
    setError('')
    setSubagentSheetOpen(false)
    scrollMemory.current = { chat: null, terminal: null }
    prependAnchor.current = null
    terminalScrollState.current = {
      scrollTop: 0,
      scrollHeight: 0,
      pinned: true,
      prepending: false,
    }
    void loadChat().catch((reason) => setError(String(reason)))
  }, [decodedPaneId, loadChat])
  useEffect(() => () => revokeAttachmentPreviews(attachmentsRef.current), [])
  useEffect(() => {
    if (view !== 'terminal' || !remote || !pageVisible) return
    let current = true
    let timeout = 0
    const poll = async () => {
      try {
        const result = await api.readHerdrPane(decodedPaneId)
        if (current) setTerminal(result?.read?.text ?? '')
      } catch {
        /* the next read retries; the last screen stays up meanwhile */
      }
      if (current)
        timeout = window.setTimeout(poll, paneWorking ? 2_000 : 10_000)
    }
    void poll()
    return () => {
      current = false
      window.clearTimeout(timeout)
    }
  }, [api, decodedPaneId, pageVisible, paneWorking, remote, view])
  useEffect(() => {
    if (view !== 'terminal' || remote) return
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
  }, [api, decodedPaneId, remote, view])
  // Opened once the first page is in, so `from` resumes after it. The helper
  // keeps one live socket and reopens from the latest byte offset after gaps.
  useEffect(() => {
    if (!chatReady || !remote || !pageVisible) return
    let current = true
    let timeout = 0
    const poll = async () => {
      try {
        const response = (await api.getHerdrChat(
          decodedPaneId,
          -1,
          60,
        )) as ChatResponse
        if (!current) return
        const page = response.page
        // Polls only fetch the newest page, so a new session, an error
        // (e.g. no session any more) or a page that starts past what is
        // shown (missed items) reloads like the socket's session_changed.
        if (
          response.error ||
          (response.session_id !== undefined &&
            response.session_id !== sessionRef.current) ||
          (typeof page?.start === 'number' && page.start > endRef.current)
        ) {
          current = false
          setItems([])
          setQueued([])
          endRef.current = 0
          setChatReady(false)
          void loadChat().catch((reason) => setError(String(reason)))
          return
        }
        if (page?.items)
          setItems((items) => mergeChatItems(items, page.items ?? [], 'append'))
        if (response.queued) setQueued(response.queued)
        if (typeof page?.end === 'number') endRef.current = page.end
      } catch {
        /* the next poll retries */
      }
      if (current)
        timeout = window.setTimeout(poll, paneWorking ? 2_000 : 10_000)
    }
    timeout = window.setTimeout(poll, paneWorking ? 2_000 : 10_000)
    return () => {
      current = false
      window.clearTimeout(timeout)
    }
  }, [
    api,
    chatReady,
    decodedPaneId,
    loadChat,
    pageVisible,
    paneWorking,
    remote,
  ])
  useEffect(() => {
    if (!chatReady || remote) return
    const resync = createChatResync({
      getEnd: () => endRef.current,
      open: (from, onMessage, onClose) => {
        const socket = api.openJsonSocket(
          `/ws/herdr/chat?pane=${encodeURIComponent(decodedPaneId)}&from=${from}`,
          onMessage,
        )
        socket.onClose(onClose)
        return socket
      },
      onEvent: (event) => {
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
    })
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resync.visible()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    resync.start()
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      resync.stop()
    }
  }, [api, chatReady, decodedPaneId, loadChat, remote])

  const blockedPrompt = useMemo(() => {
    if (pane?.agent_status !== 'blocked') return null
    const prompt = parseBlockedPrompt(stripAnsi(terminal))
    if (!prompt) return null
    // The screen gives the menu; the transcript gives the agent's exact words.
    const question = pendingAgentQuestion(
      items,
      prompt.options.map((option) => option.label),
    )
    return question ? { ...prompt, question } : prompt
  }, [items, pane?.agent_status, terminal])
  const turnTitle = pane ? paneTurnTitle(pane) : undefined
  useEffect(() => {
    if (pane?.agent_status !== 'blocked' || terminal) return
    void api
      .readHerdrPane(decodedPaneId)
      .then((result) => setTerminal(result?.read?.text ?? ''))
      .catch(() => undefined)
  }, [api, decodedPaneId, pane?.agent_status, terminal])
  useEffect(() => {
    if (!pane?.agent?.toLowerCase().includes('claude')) return
    const working = pane.agent_status === 'working'
    let current = true
    let timeout = 0
    const poll = async () => {
      try {
        const result = await api.readHerdrPane(decodedPaneId)
        if (!current) return
        const status = agentStatusLine(result?.read?.text ?? '')
        workingPollState.current.statusLive = status.live
        if (status.live) {
          setWorkingStatus((previous) => ({
            text: status.text,
            startedAt:
              status.elapsedMs === undefined
                ? (previous.startedAt ?? Date.now())
                : Date.now() - status.elapsedMs,
          }))
        }
        const stoppedAt = workingPollState.current.stoppedAt
        if (
          working ||
          (stoppedAt !== undefined &&
            Date.now() - stoppedAt < (status.live ? 60_000 : 4_000))
        )
          timeout = window.setTimeout(poll, working ? 2_000 : 800)
      } catch {
        if (current && working) timeout = window.setTimeout(poll, 2_000)
      }
    }
    const stoppedAt = workingPollState.current.stoppedAt
    const tailActive =
      stoppedAt !== undefined &&
      Date.now() - stoppedAt <
        (workingPollState.current.statusLive ? 60_000 : 4_000)
    if (pageVisible && (working || tailActive)) void poll()
    return () => {
      current = false
      window.clearTimeout(timeout)
    }
  }, [api, decodedPaneId, pageVisible, pane?.agent, pane?.agent_status])

  // Each view keeps its own scroll offset; null means "pinned to the bottom",
  // which is also where a view starts and what keeps it following new output.
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollMemory = useRef<Record<'chat' | 'terminal', number | null>>({
    chat: null,
    terminal: null,
  })
  const prependAnchor = useRef<number | null>(null)
  const terminalScrollRef = useRef<HTMLDivElement>(null)
  const terminalScrollState = useRef({
    scrollTop: 0,
    scrollHeight: 0,
    pinned: true,
    prepending: false,
  })
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
      // Older chat messages were inserted above: keep the same message in view.
      body.scrollTop = body.scrollHeight - prependAnchor.current
      prependAnchor.current = null
      rememberScroll()
    } else if (view === 'chat' && scrollMemory.current.chat === null)
      body.scrollTop = body.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, queued, blockedPrompt])
  useLayoutEffect(() => {
    const scroller = terminalScrollRef.current
    if (!scroller || view !== 'terminal') return
    const previous = terminalScrollState.current
    scroller.scrollTop = nextTerminalScrollTop({
      previousScrollTop: previous.scrollTop,
      previousScrollHeight: previous.scrollHeight,
      nextScrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      prepending: previous.prepending,
      pinned: previous.pinned,
    })
    terminalScrollState.current = {
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      pinned: isPinnedToBottom(scroller),
      prepending: false,
    }
  }, [terminal, terminalHistory, terminalHistoryEmpty, view])
  const loadOlder = () => {
    const body = bodyRef.current
    if (body) prependAnchor.current = body.scrollHeight - body.scrollTop
    void loadChat(start, true).catch((reason) => {
      prependAnchor.current = null
      setError(String(reason))
    })
  }
  const loadTerminalHistory = () => {
    if (loadingTerminalHistory) return
    const scroller = terminalScrollRef.current
    if (scroller)
      terminalScrollState.current = {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        pinned: isPinnedToBottom(scroller),
        prepending: true,
      }
    setLoadingTerminalHistory(true)
    setTerminalHistoryEmpty(false)
    const source =
      terminalDisplayMode === 'reflow' ? 'recent_unwrapped' : 'recent'
    // herdr sometimes returns only the live screen for format=ansi while
    // format=text still carries scrollback; fall back to plain text then.
    void Promise.all(
      (['ansi', 'text'] as const).map((format) =>
        api.readHerdrPane(decodedPaneId, format, { source, lines: 2000 }),
      ),
    )
      .then(([ansi, text]) => {
        const colored = mergeTerminalHistory(ansi?.read?.text ?? '', terminal)
        const plain = mergeTerminalHistory(text?.read?.text ?? '', terminal)
        const merged =
          colored.text.split('\n').length >= plain.text.split('\n').length
            ? colored
            : plain
        setTerminalHistory(merged.text)
        setTerminalHistoryEmpty(!merged.hasEarlier)
      })
      .catch((reason) => {
        terminalScrollState.current.prepending = false
        setError(String(reason))
      })
      .finally(() => setLoadingTerminalHistory(false))
  }
  // Only the newest unanswered question offers its options as replies.
  const rows = useMemo(() => toMessageRows(items), [items])
  const subagents = useMemo(() => listSubagents(items), [items])
  const activeSubagentCount = useMemo(
    () => runningCount(subagents),
    [subagents],
  )
  const answerableId = useMemo(() => {
    const last = rows.at(-1)
    return last?.questions ? last.id : undefined
  }, [rows])
  const commandAgent = (() => {
    const agent = pane?.agent?.toLowerCase()
    return agent === 'claude' || agent === 'codex' || agent === 'pi'
      ? agent
      : undefined
  })()
  const commandMatch = /^\/(\S*)$/.exec(draft)
  const commandQuery = commandMatch?.[1] ?? ''
  const commandResults = useMemo(
    () => filterHerdrCommands(commands, commandQuery),
    [commandQuery, commands],
  )
  const commandsOpen =
    view === 'chat' &&
    !chatUnsupported &&
    !!commandAgent &&
    !!commandMatch &&
    composerFocused &&
    !commandsDismissed

  useEffect(() => {
    if (!commandsOpen || !commandAgent) return
    const key = `${decodedPaneId}\u0000${commandAgent}`
    const cached = commandCache.current.get(key)
    if (cached) {
      setCommands(cached)
      return
    }
    let current = true
    setCommandsLoading(true)
    void api
      .getHerdrCommands(commandAgent, decodedPaneId)
      .then((response) => {
        if (!current) return
        const merged = mergeHerdrCommands(
          normalizeHerdrCommands(response),
          BUILTIN_HERDR_COMMANDS[commandAgent],
        )
        commandCache.current.set(key, merged)
        setCommands(merged)
      })
      .catch(() => {
        if (!current) return
        const builtins = BUILTIN_HERDR_COMMANDS[commandAgent]
        commandCache.current.set(key, builtins)
        setCommands(builtins)
      })
      .finally(() => {
        if (current) setCommandsLoading(false)
      })
    return () => {
      current = false
    }
  }, [api, commandAgent, commandsOpen, decodedPaneId])

  const selectCommand = (command: HerdrCommand) => {
    setDraft(commandInsertion(command))
    setCommandsDismissed(true)
    composerRef.current?.focus()
  }

  const send = async (text = draft, skipMenuGuard = false) => {
    const prompt = text.trim()
    const pendingAttachments = view === 'chat' ? attachments : []
    if (
      (!skipMenuGuard && sending) ||
      composing ||
      (view === 'chat' && !prompt && pendingAttachments.length === 0)
    )
      return
    setSending(true)
    setError('')
    try {
      if (view === 'terminal') {
        if (text) await api.sendHerdrPaneText(decodedPaneId, text)
        await api.sendHerdrPaneKeys(decodedPaneId, [HERDR_KEY_MAP.enter])
      } else {
        if (!skipMenuGuard && pane?.agent_status !== 'blocked') {
          try {
            const screen = await api.readHerdrPane(decodedPaneId)
            if (
              detectOpenMenu(screen?.read?.text ?? '')?.kind === 'cursor-list'
            ) {
              setPendingMenuSend(text)
              return
            }
          } catch {
            // Best effort only: a failed read must never block a chat send.
          }
        }
        const paths: string[] = []
        for (const attachment of pendingAttachments) {
          if (!isPendingAttachment(attachment)) continue
          let blob = attachment.pending.blob
          let mediaType = attachment.mediaType
          let temporaryPreview = ''
          if (attachment.kind === 'image') {
            const processed = await downscaleImage(
              new File([blob], attachment.name, { type: mediaType }),
              HERDR_MAX_UPLOAD_BYTES,
            )
            blob = new Blob([processed.bytes.slice().buffer], {
              type: processed.mediaType,
            })
            mediaType = processed.mediaType
            temporaryPreview = processed.previewUrl
          }
          try {
            const bytes = new Uint8Array(await blob.arrayBuffer())
            const plan = planHerdrUpload(bytes.byteLength)
            if (plan === 'tooLarge')
              throw new Error(
                t('composer.attachments.tooLarge', { name: attachment.name }),
              )
            const result =
              plan === 'chunked'
                ? await api.herdrUploadChunked(
                    bytes,
                    mediaType,
                    attachment.name,
                    { chunkBytes: HERDR_CHUNK_BYTES },
                  )
                : await api.herdrUpload(bytes, mediaType, attachment.name)
            paths.push(result.path)
          } finally {
            if (temporaryPreview) URL.revokeObjectURL(temporaryPreview)
          }
        }
        const herdrPrompt = buildHerdrPrompt(paths, prompt)
        if (pane?.agent_status === 'blocked')
          await api.sendHerdrBlockedText(decodedPaneId, herdrPrompt)
        else {
          await api.promptHerdrAgent(decodedPaneId, herdrPrompt)
          const commandName = /^\/(\S+)/.exec(prompt)?.[1]?.toLowerCase()
          const availableCommands =
            commands.length > 0
              ? commands
              : commandAgent
                ? BUILTIN_HERDR_COMMANDS[commandAgent]
                : []
          if (
            commandName &&
            availableCommands.find(
              (command) => command.name.toLowerCase() === commandName,
            )?.interactive
          )
            setView('terminal')
        }
      }
      if (text === draft) {
        setDraft('')
        revokeAttachmentPreviews(pendingAttachments)
        setAttachments([])
      }
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
        reason instanceof HerdrUploadUnsupportedError
          ? t('composer.attachments.updateDesktop')
          : reason instanceof Error
            ? reason.message
            : t('agents.sendFailed'),
      )
    } finally {
      setSending(false)
    }
  }
  const closeMenuAndSend = async () => {
    const text = pendingMenuSend
    if (text === null) return
    setSending(true)
    setError('')
    try {
      await api.sendHerdrPaneKeys(decodedPaneId, [HERDR_KEY_MAP.escape])
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      const screen = await api.readHerdrPane(decodedPaneId)
      if (detectOpenMenu(screen?.read?.text ?? '')) {
        setPendingMenuSend(null)
        setError(t('agents.menuStillOpen'))
        return
      }
      setPendingMenuSend(null)
      await send(text, true)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('agents.sendFailed'),
      )
    } finally {
      setSending(false)
    }
  }
  const choose = async (optionNumber: number) => {
    setSending(true)
    try {
      await api.chooseHerdrMenuOption(
        decodedPaneId,
        blockedPrompt?.selectedIndex,
        optionNumber,
      )
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

  const galleryImages = useMemo(
    () =>
      rows.flatMap((row) =>
        (row.message.parts ?? []).flatMap((part) =>
          part.type === 'file' &&
          typeof part.url === 'string' &&
          typeof part.mediaType === 'string' &&
          part.mediaType.startsWith('image/')
            ? [
                {
                  source: part.url,
                  name:
                    typeof part.filename === 'string' ? part.filename : 'image',
                },
              ]
            : [],
        ),
      ),
    [rows],
  )

  return (
    <ImageGalleryProvider images={galleryImages}>
      <section className="root-page agent-pane-page">
        <ScopedRootHeader
          title={
            <>
              {pane?.agent ? (
                <AgentMark
                  agent={
                    pane.agent_session &&
                    typeof pane.agent_session === 'object' &&
                    'agent' in pane.agent_session &&
                    typeof pane.agent_session.agent === 'string'
                      ? pane.agent_session.agent
                      : pane.agent
                  }
                />
              ) : null}
              <span>
                {pane?.terminal_title_stripped ||
                  pane?.agent ||
                  t('agents.agent')}
              </span>
            </>
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
                  aria-label={t('agents.chat')}
                  aria-pressed={view === 'chat'}
                  onClick={() => setView('chat')}
                >
                  <MessageCircle size={15} />
                  <span>{t('agents.chat')}</span>
                </button>
              )}
              <button
                aria-label={t('agents.terminal')}
                aria-pressed={view === 'terminal'}
                onClick={() => setView('terminal')}
              >
                <SquareTerminal size={15} />
                <span>{t('agents.terminal')}</span>
              </button>
            </div>
          }
        />
        <div
          className={`agent-pane-body agent-pane-body-${view}`}
          ref={bodyRef}
          onScroll={rememberScroll}
        >
          {view === 'chat' && blockedPrompt ? (
            <aside className="agent-blocked-card">
              <span>{t('agents.needsYou')}</span>
              {turnTitle ? (
                <small className="agent-blocked-context">{turnTitle}</small>
              ) : null}
              <strong>{blockedPrompt.question}</strong>
              <div className="agent-menu-options">
                {blockedPrompt.options.map((option, index) => (
                  <button
                    className={`chip-button agent-menu-option${index === blockedPrompt.selectedIndex ? ' active' : ''}`}
                    disabled={sending}
                    key={option.number}
                    onClick={() => void choose(option.number)}
                    title={option.label}
                    aria-label={`${option.number}. ${option.label}`}
                  >
                    <span>{option.number}.</span> {option.label}
                  </button>
                ))}
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
              {rows.map((row) => (
                <MessageView
                  key={row.id}
                  row={row}
                  capabilities={{
                    renderMarkdown: (text) => <MarkdownContent text={text} />,
                    renderImage: (source, name) => (
                      <RelayImage api={api} source={source} name={name} />
                    ),
                  }}
                  below={
                    row.questions ? (
                      <AgentQuestions
                        questions={row.questions}
                        onAnswer={
                          row.id === answerableId && !sending
                            ? (label) => void send(label)
                            : undefined
                        }
                      />
                    ) : undefined
                  }
                />
              ))}
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
              <div
                className="agent-terminal-card"
                style={
                  {
                    '--agent-terminal-bg': TERMINAL_COLORS.bg,
                    '--agent-terminal-fg': TERMINAL_COLORS.fg,
                  } as CSSProperties
                }
              >
                <button
                  className="quiet-icon-button agent-terminal-mode"
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
                  data-sidebar-swipe-exclude
                  onClick={toggleTerminalDisplayMode}
                >
                  {/* Icon and text both show the current mode; aria names the action. */}
                  {terminalDisplayMode === 'reflow' ? (
                    <WrapText size={14} />
                  ) : (
                    <Grid3X3 size={14} />
                  )}
                  <span>
                    {terminalDisplayMode === 'reflow'
                      ? t('agents.terminalModeFit')
                      : t('agents.terminalModeGrid')}
                  </span>
                </button>
                <div
                  className={`agent-terminal-scroll agent-terminal-scroll-${terminalDisplayMode}`}
                  ref={terminalScrollRef}
                  data-terminal-metrics-host=""
                  onScroll={(event) => {
                    const scroller = event.currentTarget
                    terminalScrollState.current = {
                      scrollTop: scroller.scrollTop,
                      scrollHeight: scroller.scrollHeight,
                      pinned: isPinnedToBottom(scroller),
                      prepending: false,
                    }
                    if (
                      scroller.scrollTop === 0 &&
                      !terminalHistory &&
                      !terminalHistoryEmpty
                    )
                      loadTerminalHistory()
                  }}
                >
                  {terminalHistoryEmpty ? (
                    <p className="agent-terminal-note">
                      {t('agents.noEarlierOutput')}
                    </p>
                  ) : (
                    <button
                      className="quiet-text-button agent-load-terminal-history"
                      disabled={loadingTerminalHistory}
                      onClick={loadTerminalHistory}
                    >
                      {t('agents.loadEarlierOutput')}
                    </button>
                  )}
                  <div className="agent-terminal-content">
                    {terminalHistory ? (
                      <TerminalHistory
                        text={terminalHistory}
                        displayMode={terminalDisplayMode}
                      />
                    ) : null}
                    {terminalHistory ? (
                      <div className="agent-terminal-history-gap" />
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
                  </div>
                </div>
              </div>
              {keysHidden ? null : (
                <TerminalKeyRow disabled={sending} onKey={sendTerminalKey} />
              )}
            </div>
          )}
          {error ? <p className="settings-error agent-error">{error}</p> : null}
        </div>
        {view === 'chat' &&
        (pane?.agent_status === 'working' || subagents.length > 0) ? (
          <HerdrWorkingBar
            working={pane?.agent_status === 'working'}
            items={items}
            statusText={workingStatus.text}
            statusStartedAt={workingStatus.startedAt}
            leading={
              subagents.length > 0 ? (
                <HerdrSubagentPill
                  agent={pane?.agent}
                  count={activeSubagentCount}
                  onClick={() => setSubagentSheetOpen(true)}
                />
              ) : undefined
            }
            onStop={() =>
              void api.sendHerdrPaneKeys(decodedPaneId, [HERDR_KEY_MAP.escape])
            }
          />
        ) : null}
        {pendingMenuSend !== null ? (
          <BottomSheet
            title={t('agents.menuOpenTitle')}
            onClose={() => setPendingMenuSend(null)}
            footer={
              <div className="sheet-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setPendingMenuSend(null)
                    setView('terminal')
                  }}
                >
                  {t('agents.menuOpenTerminal')}
                </button>
                <button
                  className="primary"
                  disabled={sending}
                  onClick={() => void closeMenuAndSend()}
                >
                  {t('agents.menuCloseAndSend')}
                </button>
              </div>
            }
          >
            <p>{t('agents.menuOpenDescription')}</p>
          </BottomSheet>
        ) : null}
        {subagentSheetOpen ? (
          <HerdrSubagentsSheet
            api={api}
            paneId={decodedPaneId}
            parentAgent={pane?.agent}
            subagents={subagents}
            onClose={() => setSubagentSheetOpen(false)}
          />
        ) : null}
        {view === 'chat' && !chatUnsupported && api.herdrUploadsSupported ? (
          <ComposerAttachmentTray
            api={api}
            attachments={attachments}
            onChange={setAttachments}
            onAnnotationText={(text) =>
              setDraft((current) =>
                [current.trimEnd(), text].filter(Boolean).join('\n\n'),
              )
            }
          />
        ) : null}
        <footer className="agent-composer">
          {commandsOpen ? (
            <div
              className="agent-command-popover"
              role="listbox"
              aria-label={t('agents.commands')}
            >
              {commandsLoading && commands.length === 0 ? (
                <p className="agent-command-state">
                  {t('agents.commandsLoading')}
                </p>
              ) : commandResults.length === 0 ? (
                <p className="agent-command-state">
                  {t('agents.commandsEmpty')}
                </p>
              ) : (
                commandResults.map((command) => (
                  <button
                    className="agent-command-option"
                    key={`${command.source}:${command.name}`}
                    role="option"
                    aria-selected="false"
                    aria-label={`/${command.name}${command.hint ? ` ${command.hint}` : ''}${command.description ? `: ${command.description}` : ''}`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      selectCommand(command)
                    }}
                  >
                    <span className="agent-command-copy">
                      <strong>
                        /{command.name}
                        {command.hint ? (
                          <span className="agent-command-hint">
                            {' '}
                            {command.hint}
                          </span>
                        ) : null}
                      </strong>
                      {command.description ? (
                        <span>{command.description}</span>
                      ) : null}
                    </span>
                    <span className="agent-command-source">
                      {t(`agents.commandSource.${command.source}`)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
          {view === 'chat' && !chatUnsupported && api.herdrUploadsSupported ? (
            <ComposerAttachments
              attachments={attachments}
              onChange={setAttachments}
              onError={setError}
              maxAttachments={6}
              maxFileBytes={HERDR_MAX_UPLOAD_BYTES}
              preprocessImages={false}
            />
          ) : view === 'terminal' ? (
            <button
              className="quiet-icon-button agent-keys-visibility"
              aria-label={
                keysHidden ? t('agents.showKeys') : t('agents.hideKeys')
              }
              aria-pressed={!keysHidden}
              onClick={() =>
                setKeysHidden((current) => {
                  const next = !current
                  saveKeysHidden(next)
                  return next
                })
              }
            >
              {keysHidden ? <Keyboard size={17} /> : <KeyboardOff size={17} />}
            </button>
          ) : null}
          <textarea
            ref={composerRef}
            value={draft}
            aria-label={
              view === 'terminal'
                ? t('agents.terminalText')
                : t('agents.message')
            }
            placeholder={
              view === 'terminal'
                ? t('agents.terminalTextPlaceholder')
                : t('agents.messagePlaceholder')
            }
            rows={1}
            onChange={(event) => {
              setDraft(event.target.value)
              setCommandsDismissed(false)
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(event) => {
              if (composing) return
              if (commandsOpen && event.key === 'Escape') {
                event.preventDefault()
                setCommandsDismissed(true)
                return
              }
              if (view === 'terminal') {
                const key = keyboardTerminalKey(event)
                const editsComposer =
                  draft.length > 0 &&
                  (key === 'backspace' ||
                    key === 'left' ||
                    key === 'right' ||
                    key === 'up' ||
                    key === 'down')
                if (key && !editsComposer) {
                  event.preventDefault()
                  void sendTerminalKey(key)
                  return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void send()
                }
                return
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <MicButton
            surface="herdr"
            draft={() => composerRef.current?.value ?? draft}
            // send() takes the text itself, so no extra render is needed.
            onSend={(spoken) => void send(spoken)}
            onInsert={(spoken, at) => {
              const next = dictationInsertion(
                composerRef.current,
                composerRef.current?.value ?? draft,
                spoken,
                at,
              )
              setDraft(next.value)
              requestAnimationFrame(() => {
                const area = composerRef.current
                area?.focus()
                area?.setSelectionRange(next.caret, next.caret)
              })
            }}
          />
          <button
            className="quiet-icon-button agent-send"
            aria-label={
              view === 'terminal' ? t('agents.enter') : t('agents.send')
            }
            disabled={
              (view === 'chat' && !draft.trim() && attachments.length === 0) ||
              sending
            }
            onClick={() => void send()}
          >
            {view === 'terminal' ? (
              <CornerDownLeft size={19} />
            ) : (
              <Send size={19} />
            )}
          </button>
        </footer>
      </section>
    </ImageGalleryProvider>
  )
}

function TerminalHistory({
  text,
  displayMode,
}: {
  text: string
  displayMode: SnapshotDisplayMode
}) {
  return (
    <pre
      className={`agent-terminal-history agent-terminal-history-${displayMode}`}
      data-history-first-line={stripAnsi(text).split('\n')[0] ?? ''}
      style={{
        backgroundColor: TERMINAL_COLORS.bg,
        color: TERMINAL_COLORS.fg,
        // Match the live xterm's computed metrics (TerminalView sets these on
        // the data-terminal-metrics-host scroller); tokens are the fallback.
        fontSize: 'var(--terminal-font-size, var(--text-xs))',
        lineHeight: 'var(--terminal-line-height, var(--leading-tight))',
      }}
    >
      {parseAnsi(text).map((segment, index) => (
        <span style={ansiStyle(segment.style)} key={index}>
          {segment.text}
        </span>
      ))}
    </pre>
  )
}

function ansiStyle(style: AnsiStyle) {
  return {
    color: style.fg,
    backgroundColor: style.bg,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: style.underline ? 'underline' : undefined,
    opacity: style.dim ? 0.65 : undefined,
    filter: style.inverse ? 'invert(1)' : undefined,
  }
}

function AgentQuestions({
  questions,
  onAnswer,
}: {
  questions: AgentQuestion[]
  onAnswer?: (label: string) => void
}) {
  return (
    <div className="agent-question">
      {questions.map((question, index) => (
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
    </div>
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
  { key: 'backspace', label: '⌫', aria: 'terminalKeyBackspace' },
  { key: 'tab', label: 'tab', aria: 'terminalKeyTab' },
  { key: 'backtab', label: '⇧tab', aria: 'terminalKeyBacktab' },
  { key: 'up', label: '↑', aria: 'terminalKeyUp' },
  { key: 'down', label: '↓', aria: 'terminalKeyDown' },
  { key: 'left', label: '←', aria: 'terminalKeyLeft' },
  { key: 'right', label: '→', aria: 'terminalKeyRight' },
]

function TerminalKeyRow({
  disabled,
  onKey,
}: {
  disabled: boolean
  onKey: (key: TerminalKey) => void
}) {
  const t = useT()
  return (
    <div
      className="agent-terminal-keys"
      role="toolbar"
      aria-label={t('agents.terminalKeys')}
    >
      <div className="agent-terminal-key-list">
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
    </div>
  )
}

const keyboardTerminalKey = (event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): TerminalKey | undefined => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c')
    return 'interrupt'
  if (event.key === 'Escape') return 'escape'
  if (event.key === 'Tab') return event.shiftKey ? 'backtab' : 'tab'
  if (event.key === 'ArrowUp') return 'up'
  if (event.key === 'ArrowDown') return 'down'
  if (event.key === 'ArrowLeft') return 'left'
  if (event.key === 'ArrowRight') return 'right'
  if (event.key === 'Backspace') return 'backspace'
  return undefined
}

const truncateOption = (label: string, maxLength = 34) =>
  label.length > maxLength
    ? `${label.slice(0, maxLength - 1).trimEnd()}…`
    : label

const isPinnedToBottom = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight < 32

const revokeAttachmentPreviews = (
  attachments: readonly ComposerAttachment[],
) => {
  for (const attachment of attachments)
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
}
