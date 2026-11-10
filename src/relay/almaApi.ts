import {
  agentTabName,
  desktopDefaultAgent,
  type CoderAgentProvider,
  type HerdrAgentKind,
} from '../herdr/manage'
import { parseHerdrSetup, type HerdrSetupState } from '../herdr/setup'
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
import { iabSocketPath } from '../screens/iab/protocol'
import {
  parseAlmaVitals,
  parsePersonalAgent,
  type AlmaVitalsResult,
  type PersonalAgentResult,
} from '../screens/personalAgent'
import type { LiveSubagentSnapshot } from '../screens/subagentLive'
import type { RelayTunnel, TunnelSocket } from './tunnel'
import {
  herdrComputerIdPattern,
  parseHerdrComputers,
  type HerdrComputersResult,
} from '../herdr/computers'

export const MAX_RELAY_UPLOAD_BYTES = 6 * 1024 * 1024

function basename(value: string) {
  return value.replace(/\\/g, '/').split('/').pop() || 'attachment'
}

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
  remoteHostId?: string | null
  createdAt?: string | number
  updatedAt?: string | number
  [key: string]: unknown
}

export interface ProjectCardResumeLink {
  uri: string
  label: string
}

export interface ProjectCardProposal {
  brief?: string
  focus?: string
  resume?: ProjectCardResumeLink[]
  reason: string
  proposedAt: string
  source?: string
}

export interface ProjectCard {
  brief: string
  focus: string
  resume: ProjectCardResumeLink[]
  updatedAt?: string
  confirmedAt?: string
  proposal?: ProjectCardProposal
}

export interface ProjectCardResponse {
  card: ProjectCard | null
  config: unknown | null
}

export interface ProjectCardConsultMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: string
  model?: string
}

export interface ProjectCardConsultTranscript {
  version: 1
  messages: ProjectCardConsultMessage[]
  summary?: {
    text: string
    throughId: string
    count: number
    at: string
  }
}

export interface ProjectCardConsultResponse {
  transcript: ProjectCardConsultTranscript
  file?: string
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
export type { MessagePart } from '../screens/messageParts'
import type { MessagePart } from '../screens/messageParts'
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
  [key: string]: any
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
  /^\/api\/data\/(?:import|export)(?:\/|$)/,
  /^\/api\/threads\/batch-delete(?:\/|$)/,
  /^\/ws\/terminal(?:\/|$)/,
  // The desktop's own WebRTC helper for the in-app browser, not for clients.
  /^\/ws\/iab-rtc-bridge(?:\/|$)/,
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
  const terminalAllowed = clean === '/api/terminal/exec' && verb === 'POST'
  // Computer Use drives the Mac; only its read-only status (platform and
  // helper presence) is reachable, to label desktops and gate the screen.
  const computerUseAllowed =
    clean === '/api/computer-use/status' && verb === 'GET'
  // `/api/iab/*` is the agent's browser toolset (eval, raw CDP, fetch with
  // the page's cookies); the phone drives the browser only through
  // `/ws/iab/<threadId>`, so just the read-only target list is reachable.
  const iabAllowed = clean === '/api/iab/status' && verb === 'GET'
  if (
    (/^\/api\/activity-recorder(?:\/|$)/.test(clean) &&
      !(verb === 'GET' && clean === '/api/activity-recorder/suggestions')) ||
    (/^\/api\/refs(?:\/|$)/.test(clean) && !refsAllowed) ||
    (/^\/api\/crystal(?:\/|$)/.test(clean) && !crystalAllowed) ||
    (loopRoute && !loopAllowed) ||
    (/^\/api\/terminal(?:\/|$)/.test(clean) && !terminalAllowed) ||
    (/^\/api\/computer-use(?:\/|$)/.test(clean) && !computerUseAllowed) ||
    (/^\/api\/iab(?:\/|$)/.test(clean) && !iabAllowed) ||
    (/^\/ws\/iab(?:\/|$)/.test(clean) && !/^\/ws\/iab\/[^/]+$/.test(clean)) ||
    (/^\/api\/gallery\/cache(?:\/|$)/.test(clean) && verb !== 'GET') ||
    denied.some((pattern) => pattern.test(clean)) ||
    (/^\/api\/settings$/.test(clean) && verb !== 'GET') ||
    (/^\/api\/providers(?:\/|$)/.test(clean) && !['GET', 'HEAD'].includes(verb))
  )
    throw new Error(`Blocked dangerous Alma path: ${clean}`)
}

