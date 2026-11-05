// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TunnelSocket } from '../../relay'
import { useRemoteScreen, wantsVideo } from './useRemoteScreen'

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
  return { socket, message: (data: string) => message(data), close }
}

describe('useRemoteScreen', () => {
  it('opens the screen socket, keeps the latest frame, and closes on cleanup', () => {
    const fake = fakeSocket()
    const openWebSocket = vi.fn(() => fake.socket)
    const { result, unmount } = renderHook(() =>
      useRemoteScreen({ openWebSocket }, { rtc: false }),
    )
    expect(openWebSocket).toHaveBeenCalledWith('/ws/screen')
    act(() => {
      fake.message(
        JSON.stringify({
          type: 'frame',
          data: '/9j/',
          width: 100,
          height: 50,
          seq: 2,
        }),
      )
      fake.message(
        JSON.stringify({
          type: 'frame',
          data: '/9j/old',
          width: 100,
          height: 50,
          seq: 1,
        }),
      )
    })
    expect(result.current.frame?.seq).toBe(2)
    unmount()
    expect(fake.socket.close).toHaveBeenCalled()
  })

  it('sends rtc_start but never sends control unless control is enabled', () => {
    const fake = fakeSocket()
    const { result } = renderHook(() =>
      useRemoteScreen({ openWebSocket: () => fake.socket }, { rtc: true }),
    )
    return act(async () => {
      await fake.socket.opened
      expect(fake.socket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'rtc_start' }),
      )
      result.current.sendControl({
        type: 'pointer',
        action: 'click',
        x: 0.5,
        y: 0.5,
      })
      expect(fake.socket.send).toHaveBeenCalledTimes(1)
      result.current.setControl(true)
      result.current.sendControl({
        type: 'pointer',
        action: 'click',
        x: 0.5,
        y: 0.5,
      })
      expect(fake.socket.send).toHaveBeenLastCalledWith(
        JSON.stringify({
          type: 'pointer',
          action: 'click',
          x: 0.5,
          y: 0.5,
        }),
      )
    })
  })

  it('streams a window as JPEG frames and the whole screen as video', async () => {
    const fake = fakeSocket()
    const openWebSocket = vi.fn(() => fake.socket)
    const tunnel = { openWebSocket }
    const { result, rerender } = renderHook(
      ({ windowId }: { windowId?: number }) =>
        useRemoteScreen(tunnel, { rtc: true, windowId }),
      { initialProps: { windowId: 42 } as { windowId?: number } },
    )
    await act(async () => {
      await fake.socket.opened
    })
    expect(openWebSocket).toHaveBeenLastCalledWith('/ws/screen?window=42')
    const rtcStarts = () =>
      vi
        .mocked(fake.socket.send)
        .mock.calls.filter(
          ([raw]) => raw === JSON.stringify({ type: 'rtc_start' }),
        ).length
    act(() => {
      fake.message(
        JSON.stringify({
          type: 'status',
          bound: true,
          displayId: 1,
          width: 800,
          height: 600,
          scale: 2,
          mode: 'jpeg',
          window: { id: 42, app: 'Notes' },
        }),
      )
      fake.message(
        JSON.stringify({ type: 'viewport', width: 1280, height: 960 }),
      )
      fake.message(
        JSON.stringify({
          type: 'frame',
          data: '/9j/',
          width: 1280,
          height: 960,
          seq: 1,
        }),
      )
    })
    expect(rtcStarts()).toBe(0)
    expect(result.current.frame?.width).toBe(1280)
    expect(result.current.status?.width).toBe(800)

    rerender({ windowId: undefined })
    await act(async () => {
      await fake.socket.opened
    })
    expect(openWebSocket).toHaveBeenLastCalledWith('/ws/screen')
    expect(rtcStarts()).toBe(1)
  })

  it('starts video once the streamed window closes and the display shows', async () => {
    const fake = fakeSocket()
    renderHook(() =>
      useRemoteScreen(
        { openWebSocket: () => fake.socket },
        { rtc: true, windowId: 7 },
      ),
    )
    await act(async () => {
      await fake.socket.opened
    })
    expect(fake.socket.send).not.toHaveBeenCalled()
    act(() => {
      fake.message(
        JSON.stringify({
          type: 'status',
          bound: true,
          displayId: 1,
          width: 1512,
          height: 982,
          scale: 2,
          mode: 'jpeg',
          windowClosed: true,
        }),
      )
    })
    expect(fake.socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'rtc_start' }),
    )
  })
})

const frameMessage = (seq: number, data = `/9j/${seq}`, width = 1280) =>
  JSON.stringify({ type: 'frame', data, width, height: 800, seq })

const windowStatus = (id: number) =>
  JSON.stringify({
    type: 'status',
    bound: true,
    displayId: 1,
    width: 640,
    height: 400,
    scale: 2,
    mode: 'jpeg',
    windows: true,
    window: { id, app: 'Notes' },
  })

