// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TunnelSocket } from '../../relay'
import { useRemoteScreen } from './useRemoteScreen'

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
})
