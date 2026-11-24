import type { RealtimeEvent } from './almaApi'

export interface ThreadsResyncSocket {
  opened: Promise<void>
  close(): void
}

export interface ThreadsResync {
  start(): void
  stop(): void
  /** Foregrounded: skip any pending backoff and reconnect a dead socket now. */
  visible(): void
}

interface ThreadsResyncOptions<S extends ThreadsResyncSocket> {
  open(onEvent: (event: RealtimeEvent) => void, onClose: () => void): S
  onEvent(event: RealtimeEvent): void
  /**
   * `reconnected` is true for every socket after the first one since start():
   * `/ws/threads` does not replay, so the caller catches up over HTTP.
   */
  onOpened?(socket: S, reconnected: boolean): void
  onLost?(socket: S): void
  /**
   * Opt-in silence watchdog: while `watching()` is true (a turn is running),
   * a socket that delivers no frame for `silenceMs` is treated as dead and
   * reopened; `onSilent` lets the caller catch up over HTTP right away.
   */
  silence?: {
    ms: number
    watching(): boolean
    onSilent?(): void
  }
}

export const THREADS_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 15_000]

export const THREADS_SILENCE_MS = 20_000

/**
 * Keeps exactly one live `/ws/threads` socket and reopens it with capped
 * backoff after close/error. Desktop 0.4.423 sends no application keepalive
 * on `/ws/threads` (only a `generating_snapshot` on open), so an idle quiet
 * socket is not a stale one; but during a turn the desktop streams deltas,
 * so silence then means a half-open socket. `silence` opts into that check.
 */
export function createThreadsResync<S extends ThreadsResyncSocket>({
  open,
  onEvent,
  onOpened,
  onLost,
  silence,
}: ThreadsResyncOptions<S>): ThreadsResync {
  let active = false
  let socket: S | undefined
  let generation = 0
  let retryAttempt = 0
  let opensSinceStart = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  let silenceTimer: ReturnType<typeof setTimeout> | undefined

  const clearReconnect = () => {
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const clearSilence = () => {
    if (silenceTimer !== undefined) clearTimeout(silenceTimer)
    silenceTimer = undefined
  }

  // Re-armed on every frame; an idle thread just re-arms when it fires.
  const armSilence = (socketGeneration: number) => {
    if (!silence) return
    clearSilence()
    silenceTimer = setTimeout(() => {
      silenceTimer = undefined
      if (!active || socketGeneration !== generation || !socket) return
      if (!silence.watching()) {
        armSilence(socketGeneration)
        return
      }
      handleFailure(socketGeneration)
      silence.onSilent?.()
    }, silence.ms)
  }

  const openSocket = () => {
    if (!active || socket) return
    const currentGeneration = ++generation
    const reconnected = opensSinceStart++ > 0
    const isCurrent = () =>
      active && currentGeneration === generation && socket === next
    let next!: S
    next = open(
      (event) => {
        if (!isCurrent()) return
        // The desktop greets every socket with a snapshot; only a socket that
        // actually delivers resets the backoff, so accept-then-close loops
        // still back off.
        retryAttempt = 0
        armSilence(currentGeneration)
        onEvent(event)
      },
      () => handleFailure(currentGeneration),
    )
    socket = next
    next.opened.then(
      () => {
        if (!isCurrent()) return
        armSilence(currentGeneration)
        onOpened?.(next, reconnected)
      },
      () => handleFailure(currentGeneration),
    )
  }

  const scheduleReconnect = () => {
    if (!active || reconnectTimer !== undefined) return
    const delay =
      THREADS_RETRY_DELAYS_MS[
        Math.min(retryAttempt++, THREADS_RETRY_DELAYS_MS.length - 1)
      ]
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      openSocket()
    }, delay)
  }

  // A tunnel `werr` both rejects `opened` and fires close; the generation
  // bump makes the second report a no-op.
  function handleFailure(failedGeneration: number) {
    if (!active || failedGeneration !== generation || !socket) return
    const lost = socket
    clearSilence()
    generation += 1
    socket = undefined
    lost.close()
    onLost?.(lost)
    scheduleReconnect()
  }

  return {
    start() {
      if (active) return
      active = true
      retryAttempt = 0
      opensSinceStart = 0
      openSocket()
    },
    stop() {
      active = false
      clearReconnect()
      clearSilence()
      generation += 1
      const previous = socket
      socket = undefined
      previous?.close()
    },
    visible() {
      if (!active || socket) return
      clearReconnect()
      retryAttempt = 0
      openSocket()
    },
  }
}
