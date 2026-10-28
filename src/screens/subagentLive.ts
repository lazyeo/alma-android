import type { MessagePart, MessageRow, RealtimeEvent } from '../relay'
import { DeltaAccumulator } from './threadDeltas'
import { isTool } from './streamingPresentation'
import { toolInputSummary } from './toolSummary'
import { t } from '../i18n/runtime'

// Live sub-agent transcripts, ported from Desktop's renderer
// SubagentAccumulator. Desktop streams a Task's inner agent as
// `subagent_message_added|delta|completed` keyed by `context.subagentMessageId`
// (`subagent-<taskId>-<startedAtMs>`); the persisted DB row lags ~1s behind.

export interface SubagentContext {
  taskId?: string
  threadId: string
  parentMessageId?: string
  parentToolCallId: string
  subagentMessageId: string
}

type SubagentMessage = { id?: string; role?: string; parts?: MessagePart[] }

/** One entry of GET /api/threads/:id/subagents/live. */
export interface LiveSubagentSnapshot {
  context: SubagentContext
  lastSeq?: number
  message: SubagentMessage
}

type ThreadEvent = Pick<RealtimeEvent, 'type' | 'data'>

const SUBAGENT_EVENTS = new Set([
  'subagent_message_added',
  'subagent_message_delta',
  'subagent_message_completed',
])

const SUBAGENT_MESSAGE_ID = /^subagent-.+-\d+$/

function readContext(value: unknown): SubagentContext | undefined {
  if (!value || typeof value !== 'object') return undefined
  const context = value as Record<string, unknown>
  return typeof context.threadId === 'string' &&
    typeof context.parentToolCallId === 'string' &&
    typeof context.subagentMessageId === 'string'
    ? (context as unknown as SubagentContext)
    : undefined
}

/** The thread id of a sub-agent frame is `data.context.threadId`. */
export function subagentEventContext(threadId: string, event: ThreadEvent) {
  if (!SUBAGENT_EVENTS.has(event.type)) return undefined
  const context = readContext(event.data?.context)
  return context?.threadId === threadId ? context : undefined
}

/**
 * Desktop also emits ordinary `message_delta` frames for a sub-agent's DB
 * row. They never match a top-level row, so without this check every frame
 * would look like a stale base and schedule a full-thread resync.
 */
export function isSubagentMessageId(
  threadId: string,
  messageId: unknown,
  known: ReadonlySet<string>,
) {
  if (typeof messageId !== 'string') return false
  const prefix = `${threadId}--`
  const id = messageId.startsWith(prefix)
    ? messageId.slice(prefix.length)
    : messageId
  return SUBAGENT_MESSAGE_ID.test(id) || known.has(id) || known.has(messageId)
}

function toRow(context: SubagentContext, message: SubagentMessage): MessageRow {
  return {
    id: context.subagentMessageId,
    threadId: context.threadId,
    parentToolCallId: context.parentToolCallId,
    // Desktop sends an empty message id; the run id keys it everywhere.
    message: {
      id: context.subagentMessageId,
      role: message.role ?? 'assistant',
      parts: Array.isArray(message.parts) ? message.parts : [],
    },
    metadata: { subagentTaskId: context.taskId },
  }
}

type Delta = { seq?: unknown }

export class SubagentRuns {
  private list: MessageRow[] = []
  private idSet = new Set<string>()
  private streaming = new Set<string>()
  // Deltas for a run we have no base for yet (thread opened mid-run).
  private parked = new Map<string, Delta[]>()
  private accumulator = new DeltaAccumulator()

  get rows(): readonly MessageRow[] {
    return this.list
  }

  /** Checked on every top-level `message_delta`, so it is kept, not built. */
  get ids(): ReadonlySet<string> {
    return this.idSet
  }

  isStreaming(id: string) {
    return this.streaming.has(id)
  }

  private upsert(row: MessageRow) {
    const index = this.list.findIndex((current) => current.id === row.id)
    this.idSet.add(row.id)
    this.list =
      index < 0
        ? [...this.list, row]
        : this.list.map((current, at) => (at === index ? row : current))
  }

  private applyDeltas(id: string, deltas: Delta[]) {
    const result = this.accumulator.apply(this.list, { messageId: id, deltas })
    this.list = result.rows
    return result.needsResync
  }

