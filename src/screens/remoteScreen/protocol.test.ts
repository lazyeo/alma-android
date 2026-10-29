import { describe, expect, it } from 'vitest'
import { decodeScreenMessage, latestFrame } from './protocol'

describe('decodeScreenMessage', () => {
  it('accepts status, frames, rtc, clipboard, and preview messages', () => {
    expect(
      decodeScreenMessage(
        JSON.stringify({
          type: 'status',
          bound: true,
          displayId: 1,
          width: 1512,
          height: 982,
          scale: 2,
          mode: 'jpeg',
        }),
      ),
    ).toMatchObject({ type: 'status', mode: 'jpeg' })
    expect(
      decodeScreenMessage(
        JSON.stringify({
          type: 'frame',
          data: '/9j/',
          width: 1280,
          height: 831,
          seq: 4,
        }),
      ),
    ).toMatchObject({ type: 'frame', seq: 4 })
    expect(
      decodeScreenMessage(JSON.stringify({ type: 'clipboard', text: 'hello' })),
    ).toEqual({ type: 'clipboard', text: 'hello' })
    expect(
      decodeScreenMessage(
        JSON.stringify({ type: 'preview_status', ready: true }),
      ),
    ).toEqual({ type: 'preview_status', ready: true })
  })

  it('ignores malformed and unknown messages', () => {
    expect(decodeScreenMessage('not json')).toBeUndefined()
    expect(
      decodeScreenMessage(JSON.stringify({ type: 'mystery' })),
    ).toBeUndefined()
  })
})

describe('latestFrame', () => {
  const frame = (seq: number) => ({
    type: 'frame' as const,
    data: '/9j/',
    width: 100,
    height: 50,
    seq,
  })

  it('drops stale sequence numbers', () => {
    expect(latestFrame(frame(5), frame(4))).toEqual(frame(5))
    expect(latestFrame(frame(5), frame(6))).toEqual(frame(6))
  })
})
