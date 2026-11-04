// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlmaApi } from '../relay'
import { PERSONAL_AGENT_POLL_MS, usePersonalAgent } from './usePersonalAgent'

const personal = {
  threadId: 'thread-main',
  today: { spentUsd: 0, budgetUsd: null, over: false },
  running: 1,
  pendingApprovals: 0,
}

function fakeApi(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getPersonal: vi.fn().mockResolvedValue({ status: 'ok', personal }),
    getAlmaVitals: vi
      .fn()
      .mockResolvedValue({ status: 'ok', vitals: { mood: 'happy' } }),
    ...overrides,
  } as unknown as AlmaApi & {
    getPersonal: ReturnType<typeof vi.fn>
    getAlmaVitals: ReturnType<typeof vi.fn>
  }
}

let visibility: DocumentVisibilityState = 'visible'
beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const flush = () => act(async () => {})

describe('usePersonalAgent', () => {
  it('loads the overview with mood on mount', async () => {
    const api = fakeApi()
    const { result } = renderHook(() => usePersonalAgent(api))
    expect(result.current.state.status).toBe('loading')
    await flush()
    expect(result.current.state).toEqual({
      status: 'ready',
      personal,
      mood: 'happy',
    })
  })

  it('keeps the row when vitals are unavailable', async () => {
    const api = fakeApi({
      getAlmaVitals: vi.fn().mockRejectedValue(new Error('boom')),
    })
    const { result } = renderHook(() => usePersonalAgent(api))
    await flush()
    expect(result.current.state).toEqual({ status: 'ready', personal })
  })

  it('hides the row on older desktops and stops polling', async () => {
    const api = fakeApi({
      getPersonal: vi.fn().mockResolvedValue({ status: 'unsupported' }),
    })
    const { result } = renderHook(() => usePersonalAgent(api))
    await flush()
    expect(result.current.state.status).toBe('unsupported')
    await act(async () => {
      vi.advanceTimersByTime(PERSONAL_AGENT_POLL_MS * 3)
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(1)
  })

  it('polls no faster than every 30 seconds while visible', async () => {
    expect(PERSONAL_AGENT_POLL_MS).toBeGreaterThanOrEqual(30_000)
    const api = fakeApi()
    renderHook(() => usePersonalAgent(api))
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(PERSONAL_AGENT_POLL_MS - 1)
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(2)
  })

  it('skips polls while hidden and refreshes when visible again', async () => {
    const api = fakeApi()
    renderHook(() => usePersonalAgent(api))
    await flush()
    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      vi.advanceTimersByTime(PERSONAL_AGENT_POLL_MS * 2)
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(1)
    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(2)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(3)
  })

  it('refreshes on demand for pull-to-refresh', async () => {
    const api = fakeApi()
    const { result } = renderHook(() => usePersonalAgent(api))
    await flush()
    await act(async () => {
      await result.current.refresh()
    })
    expect(api.getPersonal).toHaveBeenCalledTimes(2)
  })
})