  /** Returns whether rows changed and whether a live snapshot is needed. */
  apply(event: ThreadEvent): { changed: boolean; needsSnapshot: boolean } {
    const context = readContext(event.data?.context)
    if (!context) return { changed: false, needsSnapshot: false }
    const id = context.subagentMessageId
    const known = this.idSet.has(id)
    const deltas: Delta[] = Array.isArray(event.data?.deltas)
      ? event.data.deltas
      : []

    if (event.type === 'subagent_message_added') {
      this.upsert(toRow(context, event.data?.message ?? {}))
      this.accumulator.seed(id, 0)
      this.streaming.add(id)
      this.parked.delete(id)
      return { changed: true, needsSnapshot: false }
    }
    if (event.type === 'subagent_message_delta') {
      if (!known) {
        this.parked.set(id, [...(this.parked.get(id) ?? []), ...deltas])
        return { changed: false, needsSnapshot: true }
      }
      const before = this.list
      // A stale base is repaired from the live snapshot, never a full reload.
      const stale = this.applyDeltas(id, deltas)
      return { changed: this.list !== before, needsSnapshot: stale }
    }
    if (event.type === 'subagent_message_completed') {
      this.streaming.delete(id)
      this.parked.delete(id)
      const final = event.data?.finalMessage as SubagentMessage | undefined
      if (Array.isArray(final?.parts) && final.parts.length) {
        this.upsert(toRow(context, final))
        return { changed: true, needsSnapshot: false }
      }
      // Re-render so the card drops its running presentation.
      return { changed: known, needsSnapshot: false }
    }
    return { changed: false, needsSnapshot: false }
  }

  /**
   * Merges GET /subagents/live. A snapshot already contains every delta
   * through `lastSeq`; a streamed copy that is at least as far along wins.
   */
  applySnapshots(snapshots: readonly LiveSubagentSnapshot[]) {
    let changed = false
    for (const snapshot of snapshots) {
      const context = readContext(snapshot?.context)
      if (!context) continue
      const id = context.subagentMessageId
      const lastSeq =
        typeof snapshot.lastSeq === 'number' ? snapshot.lastSeq : 0
      const known = this.idSet.has(id)
      if (known && this.accumulator.lastSeq(id) >= lastSeq) continue
      this.upsert(toRow(context, snapshot.message ?? {}))
      this.accumulator.seed(id, lastSeq)
      this.streaming.add(id)
      const parked = this.parked.get(id)
      this.parked.delete(id)
      if (parked?.length) this.applyDeltas(id, parked)
      changed = true
    }
    return changed
  }
}

/**
 * Sub-agent rows grouped by the tool call that spawned them. A live run
 * replaces its lagging DB row; unchanged groups keep their previous array so
 * memoized tool cards skip re-rendering on unrelated deltas.
 */
export function nestedRowsByParent(
  rows: readonly MessageRow[],
  live: readonly MessageRow[],
  previous?: ReadonlyMap<string, MessageRow[]>,
) {
  const liveIds = new Set(live.map((row) => row.message.id))
  const groups = new Map<string, MessageRow[]>()
  const add = (row: MessageRow) => {
    if (!row.parentToolCallId) return
    const group = groups.get(row.parentToolCallId) ?? []
    group.push(row)
    groups.set(row.parentToolCallId, group)
  }
  for (const row of rows) if (!liveIds.has(row.message.id)) add(row)
  for (const row of live) add(row)
  if (!previous) return groups
  for (const [parent, group] of groups) {
    const prior = previous.get(parent)
    if (
      prior &&
      prior.length === group.length &&
      prior.every((row, index) => row === group[index])
    )
      groups.set(parent, prior)
  }
  return groups
}

export function partToolName(part: MessagePart) {
  return typeof part.toolName === 'string'
    ? part.toolName
    : part.type.replace(/^tool-/, '')
}

/** One-line "what is the sub-agent doing now" for a running Task card. */
export function latestSubagentActivity(rows: readonly MessageRow[]) {
  for (let index = rows.length - 1; index >= 0; index--) {
    const parts = rows[index].message.parts.filter(
      (part) => part.type !== 'step-start',
    )
    const part = parts.at(-1)
    if (!part) continue
    if (isTool(part)) {
      const name = partToolName(part)
      return `${name} ${toolInputSummary(name, part).text}`
    }
    if (part.type === 'reasoning') return t('message.reasoning.thinking')
    const line = (part.text ?? '')
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
      .at(-1)
    if (line) return line
  }
  return undefined
}
