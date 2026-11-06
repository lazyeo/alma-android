import { describe, expect, it } from 'vitest'
import {
  addressText,
  decodeIabMessage,
  iabSocketPath,
  iabWorkspaceKey,
  pagePoint,
  pageScroll,
  threadBrowserOpen,
} from './protocol'

const decode = (value: unknown) => decodeIabMessage(JSON.stringify(value))

describe('decodeIabMessage', () => {
  it('reads a bound status with the page fields', () => {
    expect(
      decode({
        type: 'status',
        bound: true,
        url: 'http://localhost:5173/',
        title: 'Dev',
        loading: false,
      }),
    ).toEqual({
      type: 'status',
      bound: true,
      url: 'http://localhost:5173/',
      title: 'Dev',
      loading: false,
    })
  })

  it('reads an unbound status, with or without an error', () => {
    expect(decode({ type: 'status', bound: false })).toEqual({
      type: 'status',
      bound: false,
      url: '',
      title: '',
      loading: false,
    })
    expect(
      decode({ type: 'status', bound: false, error: 'No target' }),
    ).toMatchObject({ bound: false, error: 'No target' })
  })

  it('reads page, tabs and viewport updates', () => {
    expect(
      decode({
        type: 'page',
        url: 'https://a.test/',
        title: '',
        loading: true,
      }),
    ).toEqual({
      type: 'page',
      url: 'https://a.test/',
      title: '',
      loading: true,
    })
    expect(
      decode({
        type: 'tabs',
        activeId: 't2',
        tabs: [
          {
            id: 't1',
            url: 'https://a.test/',
            title: 'A',
            loading: false,
            pinned: true,
            agent: false,
          },
          { id: 't2', url: 'https://b.test/', agent: true },
          { url: 'no id' },
          null,
        ],
      }),
    ).toEqual({
      type: 'tabs',
      activeId: 't2',
      tabs: [
        {
          id: 't1',
          url: 'https://a.test/',
          title: 'A',
          loading: false,
          pinned: true,
          agent: false,
        },
        {
          id: 't2',
          url: 'https://b.test/',
          title: '',
          loading: false,
          pinned: false,
          agent: true,
        },
      ],
    })
    expect(decode({ type: 'viewport', width: 1024, height: 700 })).toEqual({
      type: 'viewport',
      width: 1024,
      height: 700,
    })
  })

  it('reads frames, errors and the WebRTC signalling', () => {
    expect(
      decode({ type: 'frame', data: '/9j/', width: 1024, height: 700, seq: 3 }),
    ).toEqual({ type: 'frame', data: '/9j/', width: 1024, height: 700, seq: 3 })
    expect(decode({ type: 'error', message: 'boom' })).toEqual({
      type: 'error',
      message: 'boom',
    })
    expect(decode({ type: 'rtc', state: 'unavailable' })).toEqual({
      type: 'rtc',
      state: 'unavailable',
    })
    expect(
      decode({
        type: 'rtc_offer',
        sdp: 'v=0',
        iceServers: [{ urls: 'stun:x' }],
      }),
    ).toEqual({
      type: 'rtc_offer',
      sdp: 'v=0',
      iceServers: [{ urls: 'stun:x' }],
    })
    expect(decode({ type: 'rtc_ice', candidate: { candidate: 'c' } })).toEqual({
      type: 'rtc_ice',
      candidate: { candidate: 'c' },
    })
  })

  it('drops malformed and unknown messages', () => {
    expect(decodeIabMessage('not json')).toBeUndefined()
    expect(decode(null)).toBeUndefined()
    expect(decode({ type: 'status' })).toBeUndefined()
    expect(decode({ type: 'frame', data: 1 })).toBeUndefined()
    expect(decode({ type: 'viewport', width: 'x', height: 1 })).toBeUndefined()
    expect(decode({ type: 'rtc_offer' })).toBeUndefined()
    expect(decode({ type: 'mystery' })).toBeUndefined()
  })
})

describe('iabSocketPath', () => {
  it('names the thread, encoded', () => {
    expect(iabSocketPath('abc')).toBe('/ws/iab/abc')
    expect(iabSocketPath('a/b c')).toBe('/ws/iab/a%2Fb%20c')
  })
})

describe('iabWorkspaceKey', () => {
  it('is the artifact workspace when the thread keeps artifacts, else its workspace', () => {
    expect(iabWorkspaceKey({ workspaceId: 'w1' })).toBe('w1')
    expect(
      iabWorkspaceKey({
        workspaceId: 'w1',
        enableArtifacts: true,
        artifactWorkspaceId: 'art',
      }),
    ).toBe('art')
    expect(
      iabWorkspaceKey({
        workspaceId: 'w1',
        enableArtifacts: false,
        artifactWorkspaceId: 'art',
      }),
    ).toBe('w1')
    expect(iabWorkspaceKey({})).toBeUndefined()
  })
})

describe('threadBrowserOpen', () => {
  const status = {
    targets: [
      { workspaceId: 'w1', url: 'https://a.test/' },
      { workspaceId: 'w2', url: 'about:blank' },
    ],
  }
  it("is true when the thread's workspace has a live browser", () => {
    expect(threadBrowserOpen(status, 'w1')).toBe(true)
    expect(threadBrowserOpen(status, 'w3')).toBe(false)
    expect(threadBrowserOpen(status, undefined)).toBe(false)
  })
  it('tolerates a malformed reply', () => {
    expect(threadBrowserOpen(undefined, 'w1')).toBe(false)
    expect(threadBrowserOpen({ targets: 'x' }, 'w1')).toBe(false)
    expect(threadBrowserOpen({ targets: [null, 3] }, 'w1')).toBe(false)
  })
})

describe('pagePoint', () => {
  it('maps a 0..1 point onto the page viewport in whole CSS pixels', () => {
    expect(
      pagePoint({ x: 0.5, y: 0.25 }, { width: 1024, height: 700 }),
    ).toEqual({ x: 512, y: 175 })
    expect(pagePoint({ x: 1, y: 1 }, { width: 1001, height: 701 })).toEqual({
      x: 1000,
      y: 700,
    })
  })
})

describe('pageScroll', () => {
  it('turns a finger movement into the opposite wheel delta in page pixels', () => {
    const viewport = { width: 1024, height: 700 }
    // A finger moving up a tenth of the picture scrolls down a tenth.
    expect(pageScroll({ x: 0, y: -0.1 }, viewport)).toEqual({ dx: 0, dy: 70 })
    expect(pageScroll({ x: 0.25, y: 0 }, viewport)).toEqual({
      dx: -256,
      dy: 0,
    })
  })
})

describe('addressText', () => {
  it('shows nothing for a blank page', () => {
    expect(addressText('about:blank')).toBe('')
    expect(addressText('')).toBe('')
    expect(addressText('https://a.test/')).toBe('https://a.test/')
  })
})
