import { describe, expect, it } from 'vitest'
import { FRAME_STALL_MS, isDarkSample, isFrameStalled } from './liveness'

describe('isFrameStalled', () => {
  it('waits for the first frame before judging', () => {
    expect(isFrameStalled(undefined, 10_000)).toBe(false)
  })
  it('flags a gap longer than the stall window', () => {
    expect(isFrameStalled(0, FRAME_STALL_MS)).toBe(false)
    expect(isFrameStalled(0, FRAME_STALL_MS + 1)).toBe(true)
  })
})

describe('isDarkSample', () => {
  it('treats an all-black frame as dark', () => {
    expect(isDarkSample([0, 0, 0, 255, 5, 8, 3, 255])).toBe(true)
  })
  it('any visible pixel means the screen is on', () => {
    expect(isDarkSample([0, 0, 0, 255, 40, 40, 40, 255])).toBe(false)
  })
  it('an empty sample is not dark', () => {
    expect(isDarkSample([])).toBe(false)
  })
})
