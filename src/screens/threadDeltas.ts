import type { MessagePart, MessageRow } from '../relay'

// Port of Alma Desktop's renderer DeltaAccumulator. `message_delta` frames
// address the ROW id, carry a per-message `seq`, and patch parts by index.
// The thread snapshot (GET /api/threads/:id, `message_updated`) comes from a
// DB that is written on a ~1s throttle, so it is routinely behind the stream.

export const MAX_STREAMING_OUTPUT_TAIL = 100_000

type Delta = {
  type?: unknown
  seq?: unknown
  partIndex?: unknown
  partType?: unknown
  part?: unknown
  text?: unknown
  inputKey?: unknown
  toolCallId?: unknown
  updates?: unknown
  output?: unknown
  state?: unknown
  errorText?: unknown
  stream?: unknown
}

export type MessageDeltaEvent = { messageId?: unknown; deltas?: unknown }

type StreamingOutput = { stdout: string; stderr: string }

interface RowState {
  lastSeq: number
  pending: Delta[]
}

const appendStreamTail = (base: string, chunk: string) => {
  const joined = base + chunk
  return joined.length > MAX_STREAMING_OUTPUT_TAIL
    ? joined.slice(joined.length - MAX_STREAMING_OUTPUT_TAIL)
    : joined
}

const seqOf = (delta: Delta) => (typeof delta.seq === 'number' ? delta.seq : 0)

// Output streaming and toolCallId-addressed updates are not part of the
// ordered sequence; desktop applies them whenever they arrive.
const isUnordered = (delta: Delta) => delta.type === 'tool_output_streaming'

function cloneParts(parts: MessagePart[]): MessagePart[] {
  return parts.map((part) => {
    const clone = { ...part }
    if (
      part.input &&
      typeof part.input === 'object' &&
      !Array.isArray(part.input)
    )
      clone.input = { ...(part.input as object) }
    if (part.streamingOutput && typeof part.streamingOutput === 'object')
      clone.streamingOutput = { ...(part.streamingOutput as object) }
    return clone
  })
}

function textLength(row: MessageRow) {
  return row.message.parts
    .filter((part) => part.type === 'text' || part.type === 'reasoning')
    .reduce((sum, part) => sum + (part.text ?? '').length, 0)
}

function resolveIndex(parts: MessagePart[], delta: Delta) {
  if (delta.partIndex === -1 && typeof delta.toolCallId === 'string')
    return parts.findIndex((part) => part.toolCallId === delta.toolCallId)
  return typeof delta.partIndex === 'number' ? delta.partIndex : -1
}

/**
 * Applies one delta. Touched parts are cloned on first write so untouched
 * parts keep their identity and memoized renderers skip them.
 * Returns false when the target part is missing (stale base).
 */
function applyDelta(
  parts: MessagePart[],
  delta: Delta,
  touched: Set<number>,
): boolean {
  if (delta.type === 'part_add') {
    if (!delta.part || typeof delta.part !== 'object') return false
    parts.push(cloneParts([delta.part as MessagePart])[0])
    touched.add(parts.length - 1)
    return true
  }

  const index = resolveIndex(parts, delta)
  if (!parts[index]) return false
  if (!touched.has(index)) {
    parts[index] = cloneParts([parts[index]])[0]
    touched.add(index)
  }
  const part = parts[index]
  const isTool = part.type.startsWith('tool-') || part.type === 'dynamic-tool'

  switch (delta.type) {
    case 'text_append':
      if (part.type !== 'text' && part.type !== 'reasoning') return false
      part.text = `${part.text ?? ''}${typeof delta.text === 'string' ? delta.text : ''}`
      return true
    case 'text_done':
      part.state = 'done'
      return true
    case 'part_update':
      if (delta.updates && typeof delta.updates === 'object')
        Object.assign(part, delta.updates)
      return true
    case 'tool_input_append': {
      if (!isTool || typeof delta.inputKey !== 'string') return false
      const input =
        part.input && typeof part.input === 'object'
          ? (part.input as Record<string, unknown>)
          : {}
      const current = input[delta.inputKey]
      input[delta.inputKey] =
        `${typeof current === 'string' ? current : ''}${typeof delta.text === 'string' ? delta.text : ''}`
      part.input = input
      return true
    }
    case 'tool_output_set':
      if (!isTool) return false
      part.output = delta.output
      if (typeof delta.state === 'string') part.state = delta.state
      if (delta.errorText) part.errorText = delta.errorText
      return true
    case 'tool_output_streaming': {
      if (!isTool) return false
      const stream = (delta.stream ?? {}) as Partial<StreamingOutput>
      const output = (part.streamingOutput as StreamingOutput | undefined) ?? {
        stdout: '',
        stderr: '',
      }
      if (stream.stdout)
        output.stdout = appendStreamTail(output.stdout, stream.stdout)
      if (stream.stderr)
        output.stderr = appendStreamTail(output.stderr, stream.stderr)
      part.streamingOutput = output
      return true
    }
    default:
      return false
  }
}

