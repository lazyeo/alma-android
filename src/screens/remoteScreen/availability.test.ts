// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  recallScreenUnavailable,
  rememberScreenUnavailable,
  screenUnavailableFromStatus,
  unavailableCopy,
} from './availability'

describe('screenUnavailableFromStatus', () => {
  it('recognises the desktop refusals', () => {
    expect(
      screenUnavailableFromStatus({
        bound: false,
        error: 'Screen streaming is only available on macOS',
      }),
    ).toEqual({ reason: 'unsupported-os' })
    expect(
      screenUnavailableFromStatus({
        bound: false,
        error: 'The Alma Computer Use helper is not available',
      }),
    ).toEqual({ reason: 'helper-missing' })
  })

  it('keeps unknown refusals verbatim', () => {
    expect(
      screenUnavailableFromStatus({ bound: false, error: 'Display gone' }),
    ).toEqual({ reason: 'other', detail: 'Display gone' })
  })

  it('ignores bound or error-free status', () => {
    expect(screenUnavailableFromStatus(undefined)).toBeUndefined()
    expect(screenUnavailableFromStatus({ bound: true })).toBeUndefined()
    expect(
      screenUnavailableFromStatus({ bound: true, error: 'stale' }),
    ).toBeUndefined()
    expect(screenUnavailableFromStatus({ bound: false })).toBeUndefined()
  })
})

describe('remembered refusals', () => {
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

  it('remembers the reason per desktop and clears it', () => {
    rememberScreenUnavailable('pc', { reason: 'unsupported-os', detail: 'x' })
    expect(recallScreenUnavailable('pc')).toEqual({ reason: 'unsupported-os' })
    expect(recallScreenUnavailable('mac')).toBeUndefined()
    rememberScreenUnavailable('pc', undefined)
    expect(recallScreenUnavailable('pc')).toBeUndefined()
  })

  it('ignores corrupt entries', () => {
    localStorage.setItem('alma.screen.unavailable.pc', '{"reason":"nope"}')
    expect(recallScreenUnavailable('pc')).toBeUndefined()
    localStorage.setItem('alma.screen.unavailable.pc', 'not json')
    expect(recallScreenUnavailable('pc')).toBeUndefined()
  })
})

describe('unavailableCopy', () => {
  it('maps reasons to flat copy keys', () => {
    expect(unavailableCopy('unsupported-os')).toEqual({
      title: 'screen.unavailableTitleUnsupportedOs',
      body: 'screen.unavailableBodyUnsupportedOs',
    })
  })
})
