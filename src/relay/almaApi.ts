import { parseGoal } from '../screens/threadGoal'
import { parseLoop } from '../screens/threadLoop'
import {
  parseRecipeResponse,
  type RecipeResponse,
} from '../screens/recipeSuggestions'
import { parseBacklinks, type RefBacklink } from '../screens/refCards'
import {
  parseCrystalDetail,
  parseCrystalOverview,
  type CrystalDetail,
  type CrystalOverview,
} from '../screens/crystals'
import { parseTimeClues, type TimeClueResponse } from '../screens/timeClues'
import { parseAgentCrew, type AgentCrew } from '../screens/agentCrew'
import type { LiveSubagentSnapshot } from '../screens/subagentLive'
import type { RelayTunnel, TunnelSocket } from './tunnel'

export const MAX_RELAY_UPLOAD_BYTES = 6 * 1024 * 1024

export type ReasoningEffort =
  'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

export interface ModelCapabilities {
  reasoning?: boolean
  reasoningLevels?: ReasoningEffort[]
  vision?: boolean
  serviceTiers?: string[]
  defaultServiceTier?: string
  [key: string]: unknown
}

export interface AlmaModel {
  /** Canonical selection id, always `providerId:modelId`. */
  id: string
  modelId: string
  name: string
  provider: string
  providerId: string
  providerType?: string
  capabilities: ModelCapabilities
}

export interface Workspace {
  id: string
  name: string
  path?: string
  parentWorkspaceId?: string | null
  isTemporary?: boolean
  isWorktree?: boolean
  createdAt?: string | number
  updatedAt?: string | number
  [key: string]: unknown
}