export class DeltaAccumulator {
  private states = new Map<string, RowState>()

  private state(rowId: string) {
    let state = this.states.get(rowId)
    if (!state) {
      state = { lastSeq: 0, pending: [] }
      this.states.set(rowId, state)
    }
    return state
  }

  /** Highest contiguous `seq` applied to a row (0 when unknown). */
  lastSeq(rowId: string) {
    return this.states.get(rowId)?.lastSeq ?? 0
  }

  /**
   * Re-bases a row on a snapshot that already includes every delta through
   * `lastSeq`, so replayed or late frames at or below it are dropped.
   */
  seed(rowId: string, lastSeq: number) {
    this.states.set(rowId, { lastSeq, pending: [] })
  }

  /**
   * Applies a `message_delta` frame. `needsResync` means the local copy could
   * not absorb every delta (unknown message or stale base); callers should
   * schedule a throttled refetch rather than reload on every frame.
   */
  apply(
    rows: MessageRow[],
    event: MessageDeltaEvent,
  ): { rows: MessageRow[]; needsResync: boolean } {
    if (typeof event.messageId !== 'string' || !Array.isArray(event.deltas))
      return { rows, needsResync: false }
    const index = rows.findIndex(
      (row) => row.id === event.messageId || row.message.id === event.messageId,
    )
    if (index < 0) return { rows, needsResync: true }

    const row = rows[index]
    const state = this.state(row.id)
    const parts = [...row.message.parts]
    const touched = new Set<number>()
    let changed = false
    let stale = false
    const run = (delta: Delta) => {
      if (applyDelta(parts, delta, touched)) changed = true
      else stale = true
    }

    const sorted = [...(event.deltas as Delta[])].sort(
      (a, b) => seqOf(a) - seqOf(b),
    )
    for (const delta of sorted) {
      if (isUnordered(delta)) {
        run(delta)
        continue
      }
      const seq = seqOf(delta)
      if (seq <= state.lastSeq) continue
      if (state.lastSeq > 0 && seq > state.lastSeq + 1) {
        state.pending.push(delta)
        continue
      }
      run(delta)
      state.lastSeq = seq
      for (;;) {
        const next = state.pending.findIndex(
          (item) => seqOf(item) === state.lastSeq + 1,
        )
        if (next < 0) break
        const [queued] = state.pending.splice(next, 1)
        run(queued)
        state.lastSeq = seqOf(queued)
      }
    }

    if (!changed) return { rows, needsResync: stale }
    const nextRows = [...rows]
    nextRows[index] = { ...row, message: { ...row.message, parts } }
    return { rows: nextRows, needsResync: stale }
  }

  /**
   * Reconciles a snapshot (full thread load or `message_updated`) with the
   * streamed state. `incoming` replaces the active row set when `replaceAll`
   * is true; otherwise rows are upserted.
   */
  sync(
    current: MessageRow[],
    incoming: MessageRow[],
    replaceAll = true,
  ): MessageRow[] {
    const byId = new Map(current.map((row) => [row.id, row]))
    const merged = incoming.map((row) => this.mergeRow(byId.get(row.id), row))
    if (replaceAll) {
      const active = new Set(merged.map((row) => row.id))
      for (const id of this.states.keys())
        if (!active.has(id)) this.states.delete(id)
      return merged
    }
    const mergedById = new Map(merged.map((row) => [row.id, row]))
    const result = current.map((row) => mergedById.get(row.id) ?? row)
    for (const row of merged) if (!byId.has(row.id)) result.push(row)
    return result
  }

  private mergeRow(
    local: MessageRow | undefined,
    snapshot: MessageRow,
  ): MessageRow {
    const state = this.states.get(snapshot.id)
    if (state) state.pending = []
    const localIsCurrent =
      local &&
      state &&
      state.lastSeq > 0 &&
      textLength(local) >= textLength(snapshot) &&
      local.message.parts.length >= snapshot.message.parts.length
    if (!local || !localIsCurrent) return snapshot

    const parts = cloneParts(local.message.parts)
    for (const synced of snapshot.message.parts) {
      if (!synced.toolCallId) continue
      const part = parts.find(
        (candidate) => candidate.toolCallId === synced.toolCallId,
      )
      if (!part) continue
      if (synced.state && synced.state !== part.state) {
        part.state = synced.state
        if (synced.output !== undefined) part.output = synced.output
        if (synced.errorText !== undefined) part.errorText = synced.errorText
      }
      if (synced.input && typeof synced.input === 'object')
        part.input = {
          ...((part.input as object) ?? {}),
          ...(synced.input as object),
        }
    }
    return {
      ...local,
      metadata: { ...local.metadata, ...snapshot.metadata },
      message: { ...local.message, parts },
    }
  }
}
