import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesktopWatch } from './desktopWatch'

function setup() {
  const sockets: Array<{ close: ReturnType<typeof vi.fn> }> = []
  const refresh = vi.fn(async () => undefined)
  const watch = createDesktopWatch({
    refresh,
    pollMs: 5000,
    openSockets: () => {
      const opened = [{ close: vi.fn() }, { close: vi.fn() }]
      sockets.push(...opened)
      return opened
    },
  })
  const openCount = () =>
    sockets.filter((socket) => !socket.close.mock.calls.length).length
  return { watch, refresh, sockets, openCount }
}

describe('desktop background watch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not fetch, poll or open sockets while the desktop is offline', () => {
    const { watch, refresh, sockets } = setup()
    watch.setOnline(false)
    vi.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()
    expect(sockets).toHaveLength(0)
  })

  it('opens sockets once and polls only while online', () => {
    const { watch, refresh, openCount } = setup()
    watch.setOnline(true)
    watch.setOnline(true)
    expect(openCount()).toBe(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(3)

    watch.setOnline(false)
    expect(openCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('reopens exactly one set of sockets after the desktop reconnects', () => {
    const { watch, refresh, sockets, openCount } = setup()
    watch.setOnline(true)
    watch.setOnline(false)
    watch.setOnline(true)
    expect(sockets).toHaveLength(4)
    expect(openCount()).toBe(2)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('closes everything and ignores later status changes once closed', () => {
    const { watch, refresh, sockets, openCount } = setup()
    watch.setOnline(true)
    watch.close()
    watch.setOnline(true)
    vi.advanceTimersByTime(60_000)
    expect(openCount()).toBe(0)
    expect(sockets).toHaveLength(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
