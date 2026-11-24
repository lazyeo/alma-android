/**
 * Why a thread snapshot (GET /api/threads/:id) was asked for. Tagging every
 * caller lets the per-minute counter name the source of a reload storm.
 */
export type ThreadLoadReason =
  | 'open'
  | 'link-restored'
  | 'socket-reopened'
  | 'socket-silent'
  | 'thread-updated'
  | 'delta-resync'
  | 'turn-end'
  | 'turn-end-settle'
  | 'foreground'
  | 'foreground-retry'
  | 'foreground-ready'
  | 'options-failed'
  | 'compacted'
  | 'version-switched'

export interface LoadTicket {
  readonly seq: number
  /** False once a newer load committed or the gate was invalidated. */
  isCurrent(): boolean
  /** Claims the commit slot; false means the response is stale and dropped. */
  commit(): boolean
}

export interface LoadGate<R> {
  /**
   * Starts a load, or—while one is in flight—queues a single trailing load
   * that runs after it. Resolves once the load covering this request ends.
   */
  request(reason: R): Promise<void>
  /** Drops in-flight and queued work, e.g. when the screen switches threads. */
  invalidate(): void
}

/**
 * Single-flight loader with monotonic request numbers. A full snapshot that
 * left before a newer committed one carries older state, so it is discarded
 * instead of overwriting fresher rows.
 */
export function createLoadGate<R>({
  run,
  onRequest,
}: {
  run(ticket: LoadTicket, reason: R): Promise<void>
  onRequest?(reason: R): void
}): LoadGate<R> {
  let issued = 0
  let committed = 0
  let generation = 0
  let inflight: Promise<void> | undefined
  let trailing: Promise<void> | undefined
  let trailingReason: R | undefined

  const start = (reason: R) => {
    const seq = ++issued
    const gen = generation
    const ticket: LoadTicket = {
      seq,
      isCurrent: () => gen === generation && seq > committed,
      commit() {
        if (!ticket.isCurrent()) return false
        committed = seq
        return true
      },
    }
    const tracked: Promise<void> = Promise.resolve()
      .then(() => run(ticket, reason))
      .finally(() => {
        if (inflight === tracked) inflight = undefined
      })
    inflight = tracked
    return tracked
  }

  return {
    request(reason) {
      onRequest?.(reason)
      if (!inflight) return start(reason)
      trailingReason = reason
      if (!trailing) {
        const gen = generation
        trailing = inflight
          .catch(() => undefined)
          .then(() => {
            if (gen !== generation) return
            trailing = undefined
            const next = trailingReason as R
            trailingReason = undefined
            return start(next)
          })
      }
      return trailing
    },
    invalidate() {
      generation += 1
      committed = issued
      inflight = undefined
      trailing = undefined
      trailingReason = undefined
    },
  }
}

// Desktop writes streamed rows to its DB on a ~1s throttle, so the snapshot
// read right at turn end can miss the reply's tail; read once more after it.
export const TURN_END_SETTLE_MS = 1500

/** Loads now and once more after the DB throttle; returns a cancel. */
export function loadAtTurnEnd(
  load: (reason: ThreadLoadReason) => void,
  settleMs = TURN_END_SETTLE_MS,
) {
  load('turn-end')
  const timer = setTimeout(() => load('turn-end-settle'), settleMs)
  return () => clearTimeout(timer)
}

export const LOAD_STORM_PER_MINUTE = 30

/**
 * Counts load requests per reason and reports once a minute: always in dev,
 * and as a warning in any build when the total looks like a storm.
 */
export function createLoadCounter<R extends string>({
  label,
  windowMs = 60_000,
  log = (level: 'info' | 'warn', message: string, counts: object) =>
    console[level](message, counts),
  verbose = import.meta.env.DEV,
}: {
  label: string
  windowMs?: number
  log?(level: 'info' | 'warn', message: string, counts: object): void
  verbose?: boolean
}) {
  let counts: Partial<Record<R, number>> = {}
  let total = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    timer = undefined
    const storm = total >= (LOAD_STORM_PER_MINUTE * windowMs) / 60_000
    if (storm || verbose)
      log(
        storm ? 'warn' : 'info',
        `[thread-load] ${label}: ${total} loads in ${Math.round(windowMs / 1000)}s`,
        counts,
      )
    counts = {}
    total = 0
  }

  return {
    count(reason: R) {
      counts[reason] = (counts[reason] ?? 0) + 1
      total += 1
      timer ??= setTimeout(flush, windowMs)
    },
    stop() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      counts = {}
      total = 0
    },
  }
}
