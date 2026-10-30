// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  recallDesktopPlatform,
  rememberDesktopPlatform,
  toDesktopPlatform,
} from './platform'

describe('desktop platform', () => {
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

  it('normalises process.platform values', () => {
    expect(toDesktopPlatform('darwin')).toBe('darwin')
    expect(toDesktopPlatform('win32')).toBe('win32')
    expect(toDesktopPlatform('linux')).toBe('linux')
    expect(toDesktopPlatform('freebsd')).toBe('other')
    expect(toDesktopPlatform('')).toBeUndefined()
    expect(toDesktopPlatform(undefined)).toBeUndefined()
  })

  it('remembers the platform per desktop', () => {
    rememberDesktopPlatform('pc', 'win32')
    expect(recallDesktopPlatform('pc')).toBe('win32')
    expect(recallDesktopPlatform('mac')).toBeUndefined()
  })
})
