// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inputModeKey, loadInputMode, saveInputMode } from './inputMode'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

describe('input mode', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('starts on the keyboard', () => {
    expect(loadInputMode('alma')).toBe('keyboard')
    expect(loadInputMode('herdr')).toBe('keyboard')
  })

  it('remembers each surface separately', () => {
    saveInputMode('alma', 'voice')
    expect(loadInputMode('alma')).toBe('voice')
    expect(loadInputMode('herdr')).toBe('keyboard')
    saveInputMode('herdr', 'voice')
    saveInputMode('alma', 'keyboard')
    expect(loadInputMode('alma')).toBe('keyboard')
    expect(loadInputMode('herdr')).toBe('voice')
  })

  it('ignores unknown values and unavailable storage', () => {
    localStorage.setItem(inputModeKey('alma'), 'shout')
    expect(loadInputMode('alma')).toBe('keyboard')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadInputMode('alma')).toBe('keyboard')
    expect(() => saveInputMode('alma', 'voice')).not.toThrow()
  })
})
