import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatResync, type ChatResyncSocket } from './chatResync'

afterEach(() => vi.useRealTimers())

function setup(end = 42) {
  vi.useFakeTimers()
  const sockets: Array<{
    from: number
    message(event: Record<string, unknown>): void
    close(): void
    fail(): void
    socket: ChatResyncSocket
  }> = []
  const open = vi.fn(
    (
      from: number,
      onMessage: (event: Record<string, unknown>) => void,
      onClose: () => void,
    ) => {
      let rejectOpened!: (error: Error) => void
      const socket = {
        opened: new Promise<void>((_resolve, reject) => {
          rejectOpened = reject
        }),
        close: vi.fn(),
      }
      sockets.push({
        from,
        message: onMessage,
        close: onClose,
        fail: () => rejectOpened(new Error('open failed')),
        socket,
      })
      return socket
    },
  )
  const onEvent = vi.fn()
  const resync = createChatResync({
    getEnd: () => end,
    open,
    onEvent,
  })
  resync.start()
  return { open, onEvent, resync, sockets }
}

describe('createChatResync', () => {
  it('reopens from the latest end after socket silence', async () => {
    const { open } = setup(84)

    await vi.advanceTimersByTimeAsync(25_999)
    expect(open).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[1]?.[0]).toBe(84)
  })

  it('reopens when a tick reports transcript bytes ahead of the current end', async () => {
    const { open, sockets } = setup(42)

    sockets[0]?.message({ type: 'tick', end: 43 })
    await vi.runOnlyPendingTimersAsync()

    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[1]?.[0]).toBe(42)
  })

  it('uses an equal tick only to refresh the watchdog', async () => {
    const { open, sockets } = setup(42)

    await vi.advanceTimersByTimeAsync(20_000)
    sockets[0]?.message({ type: 'tick', end: 42 })
    await vi.advanceTimersByTimeAsync(24_999)
    expect(open).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(open).toHaveBeenCalledTimes(2)
  })

  it('backs off before reconnecting a closed socket', async () => {
    const { open, sockets } = setup(42)

    sockets[0]?.close()
    await vi.advanceTimersByTimeAsync(999)
    expect(open).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(2)

    sockets[1]?.close()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(open).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('does not reconnect after stop', async () => {
    const { open, resync, sockets } = setup(42)

    sockets[0]?.close()
    resync.stop()
    await vi.runAllTimersAsync()

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does not reconnect after session_changed', async () => {
    const { open, sockets } = setup(42)

    sockets[0]?.message({ type: 'session_changed', session_id: 'next' })
    sockets[0]?.close()
    await vi.runAllTimersAsync()

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('resyncs on foreground only when the socket is stale', async () => {
    const { open, resync } = setup(42)

    await vi.advanceTimersByTimeAsync(24_999)
    resync.visible()
    expect(open).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    resync.visible()
    await vi.runOnlyPendingTimersAsync()
    expect(open).toHaveBeenCalledTimes(2)
  })
})
