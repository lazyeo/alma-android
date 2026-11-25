// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SHOW_HIDDEN_THREADS_KEY,
  loadShowHiddenThreads,
  saveShowHiddenThreads,
  useShowHiddenThreads,
} from './showHiddenThreads'

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}
const broken = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('full')
  },
}

// This jsdom build has no Web Storage; give each test a fresh one.
beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
})

describe('the "Show hidden threads" preference', () => {
  it('is off until chosen, and off when storage is blocked', () => {
    expect(loadShowHiddenThreads(memory())).toBe(false)
    expect(loadShowHiddenThreads(broken)).toBe(false)
  })

  it('round-trips both choices', () => {
    const storage = memory()
    expect(saveShowHiddenThreads(true, storage)).toBe(true)
    expect(loadShowHiddenThreads(storage)).toBe(true)
    saveShowHiddenThreads(false, storage)
    expect(loadShowHiddenThreads(storage)).toBe(false)
  })

  it('reports a choice the store refused', () => {
    expect(saveShowHiddenThreads(true, broken)).toBe(false)
  })

  it('keeps every mounted list on the same choice', () => {
    const threads = renderHook(() => useShowHiddenThreads())
    const gtd = renderHook(() => useShowHiddenThreads())
    expect(threads.result.current[0]).toBe(false)
    act(() => threads.result.current[1](true))
    expect(gtd.result.current[0]).toBe(true)
    expect(localStorage.getItem(SHOW_HIDDEN_THREADS_KEY)).toBe('1')
    expect(renderHook(() => useShowHiddenThreads()).result.current[0]).toBe(
      true,
    )
  })
})
