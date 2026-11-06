// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TunnelSocket } from '../../relay'
import { reconnectDelay } from '../liveStream/reconnect'
import { useIabStream } from './useIabStream'

function fakeSocket() {
  let message: (data: string | Uint8Array) => void = () => undefined
  let close: () => void = () => undefined
  const socket: TunnelSocket = {
    opened: Promise.resolve(),
    send: vi.fn(),
    close: vi.fn(),
    onMessage(listener) {
      message = listener
      return () => undefined
    },
    onClose(listener) {
      close = listener
      return () => undefined
    },
  }
  return {
    socket,
    message: (data: unknown) => message(JSON.stringify(data)),
    close: () => close(),
    sent: () =>
      vi.mocked(socket.send).mock.calls.map(([raw]) => JSON.parse(String(raw))),
  }
}

const frame = (seq: number, data = '/9j/') => ({
  type: 'frame',
  data,
  width: 1024,
  height: 700,
  seq,
})

// One tunnel object per socket: the hook reopens when its tunnel changes.
const tunnels = new WeakMap<object, { openIabSocket: () => TunnelSocket }>()
const tunnelOf = (fake: ReturnType<typeof fakeSocket>) => {
  let tunnel = tunnels.get(fake)
  if (!tunnel) {
    tunnel = { openIabSocket: () => fake.socket }
    tunnels.set(fake, tunnel)
  }
  return tunnel
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useIabStream', () => {
  it("opens the thread's browser socket and follows its page and tabs", async () => {
    const fake = fakeSocket()
    const openIabSocket = vi.fn(() => fake.socket)
    const tunnel = { openIabSocket }
    const { result, unmount } = renderHook(() =>
      useIabStream(tunnel, 'thread-1', { rtc: false }),
    )
    expect(openIabSocket).toHaveBeenCalledWith('thread-1')
    await act(async () => {
      await fake.socket.opened
    })
    expect(result.current.connected).toBe(true)
    act(() => {
      fake.message({
        type: 'status',
        bound: true,
        url: 'http://localhost:5173/',
        title: 'Dev',
        loading: false,
      })
      fake.message({
        type: 'page',
        url: 'http://localhost:5173/a',
        title: '',
        loading: true,
      })
      fake.message({
        type: 'tabs',
        activeId: 't1',
        tabs: [{ id: 't1', url: 'http://localhost:5173/a', title: 'A' }],
      })
    })
    expect(result.current.bound).toBe(true)
    expect(result.current.page).toEqual({
      url: 'http://localhost:5173/a',
      title: '',
      loading: true,
    })
    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['t1'])
    expect(result.current.activeTabId).toBe('t1')
    unmount()
    expect(fake.socket.close).toHaveBeenCalled()
  })

  it('keeps the newest frame and takes the page size from it', () => {
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useIabStream(tunnelOf(fake), 't', { rtc: false }),
    )
    act(() => {
      fake.message(frame(2, 'new'))
      fake.message(frame(1, 'old'))
    })
    expect(result.current.frame?.data).toBe('new')
    expect(result.current.viewport).toEqual({ width: 1024, height: 700 })
    act(() => fake.message({ type: 'viewport', width: 800, height: 600 }))
    expect(result.current.viewport).toEqual({ width: 800, height: 600 })
  })

  it('drops the picture when the Mac browser closes', () => {
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useIabStream(tunnelOf(fake), 't', { rtc: false }),
    )
    act(() => {
      fake.message({ type: 'status', bound: true, url: 'https://a.test/' })
      fake.message(frame(1))
      fake.message({ type: 'status', bound: false })
    })
    expect(result.current.bound).toBe(false)
    expect(result.current.frame).toBeUndefined()
  })

  it('asks for WebRTC video once, after the first frame', async () => {
    const fake = fakeSocket()
    renderHook(() => useIabStream(tunnelOf(fake), 't', { rtc: true }))
    await act(async () => {
      await fake.socket.opened
    })
    expect(fake.sent()).toEqual([])
    act(() => {
      fake.message(frame(1))
      fake.message(frame(2))
    })
    expect(fake.sent()).toEqual([{ type: 'rtc_start', relayOnly: false }])
  })

  it('stays on JPEG frames when the desktop has no WebRTC', async () => {
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useIabStream(tunnelOf(fake), 't', { rtc: true }),
    )
    act(() => {
      fake.message(frame(1))
      fake.message({ type: 'rtc', state: 'unavailable' })
    })
    expect(result.current.rtcState).toBe('unavailable')
    expect(result.current.stream).toBeUndefined()
  })

  it('gives up on video that shows no frame in time', async () => {
    vi.useFakeTimers()
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useIabStream(tunnelOf(fake), 't', {
        rtc: true,
        rtcTimeoutMs: 1_000,
      }),
    )
    await act(async () => {
      await fake.socket.opened
    })
    act(() => fake.message(frame(1)))
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.rtcState).toBe('timeout')
    expect(fake.sent().at(-1)).toEqual({ type: 'rtc_stop' })
  })

  it('sends page input over the socket while no data channel is open', async () => {
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useIabStream(tunnelOf(fake), 't', { rtc: false }),
    )
    // Not yet open: nothing is sent.
    result.current.send({ type: 'reload' })
    expect(fake.sent()).toEqual([])
    await act(async () => {
      await fake.socket.opened
    })
    act(() => {
      result.current.send({ type: 'tap', x: 10, y: 20 })
      result.current.send({ type: 'navigate', url: 'localhost:3000' })
    })
    expect(fake.sent()).toEqual([
      { type: 'tap', x: 10, y: 20 },
      { type: 'navigate', url: 'localhost:3000' },
    ])
  })

  it('reopens a dropped socket after a backoff', () => {
    vi.useFakeTimers()
    const sockets = [fakeSocket(), fakeSocket()]
    let index = 0
    const openIabSocket = vi.fn(() => sockets[index++].socket)
    const tunnel = { openIabSocket }
    renderHook(() => useIabStream(tunnel, 't', { rtc: false }))
    act(() => {
      sockets[0].message({ type: 'status', bound: false })
      sockets[0].close()
    })
    act(() => {
      vi.advanceTimersByTime(reconnectDelay(0) - 1)
    })
    expect(openIabSocket).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(openIabSocket).toHaveBeenCalledTimes(2)
  })

  it('calls a desktop that never reports a status unsupported, and stops', async () => {
    vi.useFakeTimers()
    const fake = fakeSocket()
    const openIabSocket = vi.fn(() => fake.socket)
    const tunnel = { openIabSocket }
    const { result } = renderHook(() =>
      useIabStream(tunnel, 't', {
        rtc: false,
        statusTimeoutMs: 2_000,
      }),
    )
    await act(async () => {
      await fake.socket.opened
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.unsupported).toBe(true)
    expect(fake.socket.close).toHaveBeenCalled()
    act(() => {
      fake.close()
      vi.advanceTimersByTime(60_000)
    })
    expect(openIabSocket).toHaveBeenCalledTimes(1)
  })

  it('calls a desktop that keeps closing an open socket before any status unsupported', async () => {
    vi.useFakeTimers()
    const sockets = Array.from({ length: 5 }, fakeSocket)
    let index = 0
    const openIabSocket = vi.fn(() => sockets[index++].socket)
    const tunnel = { openIabSocket }
    const { result } = renderHook(() =>
      useIabStream(tunnel, 't', { rtc: false }),
    )
    for (let attempt = 0; attempt < 3; attempt++) {
      await act(async () => {
        await sockets[attempt].socket.opened
      })
      act(() => {
        sockets[attempt].close()
        vi.advanceTimersByTime(10_000)
      })
    }
    expect(result.current.unsupported).toBe(true)
    expect(openIabSocket).toHaveBeenCalledTimes(3)
  })

  it('keeps retrying while the connection itself fails', async () => {
    vi.useFakeTimers()
    const sockets = Array.from({ length: 6 }, () => {
      const fake = fakeSocket()
      fake.socket.opened = Promise.reject(new Error('offline'))
      fake.socket.opened.catch(() => undefined)
      return fake
    })
    let index = 0
    const openIabSocket = vi.fn(() => sockets[index++].socket)
    const tunnel = { openIabSocket }
    const { result } = renderHook(() =>
      useIabStream(tunnel, 't', { rtc: false }),
    )
    for (let attempt = 0; attempt < 4; attempt++)
      await act(async () => {
        await Promise.resolve()
        vi.advanceTimersByTime(10_000)
      })
    expect(result.current.unsupported).toBe(false)
    expect(openIabSocket.mock.calls.length).toBeGreaterThan(3)
  })

  it('surfaces desktop errors', () => {
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useIabStream(tunnelOf(fake), 't', { rtc: false }),
    )
    act(() => fake.message({ type: 'error', message: 'Navigation failed' }))
    expect(result.current.error).toBe('Navigation failed')
  })
})
