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

  it('keeps the reason when the desktop refuses to stream', () => {
    expect(
      decodeScreenMessage(
        JSON.stringify({
          type: 'status',
          bound: false,
          displayId: 1,
          width: 1920,
          height: 1080,
          scale: 1,
          mode: 'jpeg',
          error: 'Screen streaming is only available on macOS',
        }),
      ),
    ).toMatchObject({
      bound: false,
      error: 'Screen streaming is only available on macOS',
    })
    expect(
      decodeScreenMessage(
        JSON.stringify({ type: 'status', bound: false, error: 'nope' }),
      ),
    ).toMatchObject({ type: 'status', bound: false, error: 'nope' })
  })

  it('ignores malformed and unknown messages', () => {
    expect(decodeScreenMessage('not json')).toBeUndefined()
    expect(
      decodeScreenMessage(JSON.stringify({ type: 'mystery' })),
    ).toBeUndefined()
  })
})

describe('screen targets in messages', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='
  const decode = (value: unknown) => decodeScreenMessage(JSON.stringify(value))
  const baseStatus = {
    type: 'status',
    bound: true,
    displayId: 1,
    width: 1512,
    height: 982,
    scale: 2,
    mode: 'jpeg',
  }

  it('decodes the displays in status and drops bad entries', () => {
    expect(
      decode({
        ...baseStatus,
        displays: [
          {
            id: 1,
            name: 'Built-in',
            width: 1512,
            height: 982,
            scale: 2,
            primary: true,
          },
          { id: 2, width: 'wide', primary: 'yes' },
          { id: -1, name: 'negative' },
          { name: 'no id' },
          null,
        ],
      }),
    ).toMatchObject({
      displays: [
        {
          id: 1,
          name: 'Built-in',
          width: 1512,
          height: 982,
          scale: 2,
          primary: true,
        },
        { id: 2, name: '', width: 0, height: 0, scale: 1, primary: false },
      ],
    })
    expect(decode({ ...baseStatus, displays: [] })).toMatchObject({
      displays: undefined,
    })
    expect(decode({ ...baseStatus, displays: 'all' })).toMatchObject({
      displays: undefined,
    })
  })

  it('decodes window support, the streamed window, windowClosed and locked', () => {
    expect(
      decode({
        ...baseStatus,
        windows: true,
        window: { id: 42, app: 'Safari', title: 'Docs', bundleId: 7 },
        windowClosed: false,
        locked: true,
      }),
    ).toMatchObject({
      windows: true,
      window: { id: 42, app: 'Safari', title: 'Docs', bundleId: undefined },
      windowClosed: false,
      locked: true,
    })
    expect(
      decode({ ...baseStatus, windowClosed: true, window: null }),
    ).toMatchObject({ windowClosed: true, window: undefined })
    // Only literal `true` counts; a window id of 0 is no window.
    expect(
      decode({
        ...baseStatus,
        windows: 'yes',
        windowClosed: 1,
        locked: 'true',
        window: { id: 0 },
      }),
    ).toMatchObject({
      windows: false,
      windowClosed: false,
      locked: false,
      window: undefined,
    })
  })

  it('keeps the target fields on a refusal', () => {
    expect(
      decode({
        type: 'status',
        bound: false,
        error: 'Screen is locked',
        locked: true,
        windows: true,
      }),
    ).toMatchObject({ bound: false, locked: true, windows: true })
  })

  it('decodes the windows reply', () => {
    expect(
      decode({
        type: 'windows',
        windows: [
          {
            id: 7,
            app: 'Safari',
            bundleId: 'com.apple.Safari',
            title: 'Docs',
            width: 800,
            height: 600,
            displayId: 1,
            focused: true,
            icon: PNG,
          },
          { id: 8, width: 300, height: 200, focused: 'yes', displayId: -2 },
          { id: 0, app: 'Desktop' },
          { app: 'No id' },
        ],
      }),
    ).toEqual({
      type: 'windows',
      windows: [
        {
          id: 7,
          app: 'Safari',
          bundleId: 'com.apple.Safari',
          title: 'Docs',
          width: 800,
          height: 600,
          displayId: 1,
          focused: true,
          icon: PNG,
        },
        {
          id: 8,
          app: undefined,
          bundleId: undefined,
          title: undefined,
          width: 300,
          height: 200,
          displayId: undefined,
          focused: false,
          icon: undefined,
        },
      ],
    })
  })

  it('keeps the error of a windows reply from a desktop that is not macOS', () => {
    expect(
      decode({
        type: 'windows',
        windows: [],
        error: 'Window capture is only available on macOS',
      }),
    ).toEqual({
      type: 'windows',
      windows: [],
      error: 'Window capture is only available on macOS',
    })
    expect(decode({ type: 'windows', error: 'unsupported' })).toEqual({
      type: 'windows',
      windows: [],
      error: 'unsupported',
    })
    expect(decode({ type: 'windows', windows: 'x', error: 5 })).toEqual({
      type: 'windows',
      windows: [],
    })
  })

  it('accepts only inline data:image icons', () => {
    const icon = (value: unknown) => {
      const message = decode({
        type: 'windows',
        windows: [{ id: 1, app: 'A', width: 10, height: 10, icon: value }],
      })
      return message?.type === 'windows' ? message.windows[0].icon : 'missing'
    }
    expect(icon(PNG)).toBe(PNG)
    expect(icon('data:image/svg+xml;base64,PHN2Zz4=')).toBe(
      'data:image/svg+xml;base64,PHN2Zz4=',
    )
    expect(icon('https://example.com/icon.png')).toBeUndefined()
    expect(icon('//example.com/icon.png')).toBeUndefined()
    expect(icon('data:text/html;base64,PGI+')).toBeUndefined()
    expect(icon('data:image/png,raw')).toBeUndefined()
    expect(icon('javascript:alert(1)')).toBeUndefined()
    expect(icon(42)).toBeUndefined()
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