export class HerdrUploadUnsupportedError extends Error {
  constructor() {
    super('Update Alma on that computer to send files')
    this.name = 'HerdrUploadUnsupportedError'
  }
}

export class AlmaHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Raw response text, for routes that explain failures in JSON. */
    public body?: string,
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

/** `GET /api/computer-use/status` (desktop 0.4.246, verified). */
export interface ComputerUseStatus {
  available?: boolean
  platform?: string
}

export interface DesktopHealth {
  name?: string
  status?: string
  timestamp?: string | number
}

export interface HerdrCommandsResponse {
  commands: Array<{
    name?: unknown
    description?: unknown
    hint?: unknown
    source?: unknown
    [key: string]: unknown
  }>
}

export interface HerdrSubagentPage {
  items?: Array<Record<string, unknown>>
  start?: number
  end?: number
  [key: string]: unknown
}

export type HerdrSubagentResponse =
  | {
      status: 'ok'
      agent: { type?: string; description?: string; finished: boolean }
      page: HerdrSubagentPage
    }
  | {
      status: 'error'
      error: {
        code: 'pane_not_found' | 'subagent_not_found' | 'read_failed' | string
        message: string
      }
    }
  | { status: 'unsupported' }

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
  private herdrComputerApis = new Map<string, AlmaApi>()
  /**
   * @param herdrComputer another computer the desktop reaches for Herdr;
   * when set, every Herdr route goes through `/api/herdr/computers/<id>/`.
   */
  constructor(
    public tunnel: Pick<RelayTunnel, 'fetch' | 'openWebSocket'>,
    readonly herdrComputer?: string,
  ) {
    if (
      herdrComputer !== undefined &&
      !herdrComputerIdPattern.test(herdrComputer)
    )
      throw new Error('Invalid Herdr computer id')
  }
  /**
   * The same desktop with Herdr pointed at `computerId` (undefined: the
   * desktop itself). Instances are reused so React effects and the image
   * cache see a stable API per computer.
   */
  forHerdrComputer(computerId?: string): AlmaApi {
    if (computerId === this.herdrComputer) return this
    if (this.herdrComputer !== undefined)
      throw new Error('Pick a Herdr computer from the desktop API')
    if (computerId === undefined) return this
    let api = this.herdrComputerApis.get(computerId)
    if (!api) {
      api = new AlmaApi(this.tunnel, computerId)
      this.herdrComputerApis.set(computerId, api)
    }
    return api
  }
  private herdrPath(rest: string) {
    return this.herdrComputer === undefined
      ? `/api/herdr/${rest}`
      : `/api/herdr/computers/${this.herdrComputer}/${rest}`
  }
  private async request<T>(
    path: string,
    init: {
      method?: string
      body?: unknown
      rawBody?: Uint8Array
      headers?: Record<string, string>
      timeoutMs?: number
    } = {},
  ): Promise<T> {
    const method = init.method ?? 'GET'
    assertSafePath(path, method)
    const controller = init.timeoutMs ? new AbortController() : undefined
    const timeout = controller
      ? setTimeout(() => controller.abort(), init.timeoutMs)
      : undefined
    const response = await this.tunnel
      .fetch(path, {
        method,
        headers:
          init.headers ??
          (init.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        body:
          init.rawBody ??
          (init.body === undefined ? undefined : JSON.stringify(init.body)),
        ...(controller ? { signal: controller.signal } : {}),
      })
      .finally(() => {
        if (timeout) clearTimeout(timeout)
      })
    if (response.status < 200 || response.status >= 300) {
      const body = await response.text()
      throw new AlmaHttpError(
        `${method} ${path} failed (${response.status}): ${body.slice(0, 300)}`,
        response.status,
        body,
      )
    }
    if (response.status === 204) return undefined as T
    return response.json<T>()
  }
  async getImage(value: string): Promise<Blob> {
    // A remote computer's transcript names images on that computer.
    const path =
      this.herdrComputer !== undefined && value.startsWith('/api/herdr/')
        ? this.herdrPath(value.slice('/api/herdr/'.length))
        : value
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
  getComputerUseStatus() {
    return this.request<ComputerUseStatus>('/api/computer-use/status')
  }
  /**
   * `GET /api/iab/status`: the desktop's open in-app browsers (0.4.467,
   * verified). A desktop without the in-app browser answers 404.
   */
  async getIabStatus(): Promise<
    { supported: false } | { supported: true; status: unknown }
  > {
    try {
      return {
        supported: true,
        status: await this.request<unknown>('/api/iab/status'),
      }
    } catch (error) {
      if (error instanceof AlmaHttpError && error.status === 404)
        return { supported: false }
      throw error
    }
  }
  /** The live in-app browser of one thread; see screens/iab/protocol.ts. */
  openIabSocket(threadId: string): TunnelSocket {
    const path = iabSocketPath(threadId)
    assertSafePath(path, 'WS')
    return this.tunnel.openWebSocket(path)
  }
  getHealth() {
    return this.request<DesktopHealth>('/api/health')
  }
  getSettings() {
    return this.request<AlmaSettings>('/api/settings')
  }
  async getSiteIcon(url: string): Promise<string | null> {
    try {
      const result = await this.request<{ dataUrl?: unknown }>(
        `/api/system/site-icon?url=${encodeURIComponent(url)}`,
      )
      return typeof result.dataUrl === 'string' ? result.dataUrl : null
    } catch {
      return null
    }
  }
  listWorkspaces() {
    return this.request<Workspace[]>('/api/workspaces')
  }
  getProjectCard(workspaceId: string) {
    return this.request<ProjectCardResponse>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card`,
    )
  }
  saveProjectCard(
    workspaceId: string,
    card: Pick<ProjectCard, 'brief' | 'focus' | 'resume'>,
  ) {
    return this.request<{ card: ProjectCard }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card`,
      { method: 'PUT', body: card },
    )
  }
  resolveProjectCardProposal(workspaceId: string, accept: boolean) {
    return this.request<{ card: ProjectCard }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card/resolve-proposal`,
      { method: 'POST', body: { accept } },
    )
  }
  draftProjectCard(
    workspaceId: string,
    options: { hint?: string; fromConsult?: boolean } = {},
  ) {
    return this.request<{ card: ProjectCard }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card/draft`,
      { method: 'POST', body: options, timeoutMs: 130_000 },
    )
  }
  getProjectCardConsult(workspaceId: string) {
    return this.request<ProjectCardConsultResponse>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card/consult`,
      { timeoutMs: 75_000 },
    )
  }
  askProjectCardConsult(workspaceId: string, question: string) {
    return this.request<
      ProjectCardConsultResponse & { answer: ProjectCardConsultMessage }
    >(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card/consult`,
      {
        method: 'POST',
        body: { question },
        timeoutMs: 75_000,
      },
    )
  }
  clearProjectCardConsult(workspaceId: string) {
    return this.request<ProjectCardConsultResponse>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/project-card/consult`,
      { method: 'DELETE', timeoutMs: 75_000 },
    )
  }
  wakeDisplay(workspaceId: string) {
    return this.request<unknown>('/api/terminal/exec', {
      method: 'POST',
      body: { command: 'caffeinate -u -t 2', workspaceId },
    })
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
  createThread(
    title = 'New Chat',
    workspaceId?: string,
    options: Pick<Thread, 'model' | 'reasoningEffort'> = {},
  ) {
    return this.request<Thread>('/api/threads', {
      method: 'POST',
      body: {
        title,
        ...(workspaceId ? { workspaceId } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.reasoningEffort
          ? { reasoningEffort: options.reasoningEffort }
          : {}),
      },
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
  /**
   * Adds or removes the user's emoji on a message (desktop 0.4.434+); returns
   * the updated row, which the desktop also broadcasts as `message_updated`.
   */
  setMessageReaction(messageId: string, emoji: string, op: 'add' | 'remove') {
    return this.request<MessageRow>(
      `/api/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: 'POST', body: { emoji, op } },
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
  private async requestHerdrUpload(
    path: string,
    bytes: Uint8Array,
    mediaType: string,
  ) {
    try {
      return await this.request<{ path?: string; received?: number }>(path, {
        method: 'POST',
        headers: { 'content-type': mediaType || 'application/octet-stream' },
        rawBody: bytes,
      })
    } catch (error) {
      if (error instanceof AlmaHttpError && error.status === 415)
        throw new HerdrUploadUnsupportedError()
      throw error
    }
  }
  /** The computers proxy drops raw bodies, so a remote upload would be empty. */
  get herdrUploadsSupported() {
    return this.herdrComputer === undefined
  }
  private assertHerdrUploadSupported() {
    // Guard only: the composer hides attachments for a remote computer.
    if (!this.herdrUploadsSupported)
      throw new Error("Files can't be sent to another computer yet")
  }
  async herdrUpload(bytes: Uint8Array, mediaType: string, name: string) {
    this.assertHerdrUploadSupported()
    this.assertRelayUploadSize(bytes, name)
    const query = new URLSearchParams({ name: basename(name) })
    return this.requestHerdrUpload(
      this.herdrPath(`upload?${query}`),
      bytes,
      mediaType,
    ).then((result) => {
      if (!result.path) throw new Error('Herdr upload did not return a path')
      return { path: result.path }
    })
  }
  async herdrUploadChunked(
    bytes: Uint8Array,
    mediaType: string,
    name: string,
    options: { uploadId?: string; chunkBytes?: number } = {},
  ) {
    this.assertHerdrUploadSupported()
    const uploadId = options.uploadId ?? crypto.randomUUID()
    if (!/^[A-Za-z0-9-]{8,64}$/.test(uploadId))
      throw new Error('Invalid Herdr upload id')
    const chunkBytes = Math.min(
      options.chunkBytes ?? 4 * 1024 * 1024,
      MAX_RELAY_UPLOAD_BYTES,
    )
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0)
      throw new Error('Invalid Herdr chunk size')
    let result: { path?: string; received?: number } = {}
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      const end = Math.min(bytes.byteLength, offset + chunkBytes)
      const query = new URLSearchParams({
        upload: uploadId,
        name: basename(name),
        offset: String(offset),
      })
      if (end === bytes.byteLength) query.set('done', '1')
      result = await this.requestHerdrUpload(
        this.herdrPath(`upload?${query}`),
        bytes.slice(offset, end),
        mediaType,
      )
    }
    if (!result.path) throw new Error('Herdr upload did not return a path')
    return { path: result.path }
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
  getHerdrInfo() {
    return this.request<{
      online: boolean
      host?: string
      herdr?: {
        type: 'pong'
        version?: string
        protocol?: number
        capabilities?: Record<string, unknown>
      }
      herdr_error?: string
    }>(this.herdrPath('info'))
  }
  /** Other computers this desktop reaches for Herdr (0.4.567). */
  async listHerdrComputers(): Promise<HerdrComputersResult> {
    try {
      return {
        status: 'ok',
        computers: parseHerdrComputers(
          await this.request<unknown>('/api/herdr/computers'),
        ),
      }
    } catch (error) {
      if (isUnsupportedEndpoint(error)) return { status: 'unsupported' }
      if (error instanceof AlmaHttpError && error.status === 503)
        return { status: 'unavailable' }
      throw error
    }
  }
  /** Reduced snapshot; the only one a remote computer serves over HTTP. */
  getHerdrWorkspaces() {
    return this.request<unknown>(this.herdrPath('workspaces'))
  }
  async getHerdrSetup(): Promise<HerdrSetupState | undefined> {
    try {
      return parseHerdrSetup(
        await this.request<unknown>(this.herdrPath('setup')),
      )
    } catch (error) {
      if (isUnsupportedEndpoint(error)) return undefined
      throw error
    }
  }
  /**
   * Install or start Herdr Core. The desktop answers once Herdr is online
   * (200) or the attempt failed (502, with the setup state explaining why);
   * an install can take minutes, and through another computer the desktop
   * gives up waiting after 60 s (504) while the install carries on.
   */
  async runHerdrSetup(
    action: 'install' | 'start',
  ): Promise<
    | { status: 'done'; setup?: HerdrSetupState }
    | { status: 'failed'; setup?: HerdrSetupState }
    | { status: 'pending' }
    | { status: 'unsupported' }
  > {
    try {
      const setup = parseHerdrSetup(
        await this.request<unknown>(this.herdrPath(`setup/${action}`), {
          method: 'POST',
          body: {},
        }),
      )
      return { status: 'done', setup }
    } catch (error) {
      if (!(error instanceof AlmaHttpError)) throw error
      if (error.status === 502) {
        let setup: HerdrSetupState | undefined
        try {
          setup = parseHerdrSetup(JSON.parse(error.body ?? ''))
        } catch {
          setup = undefined
        }
        return { status: 'failed', setup }
      }
      if (error.status === 504) return { status: 'pending' }
      if (error.status === 400 || isUnsupportedEndpoint(error))
        return { status: 'unsupported' }
      throw error
    }
  }
  /**
   * The desktop's coding agent for new Herdr conversations, or undefined
   * when it can't be read (callers then keep their own default). Settings
   * live on the paired desktop only; another computer's aren't reachable.
   */
  async getDefaultHerdrAgent(): Promise<HerdrAgentKind | undefined> {
    if (this.herdrComputer !== undefined) return undefined
    try {
      const [settings, providers] = await Promise.all([
        this.getSettings(),
        this.request<unknown>('/api/providers'),
      ])
      return desktopDefaultAgent(
        settings?.chat?.coderAgentProviderId,
        Array.isArray(providers)
          ? providers.filter(
              (item): item is CoderAgentProvider =>
                Boolean(item) &&
                typeof item === 'object' &&
                typeof (item as { id?: unknown }).id === 'string',
            )
          : [],
      )
    } catch {
      return undefined
    }
  }
  getHerdrMutes() {
    return this.request<{ workspaces: string[] }>(this.herdrPath('mutes'))
  }
  setHerdrWorkspaceMuted(workspace: string, muted: boolean) {
    return this.request<{ workspaces: string[] }>(this.herdrPath('mutes'), {
      method: 'PUT',
      body: { workspace, muted },
    })
  }
  herdrRpc<T>(method: string, params: Record<string, unknown>) {
    return this.request<{
      result?: T
      error?: { code: string; message: string }
    }>(this.herdrPath('rpc'), {
      method: 'POST',
      body: { method, params },
    }).then((response) => {
      if (response.error) {
        const error = new Error(response.error.message) as Error & {
          code?: string
        }
        error.code = response.error.code
        throw error
      }
      return response.result as T
    })
  }
  herdrRenameTab(tabId: string, label: string) {
    return this.herdrRpc('tab.rename', { tab_id: tabId, label })
  }
  herdrRenameWorkspace(workspaceId: string, label: string) {
    return this.herdrRpc('workspace.rename', {
      workspace_id: workspaceId,
      label,
    })
  }
  herdrCloseTab(tabId: string) {
    return this.herdrRpc('tab.close', { tab_id: tabId })
  }
  herdrCloseWorkspace(workspaceId: string) {
    return this.herdrRpc('workspace.close', { workspace_id: workspaceId })
  }
  herdrCreateTab(workspaceId: string, cwd?: string) {
    return this.herdrRpc<unknown>('tab.create', {
      workspace_id: workspaceId,
      focus: false,
      ...(cwd ? { cwd } : {}),
    })
  }
  herdrCreateWorkspace(label?: string, cwd?: string) {
    return this.herdrRpc<unknown>('workspace.create', {
      focus: false,
      ...(label ? { label } : {}),
      ...(cwd ? { cwd } : {}),
    })
  }
  async herdrStartAgent(
    kind: HerdrAgentKind,
    paneId: string,
    random: () => number = Math.random,
  ) {
    const params = {
      name: agentTabName(kind, random),
      kind,
      pane_id: paneId,
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.herdrRpc('agent.start', params)
      } catch (error) {
        if (
          attempt === 4 ||
          !/not an available shell/i.test(
            error instanceof Error ? error.message : String(error),
          )
        )
          throw error
        await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
    }
  }
  promptHerdrAgent(paneId: string, text: string) {
    return this.herdrRpc('agent.prompt', { target: paneId, text })
  }
  sendHerdrPaneKeys(paneId: string, keys: string[]) {
    return this.herdrRpc('pane.send_keys', { pane_id: paneId, keys })
  }
  sendHerdrPaneText(paneId: string, text: string) {
    return this.herdrRpc('pane.send_text', { pane_id: paneId, text })
  }
  chooseHerdrMenuOption(
    paneId: string,
    selectedIndex: number | undefined,
    optionNumber: number,
  ) {
    if (selectedIndex === undefined)
      return this.sendHerdrPaneKeys(paneId, [String(optionNumber)])
    const targetIndex = Math.max(0, optionNumber - 1)
    const delta = targetIndex - selectedIndex
    const direction = delta < 0 ? 'up' : 'down'
    return this.sendHerdrPaneKeys(paneId, [
      ...Array.from({ length: Math.abs(delta) }, () => direction),
      'enter',
    ])
  }
  async sendHerdrBlockedText(paneId: string, text: string) {
    await this.sendHerdrPaneText(paneId, text)
    return this.sendHerdrPaneKeys(paneId, ['enter'])
  }
  readHerdrPane(
    paneId: string,
    format: 'text' | 'ansi' = 'text',
    options: {
      source?: 'visible' | 'recent' | 'recent_unwrapped'
      lines?: number
    } = {},
  ) {
    return this.herdrRpc<{ read?: { text?: string; [key: string]: unknown } }>(
      'pane.read',
      {
        pane_id: paneId,
        source: options.source ?? 'visible',
        ...(options.lines === undefined ? {} : { lines: options.lines }),
        format,
      },
    )
  }
  async getHerdrCommands(
    agent: 'claude' | 'codex' | 'pi',
    paneId: string,
  ): Promise<HerdrCommandsResponse> {
    const query = new URLSearchParams({ agent, pane: paneId })
    try {
      return await this.request<HerdrCommandsResponse>(
        this.herdrPath(`commands?${query}`),
      )
    } catch (error) {
      if (error instanceof AlmaHttpError && error.status === 404)
        return { commands: [] }
      throw error
    }
  }
  /** Personal agent overview; a 404 means the desktop predates 0.4.407. */
  async getPersonal(): Promise<PersonalAgentResult> {
    try {
      return {
        status: 'ok',
        personal: parsePersonalAgent(
          await this.request<unknown>('/api/personal'),
        ),
      }
    } catch (error) {
      if (error instanceof AlmaHttpError && error.status === 404)
        return { status: 'unsupported' }
      throw error
    }
  }
  /**
   * Makes `threadId` the personal agent's main conversation; the desktop
   * answers 404 when the thread does not exist.
   */
  setPersonalMain(threadId: string) {
    return this.request<unknown>('/api/personal/main', {
      method: 'PUT',
      body: { threadId },
    })
  }
  async getAlmaVitals(): Promise<AlmaVitalsResult> {
    try {
      return {
        status: 'ok',
        vitals: parseAlmaVitals(
          await this.request<unknown>('/api/alma/vitals'),
        ),
      }
    } catch (error) {
      if (error instanceof AlmaHttpError && error.status === 404)
        return { status: 'unsupported' }
      throw error
    }
  }
  getHerdrChat(paneId: string, before = -1, limit = 60) {
    const query = new URLSearchParams({
      pane: paneId,
      before: String(before),
      limit: String(limit),
    })
    return this.request<unknown>(this.herdrPath(`chat?${query}`))
  }
  async getHerdrSubagent(
    paneId: string,
    toolId: string,
    options: { limit?: number; before?: number } = {},
  ): Promise<HerdrSubagentResponse> {
    const query = new URLSearchParams({ pane: paneId, tool: toolId })
    if (options.limit !== undefined) query.set('limit', String(options.limit))
    if (options.before !== undefined)
      query.set('before', String(options.before))
    try {
      const response = await this.request<{
        agent?: { type?: string; description?: string; finished?: boolean }
        page?: HerdrSubagentPage
        error?: { code?: string; message?: string }
      }>(this.herdrPath(`subagent?${query}`))
      if (response.error)
        return {
          status: 'error',
          error: {
            code: response.error.code ?? 'read_failed',
            message: response.error.message ?? '',
          },
        }
      return {
        status: 'ok',
        agent: {
          ...response.agent,
          finished: response.agent?.finished === true,
        },
        page: response.page ?? {},
      }
    } catch (error) {
      if (error instanceof AlmaHttpError && error.status === 404)
        return { status: 'unsupported' }
      throw error
    }
  }
  openJsonSocket(
    path: string,
    onEvent: (event: RealtimeEvent) => void,
  ): TunnelSocket {
    assertSafePath(path, 'WS')
    // The desktop has no socket forwarding for other computers; opening the
    // plain path would silently stream the desktop's own Herdr instead.
    if (
      this.herdrComputer !== undefined &&
      /^\/ws\/herdr(?:\/|\?|$)/.test(path)
    )
      throw new Error('Herdr on another computer has no live socket')
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
  onClose(listener: () => void) {
    return this.socket.onClose(listener)
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
  /** A fresh reply from the end of the conversation, with no new message. */
  regenerateResponse(threadId: string, options: GenerationOptions = {}) {
    this.send('generate_response', {
      threadId,
      userMessage: null,
      regenerate: true,
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
