// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applyNativeInsets, normalizeNativeInsets } from './nativeInsets'

describe('always edge-to-edge native insets', () => {
  it('always exposes normalized native insets to CSS', () => {
    const values = new Map<string, string>()
    const root = {
      style: {
        setProperty: (key: string, value: string) => values.set(key, value),
      },
    } as unknown as HTMLElement
    const state = applyNativeInsets(
      { top: 40, right: 2, bottom: 24, left: 3 },
      { top: 0, right: 0, bottom: 0, left: 0 },
      root,
    )
    expect(state.insets).toEqual({ top: 40, right: 2, bottom: 24, left: 3 })
    expect(values.get('--native-safe-top')).toBe('40px')
    expect(values.get('--native-safe-bottom')).toBe('24px')
  })
})

describe('normalizeNativeInsets', () => {
  it('keeps finite non-negative CSS pixel inset values', () => {
    expect(
      normalizeNativeInsets({ top: 40.4, right: 0, bottom: 24.6, left: 3 }),
    ).toEqual({ top: 40.4, right: 0, bottom: 24.6, left: 3 })
  })

  it('clamps invalid and negative native values to zero', () => {
    expect(
      normalizeNativeInsets({
        top: -1,
        right: Number.NaN,
        bottom: Number.POSITIVE_INFINITY,
        left: -20,
      }),
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
