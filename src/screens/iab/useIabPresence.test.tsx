// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IAB_POLL_MS,
  markIabUnsupported,
  resetIabPresenceForTests,
  useIabPresence,
} from './useIabPresence'

afterEach(() => {
  vi.useRealTimers()
  resetIabPresenceForTests()
})

const flush = () => act(async () => undefined)

const statusApi = (targets: { workspaceId: string }[]) => ({
  getIabStatus: vi.fn(async () => ({
    supported: true as const,
    status: { targets },
  })),
})

describe('useIabPresence', () => {
  it('stays hidden until the desktop answers, then shows the entry', async () => {
    const api = statusApi([])
    const { result } = renderHook(() =>
      useIabPresence(api, 'desk', 'w1', false),
    )
    expect(result.current).toEqual({ supported: false, active: false })
    await flush()
    expect(result.current).toEqual({ supported: true, active: false })
  })

  it("is active when the thread's workspace has a browser open", async () => {
    const api = statusApi([{ workspaceId: 'w1' }])
    const { result } = renderHook(() =>
      useIabPresence(api, 'desk', 'w1', false),
    )
    await flush()
    expect(result.current).toEqual({ supported: true, active: true })
  })

  it('hides everything on a desktop without the browser', async () => {
    const api = {
      getIabStatus: vi.fn(async () => ({ supported: false as const })),
    }
    const { result } = renderHook(() => useIabPresence(api, 'desk', 'w1', true))
    await flush()
    expect(result.current).toEqual({ supported: false, active: false })
  })

  it('does not ask a desktop already found unsupported this session', async () => {
    markIabUnsupported('desk')
    const api = statusApi([{ workspaceId: 'w1' }])
    const { result } = renderHook(() => useIabPresence(api, 'desk', 'w1', true))
    await flush()
    expect(api.getIabStatus).not.toHaveBeenCalled()
    expect(result.current.supported).toBe(false)
  })

  it('polls while Alma is replying and checks once more when it stops', async () => {
    vi.useFakeTimers()
    const api = statusApi([])
    const { rerender } = renderHook(
      ({ generating }) => useIabPresence(api, 'desk', 'w1', generating),
      { initialProps: { generating: true } },
    )
    await flush()
    expect(api.getIabStatus).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(IAB_POLL_MS)
    })
    expect(api.getIabStatus).toHaveBeenCalledTimes(2)
    rerender({ generating: false })
    await flush()
    expect(api.getIabStatus).toHaveBeenCalledTimes(3)
    await act(async () => {
      vi.advanceTimersByTime(IAB_POLL_MS * 3)
    })
    expect(api.getIabStatus).toHaveBeenCalledTimes(3)
  })

  it('keeps the last answer when a check fails', async () => {
    const api = statusApi([{ workspaceId: 'w1' }])
    const { result, rerender } = renderHook(
      ({ generating }) => useIabPresence(api, 'desk', 'w1', generating),
      { initialProps: { generating: true } },
    )
    await flush()
    api.getIabStatus.mockRejectedValueOnce(new Error('offline'))
    rerender({ generating: false })
    await flush()
    expect(result.current).toEqual({ supported: true, active: true })
  })
})
