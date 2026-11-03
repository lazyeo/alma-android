export interface ChatResyncSocket {
  opened: Promise<void>
  close(): void
}

export interface ChatResync {
  start(): void
  stop(): void
  visible(): void
}

interface ChatResyncOptions {
  getEnd(): number
  open(
    from: number,
    onMessage: (event: Record<string, unknown>) => void,
    onClose: () => void,
  ): ChatResyncSocket
  onEvent(event: Record<string, unknown>): void
  staleAfterMs?: number
  now?: () => number
}

const RETRY_DELAYS = [1_000, 2_000, 5_000, 15_000]

export function createChatResync({
  getEnd,
  open,
  onEvent,
  staleAfterMs = 25_000,
  now = Date.now,
}: ChatResyncOptions): ChatResync {
  let active = false
  let terminal = false
  let socket: ChatResyncSocket | undefined
  let generation = 0
  let retryAttempt = 0
  let lastMessageAt = now()
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  const clearWatchdog = () => {
    if (watchdog !== undefined) clearTimeout(watchdog)
    watchdog = undefined
  }

  const clearReconnect = () => {
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const armWatchdog = () => {
    clearWatchdog()
    if (!active || terminal) return
    const remaining = Math.max(0, staleAfterMs - (now() - lastMessageAt))
    watchdog = setTimeout(() => reconnect(false), remaining)
  }

  const openSocket = () => {
    if (!active || terminal || socket) return
    const currentGeneration = ++generation
    lastMessageAt = now()
    let next!: ChatResyncSocket
    next = open(
      getEnd(),
      (event) => {
        if (
          !active ||
          terminal ||
          currentGeneration !== generation ||
          socket !== next
        )
          return
        lastMessageAt = now()
        retryAttempt = 0
        armWatchdog()
        if (event.type === 'session_changed') {
          terminal = true
          clearWatchdog()
          clearReconnect()
        } else if (
          event.type === 'tick' &&
          typeof event.end === 'number' &&
          event.end > getEnd()
        ) {
          reconnect(true)
        }
        onEvent(event)
      },
      () => handleFailure(currentGeneration),
    )
    socket = next
    armWatchdog()
    next.opened.catch(() => handleFailure(currentGeneration))
  }

  const scheduleReconnect = (immediate: boolean) => {
    if (!active || terminal || reconnectTimer !== undefined) return
    const delay = immediate
      ? 0
      : RETRY_DELAYS[Math.min(retryAttempt++, RETRY_DELAYS.length - 1)]
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      openSocket()
    }, delay)
  }

  function reconnect(immediate: boolean) {
    if (!active || terminal) return
    clearWatchdog()
    generation += 1
    const previous = socket
    socket = undefined
    previous?.close()
    scheduleReconnect(immediate)
  }

  function handleFailure(failedGeneration: number) {
    if (failedGeneration !== generation) return
    reconnect(false)
  }

  return {
    start() {
      if (active) return
      active = true
      terminal = false
      retryAttempt = 0
      openSocket()
    },
    stop() {
      active = false
      clearWatchdog()
      clearReconnect()
      generation += 1
      socket?.close()
      socket = undefined
    },
    visible() {
      if (active && !terminal && now() - lastMessageAt >= staleAfterMs)
        reconnect(false)
    },
  }
}
