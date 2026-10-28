export interface WatchSocket {
  close(): void
}

/**
 * Owns one desktop's background sockets and polling. Tunnel sockets die with
 * their session, so they are opened per online period: closed when the
 * desktop drops, reopened (exactly once) when it is back, and an offline
 * desktop is never fetched or polled.
 */
export function createDesktopWatch(input: {
  refresh(): Promise<void>
  openSockets(): WatchSocket[]
  pollMs: number
}) {
  let active:
    { sockets: WatchSocket[]; poll: ReturnType<typeof setInterval> } | undefined
  let closed = false

  const stop = () => {
    if (!active) return
    clearInterval(active.poll)
    for (const socket of active.sockets) socket.close()
    active = undefined
  }

  return {
    setOnline(online: boolean) {
      if (closed || online === Boolean(active)) return
      if (!online) return stop()
      void input.refresh()
      active = {
        sockets: input.openSockets(),
        poll: setInterval(() => void input.refresh(), input.pollMs),
      }
    },
    close() {
      closed = true
      stop()
    },
  }
}
