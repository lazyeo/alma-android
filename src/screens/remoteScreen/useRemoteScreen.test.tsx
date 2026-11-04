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
