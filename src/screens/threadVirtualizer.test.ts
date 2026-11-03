import { describe, expect, it } from 'vitest'
import { initialThreadOverscan } from './threadVirtualizer'

describe('initialThreadOverscan', () => {
  it('stages a normal thread open with minimal overscan', () => {
    expect(initialThreadOverscan(false)).toBe(1)
  })

  it('keeps search jumps at normal overscan', () => {
    expect(initialThreadOverscan(true)).toBe(5)
  })
})