/** A tunnel handing out a fresh fake socket per open, logging the order. */
function switchingTunnel() {
  const log: string[] = []
  const sockets: ReturnType<typeof fakeSocket>[] = []
  const openWebSocket = vi.fn((path: string) => {
    const fake = fakeSocket()
    const index = sockets.length
    vi.mocked(fake.socket.close).mockImplementation(() => {
      log.push(`close ${index}`)
    })
    sockets.push(fake)
    log.push(`open ${index} ${path}`)
    return fake.socket
  })
  return { tunnel: { openWebSocket }, log, sockets }
}

describe('switching targets', () => {
  it('closes the old socket and opens the new one in the same step', async () => {
    vi.useFakeTimers()
    try {
      const { tunnel, log } = switchingTunnel()
      const { rerender } = renderHook(
        ({ windowId }: { windowId?: number }) =>
          useRemoteScreen(tunnel, { rtc: true, windowId }),
        { initialProps: { windowId: 42 } as { windowId?: number } },
      )
      rerender({ windowId: 43 })
      // No timer had to run: a deliberate switch has no backoff.
      expect(log).toEqual([
        'open 0 /ws/screen?window=42',
        'close 0',
        'open 1 /ws/screen?window=43',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows the new window's first frame although its seq restarts at 1", async () => {
    const { tunnel, sockets } = switchingTunnel()
    const { result, rerender } = renderHook(
      ({ windowId }: { windowId?: number }) =>
        useRemoteScreen(tunnel, { rtc: true, windowId }),
      { initialProps: { windowId: 42 } as { windowId?: number } },
    )
    await act(async () => {
      await sockets[0].socket.opened
    })
    act(() => {
      sockets[0].message(windowStatus(42))
      // A long-running stream: the desktop's per-socket counter is high.
      sockets[0].message(frameMessage(4_000, 'old'))
    })
    expect(result.current.frame?.data).toBe('old')
    expect(result.current.switching).toBe(false)

    rerender({ windowId: 43 })
    await act(async () => {
      await sockets[1].socket.opened
    })
    // The old picture stays, marked as switching, until the new one lands.
    expect(result.current.frame?.data).toBe('old')
    expect(result.current.switching).toBe(true)
    expect(result.current.status).toBeUndefined()
    // Frames from the closed socket are ignored.
    act(() => sockets[0].message(frameMessage(4_001, 'stale')))
    expect(result.current.frame?.data).toBe('old')

    // The desktop answers with status, viewport, then frame seq 1.
    act(() => sockets[1].message(windowStatus(43)))
    expect(result.current.status?.window?.id).toBe(43)
    expect(result.current.switching).toBe(true)
    act(() => {
      sockets[1].message(
        JSON.stringify({ type: 'viewport', width: 1280, height: 800 }),
      )
      sockets[1].message(frameMessage(1, 'new'))
    })
    expect(result.current.frame?.data).toBe('new')
    expect(result.current.switching).toBe(false)
    // Later frames of the same socket still keep the newest.
    act(() => {
      sockets[1].message(frameMessage(3, 'newer'))
      sockets[1].message(frameMessage(2, 'late'))
    })
    expect(result.current.frame?.data).toBe('newer')
    // A window target never asks for video.
    expect(
      vi
        .mocked(sockets[1].socket.send)
        .mock.calls.some(([raw]) => String(raw).includes('rtc_start')),
    ).toBe(false)
  })

  it('holds taps and scrolls until the new picture shows, but not keys', async () => {
    const { tunnel, sockets } = switchingTunnel()
    const { result, rerender } = renderHook(
      ({ windowId }: { windowId?: number }) =>
        useRemoteScreen(tunnel, { rtc: false, windowId }),
      { initialProps: { windowId: 42 } as { windowId?: number } },
    )
    act(() => sockets[0].message(frameMessage(10)))
    rerender({ windowId: 43 })
    act(() => result.current.setControl(true))
    const sent = () => vi.mocked(sockets[1].socket.send).mock.calls.length
    act(() => {
      result.current.sendControl({
        type: 'pointer',
        action: 'click',
        x: 0.5,
        y: 0.5,
      })
      result.current.sendControl({
        type: 'scroll',
        x: 0.5,
        y: 0.5,
        dx: 0,
        dy: 4,
      })
    })
    expect(sent()).toBe(0)
    act(() => result.current.sendControl({ type: 'key', key: 'esc' }))
    expect(sent()).toBe(1)
    act(() => sockets[1].message(frameMessage(1)))
    act(() =>
      result.current.sendControl({
        type: 'pointer',
        action: 'click',
        x: 0.5,
        y: 0.5,
      }),
    )
    expect(sent()).toBe(2)
  })
})

describe('wantsVideo', () => {
  it('uses video for the whole screen and JPEG frames for a window', () => {
    expect(wantsVideo({ rtc: true })).toBe(true)
    expect(wantsVideo({ rtc: true, windowId: 3 })).toBe(false)
    expect(wantsVideo({ rtc: true, windowId: 3, windowClosed: true })).toBe(
      true,
    )
    expect(wantsVideo({ rtc: false })).toBe(false)
    expect(wantsVideo({ rtc: false, windowId: 3, windowClosed: true })).toBe(
      false,
    )
  })
})
