// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  recallTrackpadHintSeen,
  rememberTrackpadHintSeen,
} from './trackpadHint'

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

describe('trackpad hint', () => {
  it('shows until it has been used once', () => {
    expect(recallTrackpadHintSeen()).toBe(false)
    rememberTrackpadHintSeen()
    expect(recallTrackpadHintSeen()).toBe(true)
  })
})