export interface AlmaSettings {
  chat?: {
    defaultModel?: string
    modelUsageHistory?: Record<string, number>
    [key: string]: unknown
  }
  general?: {
    defaultWorkspaceId?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface Thread {
  id: string
  title?: string
  model?: string
  reasoningEffort?: ReasoningEffort | 'off'
  fastMode?: boolean | null
  workspaceId?: string
  isGenerating?: boolean
  isGeneratingTitle?: boolean
  isIncognito?: boolean
  isFavorited?: boolean
  isFavoritePinned?: boolean
  favoritePinnedOrder?: number | null
  parentThreadId?: string | null
  metadata?: Record<string, unknown>
  /** Present on GET /api/threads/:id (not on the list endpoint). */
  messages?: MessageRow[]
  createdAt?: string | number
  updatedAt?: string | number
  [key: string]: unknown
}
export interface MessagePart {
  type: string
  text?: string
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
  [key: string]: unknown
}
export type ThreadFileWrite =
  | {
      type: 'write'
      filePath: string
      content: string
      bytesWritten?: number
      previousContent?: string
      messageId: string
      toolCallId: string
      timestamp: string
    }
  | {
      type: 'edit'
      filePath: string
      oldString: string
      newString: string
      replaceAll?: boolean
      messageId: string
      toolCallId: string
      timestamp: string
    }

export interface MessageRow {
  id: string
  threadId: string
  parentId?: string | null
  /** Ordinal position of the row in the thread (0-based), NOT nesting depth. */
  depth?: number
  parentToolCallId?: string | null
  message: { id: string; role: string; parts: MessagePart[] }
  timestamp?: number
  createdAt?: string | number
  updatedAt?: string | number
  metadata?: {
    versionIndex?: number
    versionCount?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}
export interface RealtimeEvent {
  type: string
  data: any
  timestamp?: number
}
export interface ApprovalRequest {
  requestId: string
  source: 'bash' | 'acp' | 'ptc' | string
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  type: string
  threadId?: string
  metadata?: Record<string, unknown>
}
export interface ApprovalDecision {
  requestId: string
  approved: boolean
  reason: string
  action: 'allow_once' | 'allow_always' | 'deny' | 'deny_with_reason'
  denyReason?: string
}
export type ApprovalSocketEvent =
  | { type: 'show'; request: ApprovalRequest }
  | { type: 'resolved'; decision: ApprovalDecision }

export interface UserQuestionOption {
  label: string
  description?: string
  preview?: string
}
export interface UserQuestion {
  header: string
  question: string
  options: UserQuestionOption[]
  multiSelect: boolean
  allowCustomAnswer?: boolean
  isSecret?: boolean
}
export interface QuestionRequest {
  requestId: string
  source: 'claude' | 'codex' | string
  threadId?: string
  questions: UserQuestion[]
  metadata?: Record<string, unknown>
}
export interface QuestionDecision {
  requestId: string
  action: 'accept' | 'decline' | 'cancel'
  reason: string
}
export type QuestionSocketEvent =
  | { type: 'show'; request: QuestionRequest }
  | { type: 'resolved'; decision: QuestionDecision }

const denied = [
  /^\/api\/bun\/execute(?:\/|$)/,
  /^\/api\/computer-use(?:\/|$)/,
  /^\/api\/data\/(?:import|export)(?:\/|$)/,
  /^\/api\/threads\/batch-delete(?:\/|$)/,
  /^\/api\/terminal(?:\/|$)/,
  /^\/ws\/terminal(?:\/|$)/,
]
export function assertSafePath(path: string, method = 'GET') {
  const clean = new URL(path, 'https://local.invalid').pathname
  const verb = method.toUpperCase()
  const refsAllowed =
    (verb === 'GET' &&
      /^\/api\/refs\/(?:kinds|search|recent|resolve|backlinks|recipes|time-clues|time-clues\/days|scratch)$/.test(
        clean,
      )) ||
    (verb === 'POST' &&
      /^\/api\/refs\/(?:resolve|backlink-counts|snippets|recipes\/state|time-clues\/(?:seen|ignore))$/.test(
        clean,
      ))
  const crystalAllowed =
    (verb === 'GET' &&
      /^\/api\/crystal\/(?:overview|[^/]+|[^/]+\/validate)$/.test(clean)) ||
    (verb === 'POST' &&
      /^\/api\/crystal\/[^/]+\/(?:slot|dormant|type|prefill|confirm|cancel)$/.test(
        clean,
      )) ||
    (verb === 'PUT' && /^\/api\/crystal\/[^/]+\/checklist$/.test(clean))
  // Loops re-send prompts unattended, so only the documented verbs on the
  // exact route are reachable; anything nested under it is refused.
  const loopRoute = /^\/api\/threads\/[^/]+\/loop(?:\/|$)/.test(clean)
  const loopAllowed =
    /^\/api\/threads\/[^/]+\/loop$/.test(clean) &&
    ['GET', 'PUT', 'DELETE'].includes(verb)
  if (
    (/^\/api\/activity-recorder(?:\/|$)/.test(clean) &&
      !(verb === 'GET' && clean === '/api/activity-recorder/suggestions')) ||
    (/^\/api\/refs(?:\/|$)/.test(clean) && !refsAllowed) ||
    (/^\/api\/crystal(?:\/|$)/.test(clean) && !crystalAllowed) ||
    (loopRoute && !loopAllowed) ||
    (/^\/api\/gallery\/cache(?:\/|$)/.test(clean) && verb !== 'GET') ||
    denied.some((pattern) => pattern.test(clean)) ||
    (/^\/api\/settings$/.test(clean) && verb !== 'GET') ||
    (/^\/api\/providers(?:\/|$)/.test(clean) && !['GET', 'HEAD'].includes(verb))
  )
    throw new Error(`Blocked dangerous Alma path: ${clean}`)
}

export class AlmaHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AlmaHttpError'
  }
}

/** Older desktops lack some relay routes; treat those as absent, not broken. */
export function isUnsupportedEndpoint(error: unknown) {
  return (
    error instanceof AlmaHttpError && [404, 405, 501].includes(error.status)
  )
}

/** GET /api/threads/:threadId/context-usage (and `context_usage_update`). */
export interface ThreadContextUsage {
  threadId: string
  usagePercent: number
  totalTokens: number
  contextWindow: number
}

/** POST /api/threads/:id/compact response. */
export interface CompactResult {
  success: boolean
  compactedCount?: number
  savedTokens?: number
  code?: string
  error?: string
}

export interface DesktopHealth {
  name?: string
  status?: string
  timestamp?: string | number
}

export interface RefKind {
  kind: string
  label: string
  prefixes: string[]
  order: number
  scope: string
  available: boolean
}
export interface RefResult {
  uri: string
  kind: string
  id: string
  title: string
  subtitle?: string
  score?: number
  meta?: Record<string, unknown>
}
export interface RefRecentItem {
  uri: string
  kind: string
  label: string
  count: number
  lastAt: string | number
}
export interface RefCard {
  uri: string
  kind: string
  id: string
  exists: boolean
  title: string
  subtitle?: string
  summary?: string
  payload?: unknown
  nav?: { route: string; threadId?: string; messageId?: string }
  updatedAt?: string | number
}

export class AlmaApi {
  constructor(public tunnel: Pick<RelayTunnel, 'fetch' | 'openWebSocket'>) {}
  private async request<T>(
    path: string,
    init: {
      method?: string
      body?: unknown
      rawBody?: Uint8Array
      headers?: Record<string, string>
    } = {},
  ): Promise<T> {
    const method = init.method ?? 'GET'
    assertSafePath(path, method)
    const response = await this.tunnel.fetch(path, {
      method,
      headers:
        init.headers ??
        (init.body === undefined ? {} : { 'content-type': 'application/json' }),
      body:
        init.rawBody ??
        (init.body === undefined ? undefined : JSON.stringify(init.body)),
    })
    if (response.status < 200 || response.status >= 300)
      throw new AlmaHttpError(
        `${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
        response.status,
      )
    if (response.status === 204) return undefined as T
    return response.json<T>()
  }
  async getImage(path: string): Promise<Blob> {
    assertSafePath(path, 'GET')
    const response = await this.tunnel.fetch(path, { method: 'GET' })
    const mediaType =
      Object.entries(response.headers).find(
        ([key]) => key.toLowerCase() === 'content-type',
      )?.[1] ?? ''
    if (response.status !== 200 || !mediaType.startsWith('image/'))
      throw new Error('Image unavailable')
    const bytes = await response.bytes()
    return new Blob([new Uint8Array(bytes)], { type: mediaType })
  }
  listModels() {
    return this.request<{
      data: Array<
        Omit<AlmaModel, 'id' | 'modelId' | 'provider'> & {
          id: string
          providerName?: string
        }
      >
    }>('/api/models').then(({ data }) =>
      data.map((model) => ({
        ...model,
        modelId: model.id,
        id: `${model.providerId}:${model.id}`,
        provider: model.providerName ?? model.providerId,
      })),
    )
  }
  getHealth() {
    return this.request<DesktopHealth>('/api/health')
  }
  getSettings() {
    return this.request<AlmaSettings>('/api/settings')
  }
  listWorkspaces() {
    return this.request<Workspace[]>('/api/workspaces')
  }
  listPreviewHtmlFiles(workspaceId: string) {
    return this.request<{ htmlFiles: string[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/preview/html-files`,
    )
  }
  listThreads() {
    return this.request<Thread[]>('/api/threads')
  }
  getThread(id: string) {
    return this.request<Thread>(`/api/threads/${encodeURIComponent(id)}`)
  }
  async getGoal(id: string) {
    const result = await this.request<{ goal: unknown; active: boolean }>(
      `/api/threads/${encodeURIComponent(id)}/goal`,
    )
    return { goal: parseGoal(result.goal), active: result.active === true }
  }
  listRefKinds() {
    return this.request<{ kinds: RefKind[] }>('/api/refs/kinds')
  }
  searchRefs(options: {
    q?: string
    kinds?: string[]
    limitPerKind?: number
    threadId?: string
    workspaceId?: string
    timeZone?: string
  }) {
    const query = new URLSearchParams()
    query.set('q', options.q ?? '')
    if (options.kinds?.length) query.set('kinds', options.kinds.join(','))
    if (options.limitPerKind)
      query.set('limitPerKind', String(options.limitPerKind))
    if (options.threadId) query.set('threadId', options.threadId)
    if (options.workspaceId) query.set('workspaceId', options.workspaceId)
    if (options.timeZone) query.set('timeZone', options.timeZone)
    return this.request<{ query: string; results: RefResult[] }>(
      `/api/refs/search?${query}`,
    )
  }
  listRecentRefs(kind?: string) {
    return this.request<{ items: RefRecentItem[] }>(
      `/api/refs/recent?limit=20${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`,
    )
  }
  resolveRef(uri: string, options: { full?: boolean; threadId?: string } = {}) {
    const query = new URLSearchParams({ uri })
    if (options.full) query.set('full', '1')
    if (options.threadId) query.set('threadId', options.threadId)
    return this.request<RefCard>(`/api/refs/resolve?${query}`)
  }
  /** Saves selected message text as an `alma://snippet/<id>` reference. */
  createSnippet(input: {
    threadId: string
    messageId?: string
    text: string
    title?: string
  }) {
    return this.request<{ id: string; uri: string; title?: string | null }>(
      '/api/refs/snippets',
      { method: 'POST', body: input },
    )
  }
  resolveRefs(
    uris: string[],
    options: { full?: boolean; threadId?: string } = {},
  ) {
    return this.request<{ results: RefCard[] }>('/api/refs/resolve', {
      method: 'POST',
      body: { uris: uris.slice(0, 64), ...options },
    })
  }
  async getTimeClues(
    rangeId: string,
    options: { threadId?: string; offset?: number } = {},
  ): Promise<TimeClueResponse> {
    const query = new URLSearchParams({
      rangeId,
      offset: String(options.offset ?? 0),
    })
    if (options.threadId) query.set('threadId', options.threadId)
    return parseTimeClues(
      await this.request<unknown>(`/api/refs/time-clues?${query}`),
    )
  }
  getTimeClueDays(rangeId: string) {
    return this.request<{ clueDays: string[]; cronDays: string[] }>(
      `/api/refs/time-clues/days?${new URLSearchParams({ rangeId })}`,
    )
  }
  markTimeCluesSeen(rangeId: string, ids: string[]) {
    return this.request<{ ok: boolean }>('/api/refs/time-clues/seen', {
      method: 'POST',
      body: { rangeId, ids: ids.slice(0, 50) },
    })
  }
  ignoreTimeClue(id: string) {
    return this.request<{ ok: boolean }>('/api/refs/time-clues/ignore', {
      method: 'POST',
      body: { id },
    })
  }
  async getBacklinks(uri: string): Promise<RefBacklink[]> {
    return parseBacklinks(
      await this.request<unknown>(
        `/api/refs/backlinks?uri=${encodeURIComponent(uri)}`,
      ),
    )
  }
  backlinkCounts(uris: string[]) {
    return this.request<{ counts: Record<string, number> }>(
      '/api/refs/backlink-counts',
      { method: 'POST', body: { uris: uris.slice(0, 200) } },
    )
  }
  async getStartSuggestions() {
    const result = await this.request<{ suggestions?: unknown }>(
      '/api/activity-recorder/suggestions',
    )
    return Array.isArray(result.suggestions)
      ? result.suggestions.filter(
          (s): s is string => typeof s === 'string' && !!s.trim(),
        )
      : []
  }
  crystalAction(
    id: string,
    action:
      | 'slot'
      | 'dormant'
      | 'type'
      | 'checklist'
      | 'prefill'
      | 'validate'
      | 'confirm'
      | 'cancel',
    value?: unknown,
  ) {
    const body =
      action === 'checklist'
        ? value
        : ['slot', 'dormant', 'type'].includes(action)
          ? { [action]: value }
          : undefined
    return this.request<Record<string, unknown>>(
      `/api/crystal/${encodeURIComponent(id)}/${action}`,
      {
        method:
          action === 'validate'
            ? 'GET'
            : action === 'checklist'
              ? 'PUT'
              : 'POST',
        body,
      },
    )
  }
  async getCrystalOverview(): Promise<CrystalOverview> {
    return parseCrystalOverview(
      await this.request<unknown>('/api/crystal/overview'),
    )
  }
  async getCrystal(id: string): Promise<CrystalDetail> {
    return parseCrystalDetail(
      await this.request<unknown>(`/api/crystal/${encodeURIComponent(id)}`),
    )
  }
  async listRecipes(threadId: string): Promise<RecipeResponse> {
    return parseRecipeResponse(
      await this.request<unknown>(
        `/api/refs/recipes?threadId=${encodeURIComponent(threadId)}`,
      ),
    )
  }
  setRecipeState(
    threadId: string,
    recipeId: string,
    state: 'dismissed' | 'extracted',
  ) {
    return this.request<{ ok?: boolean }>('/api/refs/recipes/state', {
      method: 'POST',
      body: { threadId, recipeId, state },
    })
  }
  async setGoal(
    id: string,
    condition: string,
    options: { edit?: boolean; model?: string; paused?: boolean } = {},
  ) {
    if (!condition.trim()) throw new Error('Enter a goal condition')
    const result = await this.request<{ goal: unknown; started: boolean }>(
      `/api/threads/${encodeURIComponent(id)}/goal`,
      { method: 'PUT', body: { condition: condition.trim(), ...options } },
    )
    return { goal: parseGoal(result.goal), started: result.started === true }
  }
  clearGoal(id: string) {
    return this.request<{ cleared: string | null }>(
      `/api/threads/${encodeURIComponent(id)}/goal`,
      { method: 'DELETE' },
    )
  }
  async getLoop(id: string) {
    const result = await this.request<{ loop: unknown; active: boolean }>(
      `/api/threads/${encodeURIComponent(id)}/loop`,
    )
    return { loop: parseLoop(result.loop), active: result.active === true }
  }
  /** `prompt` may carry interval syntax (`5m …`, `… every hour`). */
  async setLoop(
    id: string,
    prompt: string,
    options: { intervalMs?: number; model?: string } = {},
  ) {
    if (!prompt.trim()) throw new Error('Enter a loop prompt')
    const result = await this.request<{ loop: unknown; interval?: string }>(
      `/api/threads/${encodeURIComponent(id)}/loop`,
      { method: 'PUT', body: { prompt: prompt.trim(), ...options } },
    )
    return {
      loop: parseLoop(result.loop),
      interval: typeof result.interval === 'string' ? result.interval : '',
    }
  }
  /** Stops the loop; the desktop keeps the record with `stoppedAt`. */
  async stopLoop(id: string) {
    const result = await this.request<{ stopped: string | null }>(
      `/api/threads/${encodeURIComponent(id)}/loop`,
      { method: 'DELETE' },
    )
    return {
      stopped: typeof result.stopped === 'string' ? result.stopped : null,
    }
  }
  getMessages(id: string) {
    return this.request<MessageRow[]>(
      `/api/threads/${encodeURIComponent(id)}/messages`,
    )
  }
  searchThreads(query: string) {
    return this.request<Thread[]>(
      `/api/search/threads?q=${encodeURIComponent(query)}`,
    )
  }
  createThread(title = 'New Chat', workspaceId?: string) {
    return this.request<Thread>('/api/threads', {
      method: 'POST',
      body: { title, ...(workspaceId ? { workspaceId } : {}) },
    })
  }
  updateThread(
    id: string,
    updates: Partial<
      Pick<
        Thread,
        | 'title'
        | 'model'
        | 'reasoningEffort'
        | 'fastMode'
        | 'workspaceId'
        | 'metadata'
        | 'isFavorited'
        | 'isFavoritePinned'
        | 'favoritePinnedOrder'
      >
    > & {
      /** Control flag: Desktop keeps the thread's updatedAt unchanged. */
      skipUpdatedAt?: boolean
    },
  ) {
    return this.request<Thread>(`/api/threads/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates,
    })
  }
  renameThread(id: string, title: string) {
    return this.updateThread(id, { title })
  }
  deleteThread(id: string) {
    return this.request<unknown>(`/api/threads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }
  async getAgentCrew(threadId: string): Promise<AgentCrew> {
    return parseAgentCrew(
      await this.request<unknown>(
        `/api/threads/${encodeURIComponent(threadId)}/agent-crew`,
      ),
    )
  }
  /** In-flight sub-agent transcripts; older desktops lack the route. */
  async getLiveSubagents(threadId: string): Promise<LiveSubagentSnapshot[]> {
    try {
      const snapshots = await this.request<unknown>(
        `/api/threads/${encodeURIComponent(threadId)}/subagents/live`,
      )
      return Array.isArray(snapshots) ? snapshots : []
    } catch (error) {
      if (isUnsupportedEndpoint(error)) return []
      throw error
    }
  }
  getThreadFileWrites(threadId: string) {
    return this.request<{ fileWrites: ThreadFileWrite[] }>(
      `/api/threads/${encodeURIComponent(threadId)}/file-writes`,
    )
  }
  getDiffStats(threadId: string) {
    return this.request<{
      additions?: number
      deletions?: number
      filesChanged?: number
    }>(`/api/threads/${encodeURIComponent(threadId)}/diff-stats`)
  }
  /** Desktop requires the model to size the context window. */
  getContextUsage(threadId: string, model: string) {
    return this.request<ThreadContextUsage>(
      `/api/threads/${encodeURIComponent(threadId)}/context-usage?model=${encodeURIComponent(model)}`,
    )
  }
  /**
   * Summarizes older messages on Desktop. The handler reads only an
   * optional `model` from the body and falls back to the thread's model.
   */
  compactThread(threadId: string, model?: string) {
    return this.request<CompactResult>(
      `/api/threads/${encodeURIComponent(threadId)}/compact`,
      { method: 'POST', body: model ? { model } : {} },
    )
  }
  switchMessageVersion(messageId: string, direction: 'prev' | 'next') {
    return this.request<{ activePath: string[] }>(
      `/api/messages/${encodeURIComponent(messageId)}/switch-version`,
      { method: 'POST', body: { direction } },
    )
  }
  private assertRelayUploadSize(bytes: Uint8Array, filename: string) {
    if (bytes.byteLength > MAX_RELAY_UPLOAD_BYTES) {
      throw new Error(
        `${filename} is too large for the mobile relay. Uploads must fit in a single encrypted frame, so the mobile limit is 6 MB.`,
      )
    }
  }
  uploadImage(bytes: Uint8Array, mediaType: string) {
    this.assertRelayUploadSize(bytes, 'Image')
    return this.request<{
      url: string
      filename: string
      mediaType: string
      width?: number
      height?: number
      filePath: string
    }>('/api/attachments/image', {
      method: 'POST',
      headers: { 'content-type': mediaType || 'image/jpeg' },
      rawBody: bytes,
    })
  }
  uploadFile(bytes: Uint8Array, filename: string, mediaType: string) {
    this.assertRelayUploadSize(bytes, filename)
    return this.request<{ filePath: string; filename: string; size: number }>(
      '/api/attachments/file',
      {
        method: 'POST',
        headers: {
          'content-type': mediaType || 'application/octet-stream',
          'x-alma-filename': encodeURIComponent(filename),
        },
        rawBody: bytes,
      },
    )
  }
  listApprovals() {
    return this.request<ApprovalRequest[]>('/api/handoff/tool-approvals')
  }
  respondApproval(
    requestId: string,
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_with_reason',
    reason?: string,
  ) {
    return this.request<{ ok: boolean }>('/api/handoff/tool-approvals', {
      method: 'POST',
      body: { requestId, response: { action, ...(reason ? { reason } : {}) } },
    })
  }
  listQuestions() {
    return this.request<QuestionRequest[]>('/api/handoff/user-questions')
  }
  respondQuestion(
    requestId: string,
    action: 'accept' | 'decline' | 'cancel',
    answers: Array<{ selected: string[]; custom?: string }> = [],
  ) {
    return this.request<{ ok: boolean }>('/api/handoff/user-questions', {
      method: 'POST',
      body: { requestId, response: { action, answers } },
    })
  }
  openJsonSocket(
    path: string,
    onEvent: (event: RealtimeEvent) => void,
  ): TunnelSocket {
    assertSafePath(path, 'WS')
    const socket = this.tunnel.openWebSocket(path)
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        try {
          onEvent(JSON.parse(message))
        } catch {
          /* ignore malformed server message */
        }
      }
    })
    return socket
  }
  threadsSocket(onEvent: (event: RealtimeEvent) => void) {
    return new ThreadsSocket(this.openJsonSocket('/ws/threads', onEvent))
  }
}

