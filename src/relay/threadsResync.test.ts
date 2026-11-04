import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent } from './almaApi'
import { createThreadsResync, type ThreadsResyncSocket } from './threadsResync'

afterEach(() => vi.useRealTimers())

interface FakeSocket extends ThreadsResyncSocket {
  close: ReturnType<typeof vi.fn>
}

function setup() {
  vi.useFakeTimers()
  const sockets: Array<{
    socket: FakeSocket
    message(event: RealtimeEvent): void
    closed(): void
    open(): void
    fail(): void
  }> = []
  const open = vi.fn(
    (onEvent: (event: RealtimeEvent) => void, onClose: () => void) => {
      let resolveOpened!: () => void
      let rejectOpened!: (error: Error) => void
      const socket: FakeSocket = {
        opened: new Promise<void>((resolve, reject) => {
          resolveOpened = resolve
          rejectOpened = reject
        }),
        close: vi.fn(),
      }
      sockets.push({
        socket,
        message: onEvent,
        closed: onClose,
        open: () => resolveOpened(),
        fail: () => rejectOpened(new Error('open failed')),
      })
      return socket
    },
  )
  const onEvent = vi.fn()
  const onOpened = vi.fn()
  const onLost = vi.fn()
  const resync = createThreadsResync<FakeSocket>({
    open,
    onEvent,
    onOpened,
    onLost,
  })
  resync.start()
  return { open, onEvent, onOpened, onLost, resync, sockets }
}

const snapshot: RealtimeEvent = {
  type: 'generating_snapshot',
  data: { ids: [] },
}

describe('createThreadsResync', () => {
  it('opens one socket and reports the first open as not reconnected', async () => {
    const { open, onOpened, sockets } = setup()
    sockets[0].open()
    await Promise.resolve()

    expect(open).toHaveBeenCalledTimes(1)
    expect(onOpened).toHaveBeenCalledWith(sockets[0].socket, false)
  })

  it('reconnects after close with 1/2/5/15s capped backoff', async () => {
    const { open, onLost, sockets } = setup()
    const expectedDelays = [1_000, 2_000, 5_000, 15_000, 15_000]

    for (const [index, delay] of expectedDelays.entries()) {
      sockets[index].closed()
      expect(onLost).toHaveBeenLastCalledWith(sockets[index].socket)
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(open).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(open).toHaveBeenCalledTimes(index + 2)
    }
  })

  it('reconnects after an open error and flags the new socket as a reconnect', async () => {
    const { open, onOpened, sockets } = setup()
    sockets[0].fail()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(open).toHaveBeenCalledTimes(2)

    sockets[1].open()
    await Promise.resolve()
    expect(onOpened).toHaveBeenCalledWith(sockets[1].socket, true)
  })

  it('treats a werr (open rejection plus close) as one failure', async () => {
    const { open, onLost, sockets } = setup()
    sockets[0].fail()
    sockets[0].closed()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(onLost).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('resets backoff only after a socket delivers an event', async () => {
    const { open, sockets } = setup()
    sockets[0].closed()
    await vi.advanceTimersByTimeAsync(1_000)
    sockets[1].closed()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(open).toHaveBeenCalledTimes(3)

    sockets[2].message(snapshot)
    sockets[2].closed()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(open).toHaveBeenCalledTimes(4)
  })

  it('forwards events only from the live socket', async () => {
    const { onEvent, sockets } = setup()
    sockets[0].message(snapshot)
    sockets[0].closed()
    await vi.advanceTimersByTimeAsync(1_000)

    sockets[0].message({ type: 'message_added', data: {} })
    sockets[1].message(snapshot)
    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      snapshot,
      snapshot,
    ])
  })

  it('never keeps more than one socket open', async () => {
    const { open, resync, sockets } = setup()
    resync.start()
    resync.visible()
    expect(open).toHaveBeenCalledTimes(1)

    sockets[0].closed()
    sockets[0].closed()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(open).toHaveBeenCalledTimes(2)
    expect(sockets[0].socket.close).toHaveBeenCalledTimes(1)
  })

  it('reconnects immediately when foregrounded during backoff', async () => {
    const { open, sockets, resync } = setup()
    sockets[0].closed()
    await vi.advanceTimersByTimeAsync(1_000)
    sockets[1].closed()
    await vi.advanceTimersByTimeAsync(500)
    expect(open).toHaveBeenCalledTimes(2)

    resync.visible()
    expect(open).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('does not reconnect a live socket when foregrounded', () => {
    const { open, resync } = setup()
    resync.visible()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does not reconnect or report after stop (unmount)', async () => {
    const { open, onOpened, onLost, onEvent, resync, sockets } = setup()
    sockets[0].closed()
    resync.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(open).toHaveBeenCalledTimes(1)

    resync.start()
    resync.stop()
    expect(sockets[1].socket.close).toHaveBeenCalledTimes(1)
    sockets[1].open()
    sockets[1].message(snapshot)
    sockets[1].closed()
    resync.visible()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(open).toHaveBeenCalledTimes(2)
    expect(onOpened).not.toHaveBeenCalled()
    expect(onEvent).not.toHaveBeenCalled()
    expect(onLost).toHaveBeenCalledTimes(1)
  })
})
