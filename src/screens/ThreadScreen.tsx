import { useThreadQueue } from '../extensions'
import { DesktopStatusIcon } from '../desktops/DesktopSwitcher'
import { useLocation } from 'react-router-dom'
import { SelectableTextView } from '../components/SelectableTextView'
import { copyText } from '../clipboard'
import { Composer } from '../components/Composer'
import {
  ComposerAttachments,
  ComposerAttachmentTray,
} from '../components/ComposerAttachments'
import { ComposerGoal } from '../components/ComposerGoal'
import { useComposerGoal } from './useComposerGoal'
import type { ThreadGoal } from './threadGoal'
import {
  claimFirstSend,
  clearStartDraftAfterDelivery,
  decideFirstSend,
  deliverFirstSend,
  releaseFirstSend,
  type FirstSendReadiness,
} from './firstSend'
import { RecipeBanner } from './RecipeBanner'
import {
  initialRecipeSuggestionState,
  reduceRecipeSuggestion,
  recipeFromReadyEvent,
  type RecipeSuggestion,
} from './recipeSuggestions'
import { useUnreadActivity } from '../desktops/ThreadActivityProvider'
import { useLongPress } from '../components/useLongPress'
import { haptic } from '../haptics'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  AtSign,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  Folder,
  ListPlus,
  Info,
  Link,
  Maximize2,
  Minimize2,
  MoreVertical,
  Network,
  PencilLine,
  RotateCcw,
  Search,
  TextSelection,
  Trash2,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { QueuePanel } from './QueuePanel'
import {
  optimisticThreadReducer,
  pendingStatusText,
  phaseFromProgressEvent,
  type PendingAssistant,
} from './optimisticThread'
import { reasoningLive } from './streamingPresentation'
import { RelayImage } from './RelayImage'
import { ImageGalleryProvider } from './ImageGallery'
import { stageImageEditResult } from './imageEditStaging'
import { FileAwareLink, FileLinkProvider, useFileLinks } from './FileLinkSheet'
import { ThreadFilesSheet } from './ThreadFilesSheet'
import {
  aggregateFileWrites,
  collectDeliveredResources,
  collectFallbackFileWrites,
  extractUserAttachments,
  type ChangedFile,
  type FileWriteEntry,
} from './threadFiles'
import { HtmlFileChooser } from './HtmlFileChooser'
import { extractThreadImages } from './galleryModel'
import {
  Component,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MarkdownContent } from './MarkdownContent'
import { MessageView, PartView, type NestedMessageRow } from '../messages'

import { useConnection } from '../desktops/DesktopContext'
import { useRealtimeLink } from '../desktops/useRealtimeLink'
import { BottomSheet } from '../components/BottomSheet'
import { AnchoredMenu } from '../components/AnchoredMenu'
import { threadListPath, threadRouteMatch } from '../layout/splitLayout'
import { isUnsupportedEndpoint, rootRows } from '../relay/almaApi'
import { mapRelayError, type RelayErrorPresentation } from './relayError'
import {
  FOREGROUND_RECONNECT_GRACE_MS,
  foregroundLoadOutcome,
  shouldReloadAfterForeground,
} from './foregroundReload'
import { shouldReloadThread } from './threadEvents'
import type {
  AlmaModel,
  AlmaSettings,
  MessagePart,
  MessageRow,
  ReasoningEffort,
  ThreadsSocket,
  Workspace,
} from '../relay'
import { threadCache, type CachedThread } from '../relay/threadCache'
import { DeltaAccumulator } from './threadDeltas'
import {
  SubagentRuns,
  isSubagentMessageId,
  latestSubagentActivity,
  nestedRowsByParent,
  subagentEventContext,
} from './subagentLive'
import {
  effortLabel,
  groupModelsByProvider,
  normalizeEffortForModel,
  reasoningEffortsForModel,
  shortModelName,
  supportsFastMode,
  supportsReasoningEffort,
} from './modelOptions'
import { workspaceName } from './workspaceOptions'
import { useThreadDraft } from './useThreadDraft'
import {
  addQueuedMessage,
  combineQueuedMessages,
  idleQueueShouldAutoSend,
  loadThreadQueueState,
  removeQueuedMessage,
  restoreFailedSteer,
  saveThreadQueue,
  type QueuedMessage,
} from './threadQueue'
import {
  buildMessageParts,
  messageText,
  type UploadedAttachment,
} from './messageParts'
import {
  uploadPendingAttachments,
  type ComposerAttachment,
} from './attachmentUpload'
import { HandoffCards } from '../handoff/HandoffCards'
import { useHandoff } from '../handoff/HandoffProvider'
import { pendingForThread } from './inboxModel'
import {
  accumulateSessionUsage,
  applyContextUsageEvent,
  emptySessionUsage,
  usageFromCompletion,
  type ContextUsage,
  type GenerationUsage,
  type SessionUsage,
} from './contextUsage'
import {
  ContextRing,
  ContextUsageSheet,
  UsageFooter,
} from './ContextUsageSheet'
import { formatElapsed, generationStartedAt } from './threadStatus'
import {
  elapsedDuration,
  replyWorkedDuration,
  toolDuration,
} from './toolDurations'
import { formatDiffStats } from '../uiCopy'
import { replyEndReason, usageForReply } from './replyMetadata'
import { useSharedSecond } from './useSharedSecond'
import { timelineEntries } from './timelineLayout'
import { TimelineRail } from './TimelineRail'
import { useLayoutMode } from '../layout/useLayoutMode'
import {
  appendQuote,
  appendReference,
  highlightSegments,
  messageReferenceUri,
  snippetLabel,
  stripReferenceAtSigns,
} from './references'
import { RefPicker } from './RefPicker'
import { useComposerReferences } from './useComposerReferences'
import {
  RefCardSheet,
  RefChip,
  RefOpenContext,
  type OpenedRef,
} from './RefCardSheet'
import { LoadingOrb } from './LoadingOrbCanvas'
import { GenerationActivityBar } from './GenerationActivityBar'
import { TodoList, TodoSheet } from './TodoProgress'
import {
  todoProgress,
  todosFromEvent,
  todosFromRows,
  type TodoItem,
} from './threadTodos'
import { isScrolledAwayFromLatest } from './generationActivity'
import {
  activeCrewRunCount,
  crewHeaderCounts,
  crewRunCount,
  missionTimeline,
  type AgentCrew,
} from './agentCrew'
import { useAnimatedOverlay } from '../components/useAnimatedOverlay'
import { presenceClass, usePresence } from '../components/usePresence'
import { shouldFinishOverlayClose } from '../overlayClosing'
import { closeEditorAfterAcceptedSend } from './composerEditorSend'
import { openExternalUrl } from '../nativeBridge'
import { useT } from '../i18n'

// One malformed or unexpected message must not unmount the whole app: an
// uncaught render error blanks the screen and drops the back-button listener.
class MessageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Message render failed', error, info.componentStack)
  }
  render() {
    return this.state.failed ? <MessageRenderError /> : this.props.children
  }
}

function MessageRenderError() {
  const t = useT()
  return (
    <article className="message render-error">
      {t('message.renderFailed')}
    </article>
  )
}

function MessageMarkdownContent({
  text,
  linkUserFilePaths = false,
}: {
  text: string
  linkUserFilePaths?: boolean
}) {
  return (
    <MarkdownContent
      text={text}
      linkUserFilePaths={linkUserFilePaths}
      renderReference={(href, children) => (
        <RefChip uri={href}>{children}</RefChip>
      )}
      renderLink={({ node: _node, children, ...props }) => (
        <FileAwareLink {...props}>{children}</FileAwareLink>
      )}
    />
  )
}

const threadPartCapabilities = {
  renderMarkdown: (text: string, linkUserFilePaths?: boolean) => (
    <MessageMarkdownContent text={text} linkUserFilePaths={linkUserFilePaths} />
  ),
  renderImage: (source: string, name: string) => (
    <RelayImage source={source} name={name} />
  ),
  renderNestedRuns: (rows: readonly NestedMessageRow[], live: boolean) => (
    <NestedRuns rows={rows as readonly MessageRow[]} live={live} />
  ),
  nestedActivity: (rows: readonly NestedMessageRow[]) =>
    latestSubagentActivity(rows as readonly MessageRow[]),
}

/** A Task's sub-agent transcript, drawn with the normal part renderers. */
function NestedRuns({
  rows,
  live,
}: {
  rows: readonly MessageRow[]
  live: boolean
}) {
  return (
    <div className="tool-children">
      {rows.map((row) => (
        <MessageBoundary key={row.id}>
          {row.message.parts.map((part, index) => (
            <PartView
              key={`${part.type}-${index}`}
              part={part}
              live={reasoningLive(row.message.parts, index, live)}
              capabilities={threadPartCapabilities}
            />
          ))}
        </MessageBoundary>
      ))}
    </div>
  )
}

function ThreadMessageView({
  row,
  nestedByParent,
  onActions,
  onSwitchVersion,
  onRetryFailed,
  generating = false,
  usage,
  workspacePath,
}: {
  row: MessageRow
  generating?: boolean
  usage?: GenerationUsage
  workspacePath?: string
  nestedByParent?: ReadonlyMap<string, MessageRow[]>
  onActions?: (row: MessageRow) => void
  onSwitchVersion?: (row: MessageRow, direction: 'prev' | 'next') => void
  onRetryFailed?: (row: MessageRow) => void
}) {
  const press = useLongPress(() => onActions?.(row))
  const { openFile } = useFileLinks()
  return (
    <MessageView
      row={row}
      workspacePath={workspacePath}
      generating={generating}
      usage={usage}
      nestedByParent={nestedByParent}
      onActions={onActions ? () => onActions(row) : undefined}
      onSwitchVersion={
        onSwitchVersion
          ? (_message, direction) => onSwitchVersion(row, direction)
          : undefined
      }
      onRetryFailed={onRetryFailed ? () => onRetryFailed(row) : undefined}
      capabilities={threadPartCapabilities}
      longPressProps={press}
      renderUsage={(value) => <UsageFooter usage={value as GenerationUsage} />}
      onOpenFile={openFile}
      onOpenWebsite={(target) => void openExternalUrl(target)}
    />
  )
}

function GeneratingElapsed({ startedAt }: { startedAt: number }) {
  const now = useSharedSecond()
  return <time>{formatElapsed(elapsedDuration(now, startedAt))}</time>
}

function PendingAssistantView({ pending }: { pending: PendingAssistant }) {
  const now = useSharedSecond()
  return (
    <article className="message assistant pending-assistant" aria-live="polite">
      <div className="reasoning live pending-reasoning">
        <div className="pending-reasoning-summary">
          <LoadingOrb />
          <span>{pendingStatusText(pending, now)}</span>
          <ChevronRight size={14} />
        </div>
      </div>
    </article>
  )
}

// Short threads fit on screen; the rail only helps once there is history.
const TIMELINE_MIN_ENTRIES = 4

