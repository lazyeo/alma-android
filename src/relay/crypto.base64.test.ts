import { afterEach, describe, expect, it } from 'vitest'
import { fromBase64url, base64url } from './crypto'

const native = (Uint8Array as unknown as { fromBase64?: unknown }).fromBase64

describe('fromBase64url', () => {
  afterEach(() => {
    ;(Uint8Array as unknown as { fromBase64?: unknown }).fromBase64 = native
  })

  const sample = Uint8Array.from(
    { length: 1027 },
    (_, index) => (index * 37) % 256,
  )

  it('round-trips through the native decoder when present', () => {
    expect(Array.from(fromBase64url(base64url(sample)))).toEqual(
      Array.from(sample),
    )
  })

  it('round-trips through the loop fallback', () => {
    ;(Uint8Array as unknown as { fromBase64?: unknown }).fromBase64 = undefined
    for (const length of [0, 1, 2, 3, 64]) {
      const bytes = sample.slice(0, length)
      expect(Array.from(fromBase64url(base64url(bytes)))).toEqual(
        Array.from(bytes),
      )
    }
  })
})
