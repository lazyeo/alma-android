// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { recallInputMode, rememberInputMode } from './inputMode'

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

describe('input mode preference', () => {
  it('defaults to direct touch', () => {
    expect(recallInputMode('mac-1')).toBe('direct')
  })

  it('is remembered per desktop', () => {
    rememberInputMode('mac-1', 'trackpad')
    expect(recallInputMode('mac-1')).toBe('trackpad')
    expect(recallInputMode('mac-2')).toBe('direct')
    rememberInputMode('mac-1', 'direct')
    expect(recallInputMode('mac-1')).toBe('direct')
  })

  it('ignores unknown stored values', () => {
    localStorage.setItem('alma.screen.inputMode.mac-1', 'joystick')
    expect(recallInputMode('mac-1')).toBe('direct')
  })
})