export interface GenerationOptions {
  model?: string
  reasoningEffort?: ReasoningEffort | 'off'
  fastMode?: boolean | null
}

export class ThreadsSocket {
  constructor(private socket: TunnelSocket) {}
  get opened() {
    return this.socket.opened
  }
  private send(type: string, data: unknown) {
    this.socket.send(JSON.stringify({ type, data }))
  }
  generateResponse(
    threadId: string,
    textOrParts: string | MessagePart[],
    options: GenerationOptions = {},
    messageId: string = crypto.randomUUID(),
  ) {
    const parts =
      typeof textOrParts === 'string'
        ? [{ type: 'text', text: textOrParts }]
        : textOrParts
    this.send('generate_response', {
      threadId,
      userMessage: {
        id: messageId,
        role: 'user',
        parts,
      },
      ...options,
      source: 'mobile',
    })
    return messageId
  }
  retryResponse(
    threadId: string,
    assistantMessageId: string,
    options: GenerationOptions = {},
  ) {
    this.send('generate_response', {
      threadId,
      userMessage: null,
      retryOfMessageId: assistantMessageId,
      ...options,
      source: 'mobile',
    })
  }
  replaceMessage(
    threadId: string,
    userMessageId: string,
    parts: MessagePart[],
    options: GenerationOptions = {},
    messageId: string = crypto.randomUUID(),
  ) {
    this.send('generate_response', {
      threadId,
      userMessage: {
        id: messageId,
        role: 'user',
        parts,
      },
      replaceMessageId: userMessageId,
      ...options,
      source: 'mobile',
    })
    return messageId
  }
  steerGeneration(
    threadId: string,
    textOrParts: string | MessagePart[],
    options: GenerationOptions = {},
    messageId: string = crypto.randomUUID(),
  ) {
    const parts =
      typeof textOrParts === 'string'
        ? [{ type: 'text', text: textOrParts }]
        : textOrParts
    this.send('steer_generation', {
      threadId,
      userMessage: {
        id: messageId,
        role: 'user',
        parts,
      },
      ...options,
    })
    return messageId
  }
  stopGeneration(threadId: string) {
    this.send('stop_generation', { threadId })
  }
  close() {
    this.socket.close()
  }
}

/**
 * Top-level rows of a thread. `depth` is an ordinal, so the only reliable
 * marker for a nested sub-agent row is `parentToolCallId`.
 */
export function rootRows(rows: MessageRow[]): MessageRow[] {
  return rows.filter((row) => !row.parentToolCallId)
}