// A stale snapshot can only be corrected by refetching; cap that so a long
// generation does not turn every delta into a full thread download.
const RESYNC_INTERVAL_MS = 3000

// Composer glyphs share one size/stroke so the Plus, option chips, Stop and
// Send read as one control row.
const COMPOSER_ICON = { size: 16, strokeWidth: 2 } as const

type OptionsSheet = 'model' | 'effort' | null
type ProjectMove =
  | { workspaceId: string; status: 'moving' | 'moved' }
  | { workspaceId: string; status: 'error'; message: string }

export function ThreadScreen() {
  const { threadId = '' } = useParams()
  // Remount per thread so composer drafts, edit mode and message caches can
  // never carry over from one thread to another.
  return <ThreadView key={threadId} threadId={threadId} />
}

function ThreadView({ threadId }: { threadId: string }) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const searchTarget = location.state as {
    fromSearch?: boolean
    searchRowId?: string
    pendingFirstSend?: {
      id: string
      content: string
      attachments: ComposerAttachment[]
      createdAt: number
    }
    pendingGoal?: ThreadGoal
    pendingLoop?: import('./threadLoop').ThreadLoop
  } | null
  const [flashRow, setFlashRow] = useState<string>()
  const layoutMode = useLayoutMode()
  const { api, pairing, status } = useConnection()
  // Back returns to the list this conversation was opened from.
  const listPath = threadListPath(
    pairing.id,
    threadRouteMatch(location.pathname)?.section ?? 'threads',
  )
  const link = useRealtimeLink(api, status)
  const {
    approvals,
    questions,
    threads: loadedThreads,
    respondApproval,
    respondQuestion,
  } = useHandoff()
  const { markRead, setOpenThread } = useUnreadActivity()
  useEffect(() => {
    setOpenThread(pairing.id, threadId)
    const read = () => {
      if (document.visibilityState === 'visible') markRead(pairing.id, threadId)
    }
    read()
    document.addEventListener('visibilitychange', read)
    return () => {
      setOpenThread(pairing.id, undefined)
      document.removeEventListener('visibilitychange', read)
    }
  }, [pairing.id, threadId, markRead, setOpenThread])
  const initialCachedThread = useMemo(
    () => threadCache.getThread(pairing.id, threadId),
    [pairing.id, threadId],
  )
  const [selectableRow, setSelectableRow] = useState<MessageRow>()
  // Quote/Mention close the reader first; the caret lands once it is gone.
  const pendingCaretRef = useRef<number>()
  const [messages, setMessages] = useState<MessageRow[]>(
    () => initialCachedThread?.rows ?? [],
  )
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistant>()
  const pendingAssistantRef = useRef<PendingAssistant>()
  const [title, setTitle] = useState(
    initialCachedThread?.title ?? t('thread.fallbackTitle'),
  )
  const [renameTitle, setRenameTitle] = useState<string>()
  const [renaming, setRenaming] = useState(false)
  const [, setIsGeneratingTitle] = useState(false)
  const [models, setModels] = useState<AlmaModel[]>([])
  const [settings, setSettings] = useState<AlmaSettings>({})
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState(
    initialCachedThread?.workspaceId ?? '',
  )
  const [threadInfoOpen, setThreadInfoOpen] = useState(false)
  const [threadFilesOpen, setThreadFilesOpen] = useState(false)
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>()
  const [threadFileWrites, setThreadFileWrites] = useState<FileWriteEntry[]>()
  const [changedFilesError, setChangedFilesError] = useState(false)
  const [projectMove, setProjectMove] = useState<ProjectMove>()
  const [editorOpen, setEditorOpen] = useState(false)
  const editorOverlay = useAnimatedOverlay(editorOpen, () =>
    setEditorOpen(false),
  )
  const composerShellRef = useRef<HTMLElement>(null)
  const [editorOrigin, setEditorOrigin] = useState<DOMRect>()
  const [scrolledUp, setScrolledUp] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [htmlChooserOpen, setHtmlChooserOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [crewOpen, setCrewOpen] = useState(false)
  const [crew, setCrew] = useState<AgentCrew>({ missions: [] })
  const [diffStats, setDiffStats] = useState<{
    additions?: number
    deletions?: number
    filesChanged?: number
  }>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [model, setModel] = useState(initialCachedThread?.model ?? '')
  const [reasoningEffort, setReasoningEffort] = useState<
    'off' | ReasoningEffort
  >(initialCachedThread?.reasoningEffort ?? 'medium')
  const [fastMode, setFastMode] = useState<boolean | null>(
    initialCachedThread?.fastMode ?? null,
  )
  const [optionsSheet, setOptionsSheet] = useState<OptionsSheet>(null)
  const selectedModelRef = useRef<HTMLButtonElement>(null)
  const draft = useThreadDraft(pairing.id, threadId)
  const composerReferences = useComposerReferences({
    api,
    initialContent: draft.savedText(),
    textareaRef,
    scopeKey: editorOpen,
    threadId,
    workspaceId,
    threads: loadedThreads[pairing.id],
  })
  const {
    text,
    setText,
    references,
    setReferences,
    trigger: refTrigger,
    kinds: refKinds,
    chipKind: refChipKind,
    setChipKind: setRefChipKind,
    results: refResults,
    composingRef,
    stateRef: composerStateRef,
    placeCaret,
  } = composerReferences
  const [openedRef, setOpenedRef] = useState<OpenedRef>()
  const highlightRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!editorOpen) return
    const area = textareaRef.current
    area?.focus()
    area?.setSelectionRange(area.value.length, area.value.length)
  }, [editorOpen])
  const editorWasRendered = useRef(false)
  useEffect(() => {
    const wasRendered = editorWasRendered.current
    editorWasRendered.current = editorOverlay.rendered
    // Only after a collapse finishes — never on mount (would pop the keyboard).
    if (editorOpen || editorOverlay.rendered || !wasRendered) return
    const area = textareaRef.current
    area?.focus()
    area?.setSelectionRange(area.value.length, area.value.length)
  }, [editorOpen, editorOverlay.rendered])
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(
    draft.attachments,
  )
  useEffect(() => {
    if (draft.attachments.length) setAttachments(draft.attachments)
  }, [draft.attachments])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
    },
    [],
  )
  const extensionQueue = useThreadQueue(pairing.id, threadId, {
    model,
    reasoningEffort,
    fastMode: fastMode ?? undefined,
  })
  const queuedMessages = extensionQueue.queue.messages
  const queuedRef = useRef(queuedMessages)
  queuedRef.current = queuedMessages
  const autoSendWhenIdle = useRef(extensionQueue.queue.autoSendWhenIdle)
  autoSendWhenIdle.current = extensionQueue.queue.autoSendWhenIdle
  const [editingQueuedItem, setEditingQueuedItem] = useState(false)
  const editingQueuedRef = useRef(editingQueuedItem)
  editingQueuedRef.current = editingQueuedItem
  const [uploading, setUploading] = useState(false)
  const [actionRow, setActionRow] = useState<MessageRow>()
  const [editingMessageId, setEditingMessageId] = useState<string>()
  // While editing an earlier message the composer holds that message, not
  // the draft, so autosave pauses until the edit is sent or cancelled.
  useEffect(() => {
    if (!editingMessageId)
      draft.update(composerReferences.content(), attachments)
  }, [draft, text, references, attachments, editingMessageId])
  const [generating, setGenerating] = useState(false)
  const [idleConfirmed, setIdleConfirmed] = useState(false)
  const [socketIsReady, setSocketIsReady] = useState(false)
  const [generationStart, setGenerationStart] = useState<number>()
  const [contextUsage, setContextUsage] = useState<ContextUsage>()
  const [contextOpen, setContextOpen] = useState(false)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [todoSheetOpen, setTodoSheetOpen] = useState(false)
  const [sessionUsage, setSessionUsage] =
    useState<SessionUsage>(emptySessionUsage)
  // Completions can be replayed after a reconnect; count each reply once.
  const countedReplies = useRef(new Set<string>())
  const [lastReply, setLastReply] = useState<{
    assistantMessageId?: string
    usage: GenerationUsage
  }>()
  const [recipeState, setRecipeState] = useState(initialRecipeSuggestionState)
  const recipe = recipeState.recipe
  const recipeTurn = useRef(0)
  const [recipeSaving, setRecipeSaving] = useState(false)
  const [extractedRecipeCount, setExtractedRecipeCount] = useState(0)
  const [error, setError] = useState('')
  const foregroundedAt = useRef<number>()
  const foregroundReloadPending = useRef(false)
  const foregroundRetryTimer = useRef<number>()
  const [missingThread, setMissingThread] = useState<RelayErrorPresentation>()
  const parentRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<ThreadsSocket>()
  const resyncTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastResyncAt = useRef(0)
  const queueSending = useRef(false)
  const socketReady = useRef(false)
  const interruptForQueue = useRef(false)
  const firstSendStarted = useRef(false)
  const [firstSendDirectFailed, setFirstSendDirectFailed] = useState(false)
  const firstSendOptimisticApplied = useRef(false)
  // Rows live in a ref so delta bookkeeping never runs inside a React state
  // updater (which may be invoked twice); the UI is committed once per frame.
  const rowsRef = useRef<MessageRow[]>(initialCachedThread?.rows ?? [])
  const threadMetaRef = useRef<CachedThread>({
    rows: initialCachedThread?.rows ?? [],
    title: initialCachedThread?.title ?? t('thread.fallbackTitle'),
    workspaceId: initialCachedThread?.workspaceId ?? '',
    model: initialCachedThread?.model ?? '',
    reasoningEffort: initialCachedThread?.reasoningEffort ?? 'medium',
    fastMode: initialCachedThread?.fastMode ?? null,
    isGeneratingTitle: initialCachedThread?.isGeneratingTitle ?? false,
  })
  const writeThreadCache = useCallback(
    (rows = rowsRef.current) => {
      threadCache.setThread(pairing.id, threadId, {
        ...threadMetaRef.current,
        rows,
      })
    },
    [pairing.id, threadId],
  )
  const frameRef = useRef<number>()
  const accumulatorRef = useRef(new DeltaAccumulator())
  // Live sub-agent runs are committed on their own frame so a busy Task
  // never re-derives the top-level rows.
  const subagentRunsRef = useRef(new SubagentRuns())
  const [liveSubagents, setLiveSubagents] = useState<readonly MessageRow[]>([])
  const subagentFrameRef = useRef<number>()
  const subagentSnapshotInFlight = useRef(false)

  const commitRows = useCallback(
    (next: MessageRow[], cacheRows = true) => {
      rowsRef.current = next
      if (cacheRows) writeThreadCache(next)
      if (frameRef.current !== undefined) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined
        setMessages(rowsRef.current)
      })
    },
    [writeThreadCache],
  )

  const commitSubagents = useCallback(() => {
    if (subagentFrameRef.current !== undefined) return
    subagentFrameRef.current = requestAnimationFrame(() => {
      subagentFrameRef.current = undefined
      setLiveSubagents(subagentRunsRef.current.rows)
    })
  }, [])

  const loadLiveSubagents = useCallback(async () => {
    if (subagentSnapshotInFlight.current) return
    subagentSnapshotInFlight.current = true
    try {
      const snapshots = await api.getLiveSubagents(threadId)
      if (subagentRunsRef.current.applySnapshots(snapshots)) commitSubagents()
    } catch (snapshotError) {
      // Auxiliary: the persisted rows still arrive with the next thread load.
      console.warn('Live sub-agents unavailable', snapshotError)
    } finally {
      subagentSnapshotInFlight.current = false
    }
  }, [api, threadId, commitSubagents])

  const applyOptimistic = useCallback(
    (action: Parameters<typeof optimisticThreadReducer>[1]) => {
      const next = optimisticThreadReducer(
        { rows: rowsRef.current, pending: pendingAssistantRef.current },
        action,
      )
      pendingAssistantRef.current = next.pending
      commitRows(next.rows, false)
      setPendingAssistant(next.pending)
    },
    [commitRows],
  )

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const parent = parentRef.current
      if (parent) parent.scrollTop = parent.scrollHeight
    })
  }, [])
  const jumpToLatest = useCallback(() => {
    void haptic('light')
    setScrolledUp(false)
    scrollToBottom()
  }, [scrollToBottom])

  const updateQueue = (
    next: QueuedMessage[],
    nextAutoSend = autoSendWhenIdle.current,
  ) =>
    extensionQueue.controller.update(
      { messages: next, autoSendWhenIdle: next.length > 0 && nextAutoSend },
      {
        model: model || settings.chat?.defaultModel,
        reasoningEffort,
        fastMode: fastMode ?? undefined,
      },
    )

  const load = useCallback(async () => {
    try {
      // GET /api/threads/:id already embeds the full message rows, so one
      // round trip through the relay is enough for large threads.
      const thread = await api.getThread(threadId)
      const rows = Array.isArray(thread.messages)
        ? thread.messages
        : await api.getMessages(threadId)
      const nextMeta: CachedThread = {
        rows: [],
        title: thread.title || t('thread.untitled'),
        workspaceId: thread.workspaceId || '',
        model: thread.model || '',
        reasoningEffort: thread.reasoningEffort || 'medium',
        fastMode: thread.fastMode ?? null,
        isGeneratingTitle: Boolean(thread.isGeneratingTitle),
      }
      threadMetaRef.current = nextMeta
      setTitle(nextMeta.title)
      setIsGeneratingTitle(nextMeta.isGeneratingTitle)
      setWorkspaceId(nextMeta.workspaceId)
      setModel(nextMeta.model)
      setReasoningEffort(nextMeta.reasoningEffort)
      setFastMode(nextMeta.fastMode)
      const fetchedRows = accumulatorRef.current.sync(rowsRef.current, rows)
      const synced = optimisticThreadReducer(
        { rows: rowsRef.current, pending: pendingAssistantRef.current },
        { type: 'sync_rows', rows: fetchedRows },
      )
      pendingAssistantRef.current = synced.pending
      commitRows(synced.rows)
      setPendingAssistant(synced.pending)
      setTodos(todosFromRows(synced.rows))
      setGenerating(Boolean(thread.isGenerating))
      if (!thread.isGenerating) setIdleConfirmed(true)
      if (thread.isGenerating) {
        const next = optimisticThreadReducer(synced, {
          type: 'generating_open',
          threadId,
          startedAt: generationStartedAt(synced.rows, Date.now()),
        })
        pendingAssistantRef.current = next.pending
        setPendingAssistant(next.pending)
      }
      setError('')
      foregroundedAt.current = undefined
      foregroundReloadPending.current = false
      window.clearTimeout(foregroundRetryTimer.current)
    } catch (loadError) {
      const presented = mapRelayError(loadError, 'thread')
      if (presented.kind === 'thread-missing') {
        threadCache.evictThread(pairing.id, threadId)
        setMissingThread(presented)
        setError('')
      } else if (
        foregroundLoadOutcome(
          presented.kind,
          Date.now(),
          foregroundedAt.current,
        ) === 'show'
      )
        setError(presented.title)
    }
  }, [api, pairing.id, threadId, commitRows])

  const loadOpenRecipe = useCallback(async () => {
    const turn = recipeTurn.current
    try {
      const recipes = await api.listRecipes(threadId)
      const recipe = recipes.open[0]
      setExtractedRecipeCount(
        recipes.all.filter((item) => item.recipeState === 'extracted').length,
      )
      if (recipe && recipeTurn.current === turn)
        setRecipeState((current) =>
          reduceRecipeSuggestion(current, { type: 'loaded', turn, recipe }),
        )
    } catch (recipeError) {
      if (!isUnsupportedEndpoint(recipeError))
        console.warn('Recipe suggestions unavailable', recipeError)
    }
  }, [api, threadId])

  const loadCrew = useCallback(async () => {
    try {
      setCrew(await api.getAgentCrew(threadId))
    } catch (crewError) {
      if (isUnsupportedEndpoint(crewError)) setCrew({ missions: [] })
      else console.warn('Agent crew unavailable', crewError)
    }
  }, [api, threadId])

  const loadDiffStats = useCallback(async () => {
    try {
      setDiffStats(await api.getDiffStats(threadId))
    } catch (statsError) {
      if (isUnsupportedEndpoint(statsError)) setDiffStats(undefined)
      else console.warn('Diff stats unavailable', statsError)
    }
  }, [api, threadId])

  const scheduleResync = useCallback(() => {
    if (resyncTimer.current) return
    const wait = Math.max(
      0,
      lastResyncAt.current + RESYNC_INTERVAL_MS - Date.now(),
    )
    resyncTimer.current = setTimeout(() => {
      resyncTimer.current = undefined
      lastResyncAt.current = Date.now()
      void load()
    }, wait)
  }, [load])

  const contextModel = model || settings.chat?.defaultModel
  const loadContextUsage = useCallback(async () => {
    // Desktop needs the model to size the window; wait until one is known.
    if (!contextModel) return
    try {
      setContextUsage(await api.getContextUsage(threadId, contextModel))
    } catch (usageError) {
      // Older desktops lack the endpoint: hide the ring. Other failures keep
      // the last reading; the ring is auxiliary and must not block the thread.
      if (isUnsupportedEndpoint(usageError)) setContextUsage(undefined)
      else console.warn('Context usage unavailable', usageError)
    }
  }, [api, threadId, contextModel])
  // The socket effect reads this through a ref so a model change refreshes
  // usage without reopening the realtime socket.
  const loadContextUsageRef = useRef(loadContextUsage)
  loadContextUsageRef.current = loadContextUsage
  useEffect(() => {
    void loadContextUsage()
  }, [loadContextUsage])

  useEffect(() => {
    if (!generating) {
      setGenerationStart(undefined)
      return
    }
    // Locally started runs already set their start; others are inferred.
    setGenerationStart(
      (current) => current ?? generationStartedAt(rowsRef.current, Date.now()),
    )
  }, [generating])

  useEffect(() => {
    void Promise.all([
      api.listModels(),
      api.getSettings(),
      api.listWorkspaces(),
    ])
      .then(([availableModels, currentSettings, availableWorkspaces]) => {
        setModels(availableModels)
        setSettings(currentSettings)
        setWorkspaces(availableWorkspaces)
      })
      .catch((optionsError) => {
        setError(
          optionsError instanceof Error
            ? optionsError.message
            : t('thread.errors.composerOptions'),
        )
      })
  }, [api])

  useEffect(() => {
    const cached = threadCache.getThread(pairing.id, threadId)
    accumulatorRef.current = new DeltaAccumulator()
    subagentRunsRef.current = new SubagentRuns()
    setLiveSubagents([])
    rowsRef.current = cached?.rows ?? []
    threadMetaRef.current = cached ?? {
      rows: [],
      title: t('thread.fallbackTitle'),
      workspaceId: '',
      model: '',
      reasoningEffort: 'medium',
      fastMode: null,
      isGeneratingTitle: false,
    }
    pendingAssistantRef.current = undefined
    setMessages(rowsRef.current)
    setTitle(threadMetaRef.current.title)
    setWorkspaceId(threadMetaRef.current.workspaceId)
    setModel(threadMetaRef.current.model)
    setReasoningEffort(threadMetaRef.current.reasoningEffort)
    setFastMode(threadMetaRef.current.fastMode)
    setPendingAssistant(undefined)
    recipeTurn.current = 0
    setRecipeState(initialRecipeSuggestionState)
    setExtractedRecipeCount(0)
    void load()
    void loadLiveSubagents()
    void loadCrew()
    void loadDiffStats()
    void loadOpenRecipe()
    return () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = undefined
      }
      if (subagentFrameRef.current !== undefined) {
        cancelAnimationFrame(subagentFrameRef.current)
        subagentFrameRef.current = undefined
      }
    }
  }, [
    pairing.id,
    threadId,
    load,
    loadLiveSubagents,
    loadCrew,
    loadDiffStats,
    loadOpenRecipe,
  ])

  useEffect(() => {
    if (!link.online) return
    // Deltas were missed while the tunnel was down; resync once on return.
    if (link.epoch > 1) {
      void load()
      void loadLiveSubagents()
    }
    const socket = api.threadsSocket((event) => {
      const data = event.data
      if (event.type === 'generating_snapshot') {
        const active = (data?.ids ?? []).includes(threadId)
        setGenerating(active)
        if (!active) setIdleConfirmed(true)
        if (active) {
          applyOptimistic({
            type: 'generating_open',
            threadId,
            startedAt: generationStartedAt(rowsRef.current, Date.now()),
          })
        }
      }
      if (
        ['title_generating', 'title_generated'].includes(event.type) &&
        data?.id === threadId
      ) {
        setIsGeneratingTitle(Boolean(data.isGeneratingTitle))
        if (
          event.type === 'title_generated' &&
          typeof data.title === 'string'
        ) {
          setTitle(data.title)
        }
      }
      if (shouldReloadThread(threadId, event)) {
        void load()
        return
      }
      if (subagentEventContext(threadId, event)) {
        const result = subagentRunsRef.current.apply(event)
        if (result.changed) commitSubagents()
        if (result.needsSnapshot) void loadLiveSubagents()
        return
      }
      if (data?.threadId !== threadId) return

      const liveTodos = todosFromEvent(threadId, event)
      if (liveTodos) setTodos(liveTodos)

      const readyRecipe = recipeFromReadyEvent(threadId, event)
      if (readyRecipe)
        setRecipeState((current) =>
          reduceRecipeSuggestion(current, {
            type: 'ready',
            turn: recipeTurn.current,
            recipe: readyRecipe,
          }),
        )
      if (event.type === 'thread_generating') {
        const active = Boolean(data.isGenerating)
        setGenerating(active)
        if (!active) {
          setIdleConfirmed(true)
          applyOptimistic({ type: 'generation_finished' })
        }
      }
      const phase = phaseFromProgressEvent(event.type, data)
      if (phase) applyOptimistic({ type: 'phase', phase })
      if (event.type === 'context_usage_update') {
        setContextUsage((current) =>
          applyContextUsageEvent(current, threadId, event),
        )
      }
      if (event.type === 'context_compacted') {
        void loadContextUsageRef.current()
      }
      const completion = usageFromCompletion(threadId, event)
      if (
        completion &&
        !(
          completion.assistantMessageId &&
          countedReplies.current.has(completion.assistantMessageId)
        )
      ) {
        if (completion.assistantMessageId)
          countedReplies.current.add(completion.assistantMessageId)
        setSessionUsage((total) =>
          accumulateSessionUsage(total, completion.usage),
        )
        setLastReply(completion)
      }
      if (
        [
          'generation_completed',
          'generation_error',
          'generation_stopped',
        ].includes(event.type)
      ) {
        if (event.type === 'generation_completed') recipeTurn.current += 1
        setGenerating(false)
        setIdleConfirmed(true)
        if (event.type === 'generation_error') {
          applyOptimistic({
            type: 'generation_error',
            error:
              typeof data.error === 'string'
                ? data.error
                : t('thread.errors.responseFailed'),
          })
        } else {
          applyOptimistic({ type: 'generation_finished' })
        }
        void load()
        void loadContextUsageRef.current()
        void loadCrew()
      }
      if (event.type === 'message_added') {
        applyOptimistic({ type: 'message_added', row: data })
      }
      if (event.type === 'message_updated') {
        commitRows(accumulatorRef.current.sync(rowsRef.current, [data], false))
      }
      if (event.type === 'message_delta') {
        // The sub-agent's DB row streams on its own channel; it must neither
        // end the pending reply nor read as a stale base (full resync).
        if (
          isSubagentMessageId(
            threadId,
            data.messageId,
            subagentRunsRef.current.ids,
          )
        )
          return
        applyOptimistic({ type: 'assistant_started' })
        const result = accumulatorRef.current.apply(rowsRef.current, data)
        if (result.rows !== rowsRef.current) commitRows(result.rows)
        if (result.needsResync) scheduleResync()
      }
    })

    socketRef.current = socket
    socket.opened
      .then(() => {
        if (socketRef.current !== socket) return
        socketReady.current = true
        setSocketIsReady(true)
      })
      .catch(() => undefined)
    return () => {
      clearTimeout(resyncTimer.current)
      resyncTimer.current = undefined
      socket.close()
      if (socketRef.current === socket) {
        socketRef.current = undefined
        socketReady.current = false
        setSocketIsReady(false)
      }
    }
  }, [
    api,
    threadId,
    link,
    load,
    loadLiveSubagents,
    commitRows,
    commitSubagents,
    applyOptimistic,
    scheduleResync,
  ])

  const inlineHandoff = useMemo(
    () =>
      pendingForThread(
        threadId,
        approvals.filter((request) => request.desktopId === pairing.id),
        questions.filter((request) => request.desktopId === pairing.id),
      ),
    [threadId, approvals, questions, pairing.id],
  )
  const selectedModel = useMemo(
    () => models.find((candidate) => candidate.id === model),
    [models, model],
  )
  const modelGroups = useMemo(
    () => groupModelsByProvider(models, settings.chat?.modelUsageHistory ?? {}),
    [models, settings],
  )
  const effortOptions = useMemo(
    () => reasoningEffortsForModel(selectedModel),
    [selectedModel],
  )
  const effectiveFastMode =
    fastMode ?? selectedModel?.capabilities.defaultServiceTier === 'priority'
  const roots = useMemo(() => rootRows(messages), [messages])
  const workspacePath = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId)?.path,
    [workspaces, workspaceId],
  )
  const galleryImages = useMemo(() => extractThreadImages(messages), [messages])
  const deliveredFiles = useMemo(
    () => collectDeliveredResources(messages, workspacePath),
    [messages, workspacePath],
  )
  const userAttachments = useMemo(
    () => extractUserAttachments(messages),
    [messages],
  )
  const knownFileCount = useMemo(() => {
    const paths = new Set(
      deliveredFiles
        .filter((resource) => resource.type === 'file')
        .map((resource) => resource.path),
    )
    for (const file of changedFiles ?? []) paths.add(file.filePath)
    return paths.size
  }, [changedFiles, deliveredFiles])
  const openThreadFiles = useCallback(() => {
    setThreadInfoOpen(false)
    setThreadFilesOpen(true)
    if (threadFileWrites) return
    setChangedFilesError(false)
    void api
      .getThreadFileWrites(threadId)
      .then(({ fileWrites }) => {
        setThreadFileWrites(fileWrites)
        setChangedFiles(
          aggregateFileWrites(fileWrites, threadId, workspacePath),
        )
      })
      .catch((error) => {
        if (isUnsupportedEndpoint(error)) {
          const fileWrites = collectFallbackFileWrites(messages, workspacePath)
          setThreadFileWrites(fileWrites)
          setChangedFiles(
            aggregateFileWrites(fileWrites, threadId, workspacePath),
          )
          return
        }
        console.warn('Thread file writes unavailable', error)
        setChangedFilesError(true)
      })
  }, [api, messages, threadFileWrites, threadId, workspacePath])
  const closeThreadFiles = useCallback(() => {
    setThreadFilesOpen(false)
    setThreadFileWrites(undefined)
    setChangedFiles(undefined)
    setChangedFilesError(false)
  }, [])
  const previousNested = useRef<ReadonlyMap<string, MessageRow[]>>()
  const nestedByParent = useMemo(() => {
    const nested = nestedRowsByParent(
      messages,
      liveSubagents,
      previousNested.current,
    )
    previousNested.current = nested
    return nested
  }, [messages, liveSubagents])
  const timeline = useMemo(() => timelineEntries(roots), [roots])
  // The completion names its reply; ids may be the row id or the nested
  // message id, so match either, else fall back to the last assistant row.
  const usageRowId = useMemo(() => {
    if (!lastReply) return undefined
    const id = lastReply.assistantMessageId
    const match =
      id &&
      roots.find(
        (row) =>
          row.id === id || row.message.id === id || row.id.endsWith(`--${id}`),
      )
    return (
      match ||
      [...roots].reverse().find((row) => row.message.role === 'assistant')
    )?.id
  }, [lastReply, roots])
  const virtualizer = useVirtualizer({
    count: roots.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 5,
  })

  useEffect(() => {
    if (roots.length) {
      const index = searchTarget?.fromSearch
        ? Math.max(
            0,
            roots.findIndex(
              (row) =>
                row.id === searchTarget.searchRowId ||
                row.message.id === searchTarget.searchRowId ||
                row.message.parts.some(
                  (part) =>
                    part.toolCallId &&
                    nestedByParent
                      .get(part.toolCallId)
                      ?.some(
                        (child) =>
                          child.id === searchTarget.searchRowId ||
                          child.message.id === searchTarget.searchRowId,
                      ),
                ),
            ),
          )
        : roots.length - 1
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(index, {
          align: searchTarget?.fromSearch ? 'start' : 'end',
        }),
      )
      if (searchTarget?.fromSearch) {
        setFlashRow(roots[index]?.id)
        const timer = window.setTimeout(() => setFlashRow(undefined), 1800)
        return () => clearTimeout(timer)
      }
    }
  }, [roots.length, virtualizer, location.key])

  useEffect(() => {
    if (pendingAssistant) scrollToBottom()
  }, [pendingAssistant, scrollToBottom])

  useEffect(() => {
    if (generating) {
      queueSending.current = false
      return
    }
    if (
      extensionQueue.mode === 'local' &&
      !extensionQueue.busy &&
      idleQueueShouldAutoSend({
        generating: generating || !idleConfirmed,
        autoSendWhenIdle: autoSendWhenIdle.current,
        queueLength: queuedRef.current.length,
        online: link.online,
        socketReady: socketIsReady,
        alreadySending: queueSending.current,
        editingQueuedItem,
      })
    ) {
      if (interruptForQueue.current) interruptForQueue.current = false
      sendQueuedMessages()
    }
  }, [
    generating,
    idleConfirmed,
    link.online,
    socketIsReady,
    editingQueuedItem,
    extensionQueue.mode,
    extensionQueue.busy,
  ])

  useEffect(() => {
    const observeForeground = () => {
      if (document.visibilityState !== 'visible') return
      foregroundedAt.current = Date.now()
      foregroundReloadPending.current = true
      window.clearTimeout(foregroundRetryTimer.current)
      foregroundRetryTimer.current = window.setTimeout(() => {
        if (!foregroundReloadPending.current) return
        foregroundReloadPending.current = false
        void load()
      }, FOREGROUND_RECONNECT_GRACE_MS)
      setIdleConfirmed(true)
    }
    document.addEventListener('visibilitychange', observeForeground)
    window.addEventListener('pageshow', observeForeground)
    return () => {
      window.clearTimeout(foregroundRetryTimer.current)
      document.removeEventListener('visibilitychange', observeForeground)
      window.removeEventListener('pageshow', observeForeground)
    }
  }, [load])

  useEffect(() => {
    if (
      !foregroundReloadPending.current ||
      !shouldReloadAfterForeground(link.online, socketIsReady)
    )
      return
    foregroundReloadPending.current = false
    window.clearTimeout(foregroundRetryTimer.current)
    void load()
  }, [link.online, socketIsReady, load])

  useEffect(() => {
    if (optionsSheet === 'model') {
      selectedModelRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [optionsSheet])

  async function saveOptions(updates: {
    model?: string
    reasoningEffort?: 'off' | ReasoningEffort
    fastMode?: boolean | null
  }) {
    const updated = await api.updateThread(threadId, updates)
    if (updated.model !== undefined) setModel(updated.model || '')
    if (updated.reasoningEffort !== undefined) {
      setReasoningEffort(updated.reasoningEffort || 'medium')
    }
    if (updated.fastMode !== undefined) setFastMode(updated.fastMode)
  }

  async function selectModel(nextModel: string) {
    const nextMeta = models.find((candidate) => candidate.id === nextModel)
    const nextEffort = normalizeEffortForModel(nextMeta, reasoningEffort)
    const updates = {
      model: nextModel,
      reasoningEffort: nextEffort,
      ...(supportsFastMode(nextMeta) ? {} : { fastMode: null }),
    }
    setModel(nextModel)
    setReasoningEffort(nextEffort)
    if (!supportsFastMode(nextMeta)) setFastMode(null)
    setOptionsSheet(null)
    try {
      await saveOptions(updates)
    } catch (optionsError) {
      setError(
        optionsError instanceof Error
          ? optionsError.message
          : t('thread.errors.saveModel'),
      )
      void load()
    }
  }

  async function selectEffort(nextEffort: 'off' | ReasoningEffort) {
    setReasoningEffort(nextEffort)
    setOptionsSheet(null)
    try {
      await saveOptions({ reasoningEffort: nextEffort })
    } catch (optionsError) {
      setError(
        optionsError instanceof Error
          ? optionsError.message
          : t('thread.errors.saveEffort'),
      )
      void load()
    }
  }

  async function toggleFastMode() {
    const next = !effectiveFastMode
    setFastMode(next)
    try {
      await saveOptions({ fastMode: next })
    } catch (optionsError) {
      setError(
        optionsError instanceof Error
          ? optionsError.message
          : t('thread.errors.saveFastMode'),
      )
      void load()
    }
  }

  async function moveToWorkspace(nextWorkspaceId: string) {
    if (
      !nextWorkspaceId ||
      nextWorkspaceId === workspaceId ||
      projectMove?.status === 'moving'
    ) {
      return
    }
    setProjectMove({ workspaceId: nextWorkspaceId, status: 'moving' })
    try {
      const updated = await api.updateThread(threadId, {
        workspaceId: nextWorkspaceId,
      })
      setWorkspaceId(updated.workspaceId || nextWorkspaceId)
      setProjectMove({ workspaceId: nextWorkspaceId, status: 'moved' })
    } catch (moveError) {
      setProjectMove({
        workspaceId: nextWorkspaceId,
        status: 'error',
        message:
          moveError instanceof Error
            ? moveError.message
            : t('thread.errors.move'),
      })
    }
  }

  function closeThreadInfo() {
    setThreadInfoOpen(false)
    // A finished move is acknowledged by closing; an in-flight one keeps
    // its state so the row still shows progress if the sheet is reopened.
    if (projectMove?.status !== 'moving') setProjectMove(undefined)
  }

  async function rename() {
    const nextTitle = renameTitle?.trim()
    if (!nextTitle) return
    if (nextTitle === title) {
      setRenameTitle(undefined)
      return
    }
    setRenaming(true)
    try {
      const updated = await api.renameThread(threadId, nextTitle)
      setTitle(updated.title || nextTitle)
      setRenameTitle(undefined)
      setIsGeneratingTitle(false)
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : t('thread.errors.rename'),
      )
    } finally {
      setRenaming(false)
    }
  }

  const generationOptions = {
    model: model || settings.chat?.defaultModel,
    reasoningEffort,
    fastMode,
  }

  /** A run this client starts begins now, before its user row arrives. */
  function startGenerating() {
    setGenerationStart((current) => current ?? Date.now())
    setIdleConfirmed(false)
    setGenerating(true)
  }

  const composerGoal = useComposerGoal({
    api,
    desktopId: pairing.id,
    threadId,
    model,
    status,
    onStarted: startGenerating,
  })
  const jumpPresence = usePresence(scrolledUp)
  const errorPresence = usePresence(Boolean(error))
  const recipePresence = usePresence(Boolean(recipe))
  const queuePresence = usePresence(queuedMessages.length > 0)
  const goalVisible = Boolean(
    composerGoal.goal || (composerGoal.loop && !composerGoal.loop.stoppedAt),
  )
  const goalPresence = usePresence(goalVisible)
  const presentedError = useRef(error)
  const presentedRecipe = useRef(recipe)
  const presentedGoal = useRef(composerGoal)
  const presentedQueue = useRef(queuedMessages)
  if (error) presentedError.current = error
  if (recipe) presentedRecipe.current = recipe
  if (goalVisible) presentedGoal.current = composerGoal
  if (queuedMessages.length) presentedQueue.current = queuedMessages
  useEffect(() => {
    const pending = searchTarget?.pendingFirstSend
    if (!pending || firstSendStarted.current) return
    if (!pending.content.trim() && !pending.attachments.length) {
      navigate(location.pathname, {
        replace: true,
        state: {
          pendingGoal: searchTarget?.pendingGoal,
          pendingLoop: searchTarget?.pendingLoop,
        },
      })
      return
    }
    const readiness: FirstSendReadiness = {
      desktopOnline: link.online,
      idleConfirmed,
      socketReady: socketIsReady,
      queueMode: extensionQueue.mode,
      queueBusy: extensionQueue.busy,
      directFailed: firstSendDirectFailed,
      generating,
    }
    const decision = decideFirstSend(readiness)
    if (decision === 'wait') return
    if (!claimFirstSend(pairing.id, threadId, pending.id)) return
    firstSendStarted.current = true
    void (async () => {
      setUploading(true)
      let uploaded: UploadedAttachment[]
      try {
        uploaded = await uploadPendingAttachments(api, pending.attachments)
      } catch (uploadError) {
        firstSendStarted.current = false
        releaseFirstSend(pairing.id, threadId, pending.id)
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : t('composer.attachments.uploadFailed'),
        )
        return
      } finally {
        setUploading(false)
      }
      const parts = buildMessageParts(pending.content, uploaded)
      // Queued sends appear in the queue strip, not as a sent bubble.
      if (decision === 'direct' && !firstSendOptimisticApplied.current) {
        firstSendOptimisticApplied.current = true
        applyOptimistic({
          type: 'sent',
          threadId,
          messageId: pending.id,
          parts,
          sentAt: pending.createdAt,
        })
      }
      scrollToBottom()
      const result = await deliverFirstSend(readiness, {
        sendDirect() {
          const socket = socketRef.current
          if (!socket || !socketReady.current)
            throw new Error(t('thread.errors.desktopOffline'))
          socket.generateResponse(
            threadId,
            parts,
            generationOptions,
            pending.id,
          )
        },
        writeQueue: () =>
          updateQueue(
            addQueuedMessage(
              queuedRef.current,
              pending.content,
              uploaded,
              pending.createdAt,
              pending.id,
            ),
            true,
          ),
      })
      if (result === 'wait') {
        firstSendStarted.current = false
        releaseFirstSend(pairing.id, threadId, pending.id)
        return
      }
      if (result === 'direct-failed') {
        firstSendStarted.current = false
        releaseFirstSend(pairing.id, threadId, pending.id)
        setFirstSendDirectFailed(true)
        return
      }
      if (result === 'queue-failed') {
        firstSendStarted.current = false
        releaseFirstSend(pairing.id, threadId, pending.id)
        applyOptimistic({
          type: 'generation_error',
          error: t('thread.errors.firstSend'),
        })
        setError(t('thread.errors.firstSend'))
        return
      }
      for (const attachment of pending.attachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
      if (result === 'queued') {
        applyOptimistic({
          type: 'discard_optimistic',
          messageId: pending.id,
        })
      } else {
        startGenerating()
      }
      clearStartDraftAfterDelivery(window.localStorage, pairing.id, result)
      navigate(location.pathname, {
        replace: true,
        state: {
          pendingGoal: searchTarget?.pendingGoal,
          pendingLoop: searchTarget?.pendingLoop,
        },
      })
    })()
  }, [
    extensionQueue.busy,
    extensionQueue.mode,
    firstSendDirectFailed,
    generating,
    idleConfirmed,
    link.online,
    location.pathname,
    navigate,
    pairing.id,
    searchTarget?.pendingFirstSend,
    searchTarget?.pendingGoal,
    searchTarget?.pendingLoop,
    socketIsReady,
    threadId,
  ])

  const pendingGoalApplied = useRef(false)
  useEffect(() => {
    const pendingGoal = searchTarget?.pendingGoal
    const pendingLoop = searchTarget?.pendingLoop
    if (
      pendingGoalApplied.current ||
      (!pendingGoal && !pendingLoop) ||
      queuedMessages.length ||
      generating ||
      !idleConfirmed
    )
      return
    pendingGoalApplied.current = true
    void (async () => {
      try {
        if (pendingGoal) {
          const result = await api.setGoal(threadId, pendingGoal.condition, {
            model,
          })
          if (pendingGoal.pausedAt)
            await api.setGoal(
              threadId,
              result.goal?.condition ?? pendingGoal.condition,
              { paused: true },
            )
        }
        if (pendingLoop)
          await api.setLoop(threadId, pendingLoop.prompt, { model })
        navigate(location.pathname, { replace: true })
      } catch (goalError) {
        pendingGoalApplied.current = false
        setError(
          goalError instanceof Error
            ? goalError.message
            : t('thread.errors.pendingGoal'),
        )
      }
    })()
  }, [
    api,
    generating,
    idleConfirmed,
    location.pathname,
    model,
    navigate,
    queuedMessages.length,
    searchTarget?.pendingGoal,
    searchTarget?.pendingLoop,
    threadId,
  ])

  async function compact() {
    const result = await api.compactThread(threadId, contextModel)
    void loadContextUsage()
    if (result.success) void load()
    return result
  }

  function clearAttachments() {
    for (const attachment of attachments) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    setAttachments([])
  }

  /** Composer content as stored and sent: reference tokens materialized. */
  const composerContent = composerReferences.content

  const restoreComposer = composerReferences.restore
  const detectReference = composerReferences.detect
  const changeComposerText = composerReferences.changeText
  const pickReference = composerReferences.pick

  async function uploadForSend(current: ComposerAttachment[]) {
    setUploading(true)
    setError('')
    try {
      return await uploadPendingAttachments(api, current)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : t('composer.attachments.uploadFailed'),
      )
      return undefined
    } finally {
      setUploading(false)
    }
  }

  async function queueCurrentMessage() {
    const uploaded = await uploadForSend(attachments)
    if (!uploaded) return false
    const next = addQueuedMessage(
      queuedRef.current,
      composerContent(),
      uploaded,
    )
    if (next === queuedRef.current) return false
    if (!(await updateQueue(next, generating || autoSendWhenIdle.current)))
      return false
    draft.clear()
    restoreComposer('')
    clearAttachments()
    return true
  }

  function sendQueuedMessages() {
    if (extensionQueue.mode !== 'local' || extensionQueue.busy) return false
    const socket = socketRef.current
    const queued = queuedRef.current
    if (
      !socket ||
      !socketReady.current ||
      !queued.length ||
      queueSending.current ||
      editingQueuedRef.current
    )
      return false
    const combined = combineQueuedMessages(queued)
    const parts = buildMessageParts(combined.content, combined.attachments)
    if (!parts.length) return false
    const messageId = crypto.randomUUID()
    const sentAt = Date.now()
    queueSending.current = true
    applyOptimistic({
      type: 'sent',
      threadId,
      messageId,
      parts,
      sentAt,
    })
    scrollToBottom()
    try {
      socket.generateResponse(threadId, parts, generationOptions, messageId)
      updateQueue([])
      startGenerating()
      return true
    } catch (sendError) {
      queueSending.current = false
      applyOptimistic({
        type: 'generation_error',
        error:
          sendError instanceof Error
            ? sendError.message
            : t('thread.errors.sendQueued'),
      })
      setError(
        sendError instanceof Error
          ? sendError.message
          : t('thread.errors.sendQueued'),
      )
      return false
    }
  }

  function sendQueueNow() {
    if (!queuedRef.current.length) {
      socketRef.current?.stopGeneration(threadId)
      return
    }
    if (extensionQueue.mode === 'remote') {
      void extensionQueue.controller.action()
      return
    }
    if (extensionQueue.mode !== 'local' || extensionQueue.busy) return
    const socket = socketRef.current
    if (!socket) return
    if (!generating) {
      sendQueuedMessages()
      return
    }
    try {
      interruptForQueue.current = true
      socket.stopGeneration(threadId)
    } catch (stopError) {
      interruptForQueue.current = false
      setError(
        stopError instanceof Error
          ? stopError.message
          : t('thread.errors.stop'),
      )
    }
  }

  function steerQueuedMessage(item: QueuedMessage) {
    if (extensionQueue.mode === 'remote') {
      void extensionQueue.controller.action(item.id)
      return
    }
    if (extensionQueue.mode !== 'local' || extensionQueue.busy) return
    const socket = socketRef.current
    if (!socket || !generating) return
    const originalQueue = queuedRef.current
    const originalIndex = originalQueue.findIndex(
      (queued) => queued.id === item.id,
    )
    const parts = buildMessageParts(item.content, item.attachedFiles)
    const messageId = crypto.randomUUID()
    updateQueue(removeQueuedMessage(originalQueue, item.id))
    applyOptimistic({
      type: 'sent',
      threadId,
      messageId,
      parts,
      sentAt: Date.now(),
      showPendingAssistant: false,
    })
    scrollToBottom()
    try {
      socket.steerGeneration(threadId, parts, generationOptions, messageId)
    } catch {
      updateQueue(restoreFailedSteer(queuedRef.current, item, originalIndex))
      applyOptimistic({
        type: 'generation_error',
        error: t('thread.errors.steer'),
      })
      setError(t('thread.errors.steer'))
    }
  }

  async function send() {
    void haptic('light')
    if (!composerContent().trim() && !attachments.length) return
    if (!socketRef.current || uploading) return

    if (generating && !editingMessageId) {
      await closeEditorAfterAcceptedSend(
        queueCurrentMessage(),
        editorOverlay.requestClose,
      )
      return
    }

    const uploaded = await uploadForSend(attachments)
    if (!uploaded) return
    const parts = buildMessageParts(composerContent(), uploaded)
    if (!parts.length) return

    const messageId = crypto.randomUUID()
    const sentAt = Date.now()
    applyOptimistic({
      type: 'sent',
      threadId,
      messageId,
      parts,
      sentAt,
      replaceMessageId: editingMessageId,
    })
    scrollToBottom()
    try {
      if (editingMessageId) {
        socketRef.current.replaceMessage(
          threadId,
          editingMessageId,
          parts,
          generationOptions,
          messageId,
        )
      } else {
        socketRef.current.generateResponse(
          threadId,
          parts,
          generationOptions,
          messageId,
        )
      }
    } catch (sendError) {
      // The optimistic row stays visible and becomes retryable.
      applyOptimistic({
        type: 'generation_error',
        error:
          sendError instanceof Error
            ? sendError.message
            : t('thread.errors.send'),
      })
      setError(
        sendError instanceof Error
          ? sendError.message
          : t('thread.errors.send'),
      )
      return
    }
    if (editingMessageId) {
      // The edit replaced an earlier message; the saved draft was never sent.
      setEditingMessageId(undefined)
      restoreComposer(draft.savedText())
    } else {
      draft.clear()
      restoreComposer('')
    }
    clearAttachments()
    startGenerating()
    await closeEditorAfterAcceptedSend(true, editorOverlay.requestClose)
  }

  async function persistRecipeState(
    current: RecipeSuggestion,
    state: 'dismissed' | 'extracted',
  ) {
    setRecipeSaving(true)
    setRecipeState((state) => reduceRecipeSuggestion(state, { type: 'acted' }))
    try {
      await api.setRecipeState(threadId, current.id, state)
      if (state === 'extracted') {
        const recipes = await api.listRecipes(threadId)
        setExtractedRecipeCount(
          recipes.all.filter((item) => item.recipeState === 'extracted').length,
        )
      }
    } catch (recipeError) {
      setRecipeState((state) =>
        reduceRecipeSuggestion(state, { type: 'restore', recipe: current }),
      )
      setError(
        recipeError instanceof Error
          ? recipeError.message
          : t('thread.errors.recipe'),
      )
    } finally {
      setRecipeSaving(false)
    }
  }

  function extractRecipe(current: RecipeSuggestion) {
    changeComposerText(current.extractPrompt)
    textareaRef.current?.focus()
    void persistRecipeState(current, 'extracted')
  }

  function cancelEdit() {
    setEditingMessageId(undefined)
    restoreComposer(draft.savedText())
  }

  async function copyMessage(row: MessageRow) {
    await copyText(messageText(row.message.parts))
    setActionRow(undefined)
  }

  function addReferenceToComposer(input: {
    title: string
    uri: string
    kind: string
  }) {
    const current = composerStateRef.current
    const next = appendReference(current.text, input, current.references)
    setText(next.text)
    setReferences(next.references)
    return next.caret
  }

  function quoteSelection(value: string) {
    const next = appendQuote(composerStateRef.current.text, value)
    setText(next)
    pendingCaretRef.current = next.length
  }

  async function mentionSelection(row: MessageRow, value: string) {
    const created = await api.createSnippet({
      threadId,
      messageId: row.id,
      text: value,
    })
    pendingCaretRef.current = addReferenceToComposer({
      title: created.title?.trim() || snippetLabel(value),
      uri: created.uri,
      kind: 'snippet',
    })
  }

  function mentionMessage(row: MessageRow) {
    const caret = addReferenceToComposer({
      title: snippetLabel(messageText(row.message.parts)) || 'message',
      uri: messageReferenceUri(threadId, row.id),
      kind: 'message',
    })
    setActionRow(undefined)
    placeCaret(caret)
  }

  function editMessage(row: MessageRow) {
    // Persist the in-progress draft before the composer is borrowed.
    draft.flush()
    // Sent tokens come back as `@[label](uri)`; restore them as live tokens.
    restoreComposer(messageText(row.message.parts))
    setEditingMessageId(row.id)
    setActionRow(undefined)
  }

  function stageImageEdit(
    image: { source: string; name: string },
    blob: Blob,
    regions: Parameters<typeof stageImageEditResult>[0]['regions'],
    note: string,
  ) {
    const staged = stageImageEditResult({
      image,
      blob,
      regions,
      note,
      copy: {
        visibleHeader: t('message.imageEdit.visibleHeader'),
        overallLabel: t('message.imageEdit.overallLabel'),
        directive: t('message.imageEdit.directive'),
        sourcePathLabel: t('message.imageEdit.sourcePathLabel'),
      },
    })
    setAttachments((current) => [...current, staged.attachment])
    if (staged.text) composerReferences.appendText(staged.text)
  }

  function retryFailedUserMessage(row: MessageRow) {
    const socket = socketRef.current
    if (!socket) return
    const sentAt = Date.now()
    applyOptimistic({
      type: 'sent',
      threadId,
      messageId: row.message.id,
      parts: row.message.parts,
      sentAt,
    })
    scrollToBottom()
    try {
      socket.generateResponse(
        threadId,
        row.message.parts,
        generationOptions,
        row.message.id,
      )
      startGenerating()
    } catch (retryError) {
      applyOptimistic({
        type: 'generation_error',
        error:
          retryError instanceof Error
            ? retryError.message
            : t('thread.errors.retry'),
      })
    }
  }

  function retryMessage(row: MessageRow) {
    if (!socketRef.current) return
    socketRef.current.retryResponse(threadId, row.id, generationOptions)
    setActionRow(undefined)
    startGenerating()
  }

  async function switchVersion(row: MessageRow, direction: 'prev' | 'next') {
    try {
      await api.switchMessageVersion(row.id, direction)
      await load()
    } catch (switchError) {
      setError(
        switchError instanceof Error
          ? switchError.message
          : t('thread.errors.switchVersion'),
      )
    }
  }

  const runCount = crewRunCount(crew)
  const activeRunCount = activeCrewRunCount(crew)
  const crewCounts = crewHeaderCounts(crew)

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value)
    void haptic('light')
  }

  function expandEditor() {
    const origin = composerShellRef.current?.getBoundingClientRect()
    if (origin) setEditorOrigin(origin)
    setEditorOpen(true)
  }

  const editorMotionStyle = editorOrigin
    ? ({
        '--editor-origin-left': `${editorOrigin.left}px`,
        '--editor-origin-top': `${editorOrigin.top}px`,
        '--editor-origin-scale-x': `${editorOrigin.width / window.innerWidth}`,
        '--editor-origin-scale-y': `${editorOrigin.height / window.innerHeight}`,
        '--editor-origin-radius': getComputedStyle(
          composerShellRef.current ?? document.documentElement,
        ).borderRadius,
      } as CSSProperties)
    : undefined

  // One composer instance: inline in the footer, or full screen when
  // expanded, so draft, ref tokens, attachments and actions stay shared.
  const composerView = (
    <>
      {refTrigger && refKinds?.length ? (
        <RefPicker
          kinds={refKinds}
          trigger={refTrigger}
          chipKind={refChipKind}
          onChipKind={setRefChipKind}
          {...refResults}
          onPick={pickReference}
          onClose={composerReferences.close}
        />
      ) : null}
      <Composer
        value={text}
        onChange={(value, target, isComposing) => {
          changeComposerText(value, target.selectionStart, isComposing)
          setOverflowing(target.scrollHeight > 130)
        }}
        onSend={send}
        placeholder={
          uploading
            ? t('composer.uploading')
            : editingMessageId
              ? t('thread.placeholder.edit')
              : generating
                ? t('thread.placeholder.queue')
                : t('thread.placeholder.message')
        }
        model={model}
        models={models}
        onModelChange={(value) => void selectModel(value)}
        effort={reasoningEffort}
        onEffortChange={(value) => void selectEffort(value)}
        fastMode={effectiveFastMode}
        onFastModeChange={() => void toggleFastMode()}
        attachmentTray={
          <ComposerAttachmentTray
            api={api}
            attachments={attachments}
            onChange={setAttachments}
            onAnnotationText={composerReferences.appendText}
          />
        }
        attachmentControl={
          <ComposerAttachments
            attachments={attachments}
            onChange={setAttachments}
            onError={setError}
            goalControl={
              <ComposerGoal state={composerGoal} variant="sheet-row" />
            }
            vision={selectedModel?.capabilities.vision !== false}
          />
        }
        disabled={uploading || (!text.trim() && !attachments.length)}
        generating={generating}
        textareaRef={textareaRef}
        inputBackdrop={
          references.length ? (
            <div
              className="composer-highlight"
              ref={highlightRef}
              aria-hidden="true"
            >
              {highlightSegments(text, references).map((segment, index) =>
                segment.ref ? (
                  <mark key={index}>{segment.text}</mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
              {'\n'}
            </div>
          ) : null
        }
        expanded={editorOpen}
        trailing={
          overflowing && !editorOpen ? (
            <button
              className="expand-editor"
              aria-label={t('thread.editor.expand')}
              onClick={expandEditor}
            >
              <Maximize2 {...COMPOSER_ICON} />
            </button>
          ) : null
        }
        textareaProps={{
          enterKeyHint: 'enter',
          onSelect: (event) =>
            detectReference(
              event.currentTarget.value,
              event.currentTarget.selectionStart,
            ),
          onCompositionStart: () => {
            composingRef.current = true
          },
          onCompositionEnd: (event) => {
            composingRef.current = false
            detectReference(
              event.currentTarget.value,
              event.currentTarget.selectionStart,
            )
          },
          onScroll: (event) => {
            if (highlightRef.current)
              highlightRef.current.scrollTop = event.currentTarget.scrollTop
          },
        }}
        onTextareaKeyDown={(event) => {
          if (refTrigger && !event.nativeEvent.isComposing) {
            if (event.key === 'Escape') {
              event.preventDefault()
              composerReferences.close()
              return true
            }
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              refResults.items[0]
            ) {
              event.preventDefault()
              pickReference(refResults.items[0])
              return true
            }
          }
          if (event.key !== 'Enter' || event.nativeEvent.isComposing)
            return false
          const plainEnterSends =
            !event.shiftKey && window.matchMedia('(pointer: fine)').matches
          if (event.ctrlKey || event.metaKey || plainEnterSends) {
            event.preventDefault()
            send()
            return true
          }
          return false
        }}
      />
    </>
  )

  return (
    <RefOpenContext.Provider value={setOpenedRef}>
      {/* Keep the existing large thread tree stable; the gallery only scopes image clicks. */}
      {/* prettier-ignore */}
      <ImageGalleryProvider images={galleryImages} onAnnotate={stageImageEdit}>
        <FileLinkProvider>
        <div className="thread-detail">
        <header className="detail-header">
          {layoutMode === 'single' ? (
            <button
              aria-label={t('thread.back')}
              onClick={() => navigate(listPath)}
            >
              <ArrowLeft />
            </button>
          ) : null}
          <div className="thread-heading">
            <button
              className="thread-title-button"
              onClick={() => setRenameTitle(title)}
            >
              <h1>{title}</h1>
            </button>
            <AnchoredMenu
              open={projectMenuOpen}
              onOpenChange={setProjectMenuOpen}
              label={t('thread.switchProject')}
              trigger={
                <button
                  className="thread-subtitle"
                  aria-label={t('thread.switchProjectFor', {
                    desktop: pairing.name,
                  })}
                >
                  <DesktopStatusIcon status={status} />
                  {generating ? (
                    <span className="thread-generating">
                      <span>{t('thread.generating')}</span>
                      {generationStart !== undefined ? (
                        <GeneratingElapsed startedAt={generationStart} />
                      ) : null}
                    </span>
                  ) : (
                    <span>
                      {workspaceName(workspaceId || undefined, workspaces)}
                    </span>
                  )}
                  <ChevronDown size={14} />
                </button>
              }
              items={workspaces.map((workspace) => ({
                key: workspace.id,
                label: workspace.name,
                checked: workspace.id === workspaceId,
                disabled: projectMove?.status === 'moving',
                onSelect: () => void moveToWorkspace(workspace.id),
              }))}
            />
          </div>
          <div className="detail-actions">
            {runCount ? (
              <button
                className="header-action-button"
                aria-label={
                  activeRunCount
                    ? t('thread.agentsRunning', { count: activeRunCount })
                    : t('thread.crewRuns', { count: runCount })
                }
                onClick={() => setCrewOpen(true)}
              >
                <Network size={17} strokeWidth={2} aria-hidden="true" />
                {activeRunCount ? (
                  <span className="crew-running-dot" aria-hidden="true" />
                ) : null}
              </button>
            ) : null}
            {contextUsage ? (
              <ContextRing
                usage={contextUsage}
                onOpen={() => setContextOpen(true)}
              />
            ) : null}
            <AnchoredMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              label={t('thread.menu.label')}
              trigger={
                <button
                  className="header-action-button"
                  aria-label={t('thread.menu.label')}
                >
                  <MoreVertical size={18} strokeWidth={2} />
                </button>
              }
              items={[
                {
                  key: 'rename',
                  label: t('common.rename'),
                  icon: <FileText size={16} />,
                  onSelect: () => setRenameTitle(title),
                },
                {
                  key: 'files',
                  label: knownFileCount
                    ? t('thread.menu.filesCount', { count: knownFileCount })
                    : t('thread.menu.files'),
                  icon: <Folder size={16} />,
                  onSelect: openThreadFiles,
                },
                {
                  key: 'info',
                  label: t('thread.menu.info'),
                  icon: <Info size={16} />,
                  onSelect: () => setThreadInfoOpen(true),
                },
                ...(workspaceId
                  ? [
                      {
                        key: 'preview-html',
                        label: t('thread.menu.previewHtml'),
                        icon: <FileText size={16} />,
                        onSelect: () => setHtmlChooserOpen(true),
                      } as const,
                    ]
                  : []),
                { type: 'separator', key: 'copy-separator' },
                {
                  key: 'copy-link',
                  label: t('thread.menu.copyLink'),
                  icon: <Link size={16} />,
                  onSelect: () =>
                    void copyValue(
                      `${window.location.origin}/d/${pairing.id}/threads/${threadId}`,
                    ),
                },
                {
                  key: 'copy-id',
                  label: t('thread.menu.copyId'),
                  icon: <Copy size={16} />,
                  onSelect: () => void copyValue(threadId),
                },
              ]}
            />
          </div>
        </header>
        {missingThread ? (
          <section className="thread-missing-state">
            <Trash2 size={28} strokeWidth={1.7} aria-hidden="true" />
            <h2>{missingThread.title}</h2>
            <p>{missingThread.detail}</p>
            <button
              className="secondary"
              onClick={() => navigate(listPath, { replace: true })}
            >
              {t('thread.back')}
            </button>
          </section>
        ) : null}
        {errorPresence.rendered && !missingThread ? (
          <div
            className={`thread-error-banner ${presenceClass(errorPresence.phase)}`}
            role="alert"
          >
            <Info size={17} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>{presentedError.current}</strong>
            </div>
            <button aria-label={t('thread.dismissError')} onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        ) : null}
        {!missingThread ? (
          <div className="message-area">
            <div
              className="message-scroll"
              ref={parentRef}
              onScroll={(event) =>
                setScrolledUp(isScrolledAwayFromLatest(event.currentTarget))
              }
            >
              <div
                style={{
                  height:
                    virtualizer.getTotalSize() + (pendingAssistant ? 56 : 0),
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const row = roots[item.index]
                  return (
                    <div
                      key={row.id}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      data-row-id={row.id}
                      className={
                        flashRow === row.id ? 'search-row-flash' : undefined
                      }
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <MessageBoundary>
                        <ThreadMessageView
                          row={row}
                          workspacePath={workspacePath}
                          generating={generating && row === roots.at(-1)}
                          usage={usageForReply(
                            row,
                            row.id === usageRowId
                              ? lastReply?.usage
                              : undefined,
                          )}
                          onActions={setActionRow}
                          onRetryFailed={retryFailedUserMessage}
                          onSwitchVersion={(message, direction) =>
                            void switchVersion(message, direction)
                          }
                          nestedByParent={nestedByParent}
                        />
                      </MessageBoundary>
                    </div>
                  )
                })}
                {pendingAssistant ? (
                  <div
                    className="pending-assistant-slot"
                    style={{
                      transform: `translateY(${virtualizer.getTotalSize()}px)`,
                    }}
                  >
                    <PendingAssistantView pending={pendingAssistant} />
                  </div>
                ) : null}
              </div>
            </div>
            {timeline.length >= TIMELINE_MIN_ENTRIES ? (
              <TimelineRail
                entries={timeline}
                rowCount={roots.length}
                activeIndex={virtualizer.range?.startIndex}
                onJump={(index) =>
                  virtualizer.scrollToIndex(index, { align: 'start' })
                }
              />
            ) : null}
          </div>
        ) : null}
        {!missingThread ? (
          <div className="thread-generation-controls">
            {/* Legacy direct-stop contract was onStop={() => …}; the shared
              handler now also performs remote Send now semantics. */}
            <GenerationActivityBar
              generating={generating}
              rows={roots}
              pending={pendingAssistant}
              startedAt={generationStart}
              todoProgress={todoProgress(todos, generating)}
              onOpenTodos={() => setTodoSheetOpen(true)}
              onStop={sendQueueNow}
            />
            {jumpPresence.rendered ? (
              // Base markup remains className="latest-jump"; generating adds
              // spacing above the activity bar without creating another button.
              <button
                className={`latest-jump ${presenceClass(jumpPresence.phase)}${generating ? ' above-activity' : ''}`}
                aria-label={t('thread.jumpToLatest')}
                onClick={jumpToLatest}
              >
                <ArrowDownToLine size={16} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : null}
        {!missingThread &&
        (inlineHandoff.approvals.length || inlineHandoff.questions.length) ? (
          <aside className="inline-handoff" aria-label={t('thread.actionRequired')}>
            <HandoffCards
              approvals={inlineHandoff.approvals}
              questions={inlineHandoff.questions}
              compact
              onRespondApproval={respondApproval}
              onRespondQuestion={respondQuestion}
            />
          </aside>
        ) : null}
        {!missingThread ? (
          <footer
            className={`composer-shell${searchTarget?.pendingFirstSend ? ' shared-composer' : ''}`}
            ref={composerShellRef}
          >
            {goalPresence.rendered ? (
              <div className={presenceClass(goalPresence.phase)}>
                <ComposerGoal state={presentedGoal.current} variant="strip" />
              </div>
            ) : null}
            {recipePresence.rendered && presentedRecipe.current ? (
              <div className={presenceClass(recipePresence.phase)}>
                <RecipeBanner
                  recipe={presentedRecipe.current}
                  extractedCount={extractedRecipeCount}
                  busy={recipeSaving}
                  onExtract={() => extractRecipe(presentedRecipe.current!)}
                  onDismiss={() =>
                    void persistRecipeState(
                      presentedRecipe.current!,
                      'dismissed',
                    )
                  }
                />
              </div>
            ) : null}

            {extensionQueue.accessory}
            {queuePresence.rendered ? (
              <div className={presenceClass(queuePresence.phase)}>
                <QueuePanel
                  messages={presentedQueue.current}
                  disabled={
                    extensionQueue.busy ||
                    extensionQueue.mode === 'unavailable' ||
                    !queuedMessages.length
                  }
                  generating={generating}
                  onSendNow={sendQueueNow}
                  onUpdate={(next) => void updateQueue(next)}
                  onSteer={steerQueuedMessage}
                  onEditingChange={setEditingQueuedItem}
                />
              </div>
            ) : null}
            {editingMessageId ? (
              <div className="editing-banner">
                {t('thread.editingMessage')}
                <button onClick={cancelEdit}>{t('common.cancel')}</button>
              </div>
            ) : null}
            {editorOpen ? null : composerView}
          </footer>
        ) : null}
        {todoSheetOpen ? (
          <TodoSheet todos={todos} onClose={() => setTodoSheetOpen(false)} />
        ) : null}
        {editorOverlay.rendered ? (
          <div
            className={`fullscreen-editor${editorOverlay.closing ? ' closing' : ''}`}
            style={editorMotionStyle}
            onAnimationEnd={(event) => {
              if (
                (event.animationName === 'fullscreen-editor-out' ||
                  event.animationName === 'fullscreen-editor-reduced-out') &&
                shouldFinishOverlayClose(
                  editorOverlay.closing,
                  event.target,
                  event.currentTarget,
                )
              )
                editorOverlay.finishClose()
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t('thread.editor.label')}
          >
            <header>
              <button
                className="editor-minimize"
                onClick={editorOverlay.requestClose}
                aria-label={t('thread.editor.minimize')}
              >
                <Minimize2 {...COMPOSER_ICON} />
              </button>
            </header>
            {composerView}
          </div>
        ) : null}
        {renameTitle !== undefined ? (
          <BottomSheet
            title={t('thread.rename.title')}
            onClose={() => {
              if (!renaming) setRenameTitle(undefined)
            }}
            footer={
              <button
                className="primary"
                disabled={renaming || !renameTitle.trim()}
                onClick={() => void rename()}
              >
                {renaming ? t('thread.rename.saving') : t('common.save')}
              </button>
            }
          >
            <input
              aria-label={t('thread.rename.input')}
              className="rename-input"
              autoFocus
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
            />
          </BottomSheet>
        ) : null}
        {selectableRow ? (
          <SelectableTextView
            onQuote={quoteSelection}
            onMention={(value) => mentionSelection(selectableRow, value)}
            onClose={() => {
              setSelectableRow(undefined)
              const caret = pendingCaretRef.current
              pendingCaretRef.current = undefined
              if (caret !== undefined) placeCaret(caret)
            }}
          >
            <MessageMarkdownContent text={messageText(selectableRow.message.parts)} />
          </SelectableTextView>
        ) : null}
        {actionRow ? (
          <BottomSheet
            title={t('message.actions.label')}
            className="action-sheet"
            onClose={() => setActionRow(undefined)}
          >
            <button
              onClick={() => {
                void haptic('light')
                void copyMessage(actionRow)
              }}
            >
              <Copy size={18} aria-hidden="true" />
              {t('message.actions.copy')}
            </button>
            <button
              onClick={() => {
                setSelectableRow(actionRow)
                setActionRow(undefined)
              }}
            >
              <TextSelection size={18} aria-hidden="true" />
              {t('message.actions.select')}
            </button>
            <button
              onClick={() => {
                void haptic('light')
                mentionMessage(actionRow)
              }}
            >
              <AtSign size={18} aria-hidden="true" />
              {t('message.actions.mention')}
            </button>
            {actionRow.message.role === 'user' ? (
              <button
                onClick={() => {
                  void haptic('light')
                  editMessage(actionRow)
                }}
              >
                <PencilLine size={18} aria-hidden="true" />
                {t('message.actions.editResend')}
              </button>
            ) : (
              <button
                onClick={() => {
                  void haptic('light')
                  retryMessage(actionRow)
                }}
              >
                <RotateCcw size={18} aria-hidden="true" />
                {t('message.actions.retry')}
              </button>
            )}
          </BottomSheet>
        ) : null}
        {htmlChooserOpen && workspaceId ? (
          <HtmlFileChooser
            workspaceId={workspaceId}
            onClose={() => setHtmlChooserOpen(false)}
          />
        ) : null}
        {threadFilesOpen ? (
          <ThreadFilesSheet
            delivered={deliveredFiles}
            changedFiles={changedFiles ?? []}
            fileWrites={threadFileWrites ?? []}
            attachments={userAttachments}
            changedStatus={
              changedFilesError
                ? 'error'
                : changedFiles
                  ? 'ready'
                  : 'loading'
            }
            workspacePath={workspacePath}
            onClose={closeThreadFiles}
          />
        ) : null}
        {threadInfoOpen ? (
          <BottomSheet
            title={t('thread.menu.info')}
            className="thread-info-sheet"
            onClose={closeThreadInfo}
          >
            <section className="thread-facts" aria-label={t('thread.info.summary')}>
              <span>
                <strong>{messages.length}</strong>{' '}
                {t('thread.info.messages', { count: messages.length })}
              </span>
              <span>
                <strong>
                  {workspaceName(workspaceId || undefined, workspaces)}
                </strong>{' '}
                {t('thread.info.projectUnit')}
              </span>
              <span>
                <strong>{pairing.name}</strong> {t('thread.info.desktopUnit')}
              </span>
              {diffStats ? (
                <button className="thread-files-fact" onClick={openThreadFiles}>
                  {formatDiffStats(
                    diffStats.additions ?? 0,
                    diffStats.deletions ?? 0,
                    diffStats.filesChanged ?? 0,
                  )}
                </button>
              ) : null}
            </section>
            <section
              className="sheet-section"
              aria-labelledby="project-heading"
            >
              <h3 id="project-heading">{t('thread.info.project')}</h3>
              <p className="sheet-note">
                {workspaceName(workspaceId || undefined, workspaces)}
              </p>
            </section>
            <section
              className="sheet-section"
              aria-labelledby="desktop-heading"
            >
              <h3 id="desktop-heading">{t('thread.info.desktop')}</h3>
              <p className="sheet-note">
                {t('thread.info.livesOnBefore')}
                <strong>{pairing.name}</strong>
                {t('thread.info.livesOnAfter')}
              </p>
            </section>
          </BottomSheet>
        ) : null}
        {crewOpen ? (
          <BottomSheet
            title={t('thread.crew.title')}
            titleMeta={
              <>
                <span>{crewCounts.runs}</span>
                {crewCounts.active ? <span>{crewCounts.active}</span> : null}
              </>
            }
            className="crew-sheet"
            onClose={() => setCrewOpen(false)}
          >
            {crew.missions.map((mission) => (
              <section className="crew-mission" key={mission.id}>
                <button
                  className="crew-mission-heading"
                  onClick={() => {
                    const target = mission.rootMessageId
                      ? document.querySelector<HTMLElement>(
                          `[data-row-id="${CSS.escape(mission.rootMessageId)}"]`,
                        )
                      : null
                    target?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    })
                    setCrewOpen(false)
                  }}
                >
                  <span>
                    <strong>{mission.title}</strong>
                    <small>{mission.objective}</small>
                  </span>
                  <em data-status={mission.status}>{mission.status}</em>
                </button>
                {crew.missions.length > 1 ? (
                  <p className="crew-counts">
                    <span>
                      {t('thread.crew.runs', { count: mission.runs.length })}
                    </span>
                    <span>
                      {t('thread.crew.handoffs', {
                        count: mission.handoffs.length,
                      })}
                    </span>
                  </p>
                ) : null}
                <div className="crew-timeline">
                  {missionTimeline(mission).map((entry) =>
                    entry.kind === 'run' ? (
                      <article key={`run-${entry.value.id}`}>
                        <Workflow size={15} />
                        <div>
                          <div className="crew-run-heading">
                            <strong>{entry.value.agentName}</strong>
                            <span>{entry.value.executionMode}</span>
                          </div>
                          <small className="crew-run-meta">
                            <span data-status={entry.value.status}>
                              {entry.value.status}
                            </span>
                            <span>{entry.value.model}</span>
                          </small>
                          <p>{entry.value.inputSummary}</p>
                          {entry.value.outputSummary ? (
                            <p>{entry.value.outputSummary}</p>
                          ) : null}
                        </div>
                      </article>
                    ) : (
                      <article key={`handoff-${entry.value.id}`}>
                        <ArrowUp size={15} />
                        <div>
                          <strong>
                            {t('thread.crew.handoffTo', {
                              agent: entry.value.toAgentName,
                            })}
                          </strong>
                          <small>{entry.value.status}</small>
                          <p>{entry.value.packet?.goal}</p>
                          <p>{entry.value.packet?.deliverable}</p>
                          {entry.value.resultSummary ? (
                            <p>{entry.value.resultSummary}</p>
                          ) : null}
                        </div>
                      </article>
                    ),
                  )}
                </div>
              </section>
            ))}
          </BottomSheet>
        ) : null}
        {contextOpen && contextUsage ? (
          <ContextUsageSheet
            usage={contextUsage}
            session={sessionUsage}
            generating={generating}
            onCompact={compact}
            onClose={() => setContextOpen(false)}
          />
        ) : null}
        {optionsSheet === 'model' ? (
          <BottomSheet
            title={t('composer.model')}
            className="model-sheet"
            onClose={() => setOptionsSheet(null)}
          >
            {modelGroups.map((group) => (
              <div className="sheet-group" key={group.provider}>
                <h3>{group.provider}</h3>
                <div className="sheet-list">
                  {group.models.map((candidate) => {
                    const current = candidate.id === model
                    return (
                      <button
                        ref={current ? selectedModelRef : undefined}
                        className={`sheet-row${current ? ' selected' : ''}`}
                        aria-current={current ? 'true' : undefined}
                        key={candidate.id}
                        onClick={() => {
                          void haptic('selection')
                          void selectModel(candidate.id)
                        }}
                      >
                        <span className="sheet-row-copy">
                          <span>{candidate.name}</span>
                          <small>{candidate.modelId}</small>
                        </span>
                        {current ? (
                          <Check
                            className="sheet-row-check"
                            size={18}
                            strokeWidth={2}
                          />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </BottomSheet>
        ) : null}
        {optionsSheet === 'effort' ? (
          <BottomSheet
            title={t('composer.effort.title')}
            className="effort-sheet"
            onClose={() => setOptionsSheet(null)}
          >
            <div className="sheet-list">
              {effortOptions.map((effort) => {
                const current = effort === reasoningEffort
                return (
                  <button
                    className={`sheet-row compact${current ? ' selected' : ''}`}
                    aria-current={current ? 'true' : undefined}
                    key={effort}
                    onClick={() => {
                      void haptic('selection')
                      void selectEffort(effort)
                    }}
                  >
                    <span>{effortLabel(effort)}</span>
                    {current ? (
                      <Check
                        className="sheet-row-check"
                        size={18}
                        strokeWidth={2}
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </BottomSheet>
        ) : null}
        {openedRef ? (
          <RefCardSheet
            api={api}
            desktopId={pairing.id}
            threadId={threadId}
            opened={openedRef}
            onNavigate={(path) => {
              setOpenedRef(undefined)
              navigate(path)
            }}
            onClose={() => setOpenedRef(undefined)}
          />
        ) : null}
        </div>
        </FileLinkProvider>
      </ImageGalleryProvider>
    </RefOpenContext.Provider>
  )
}
