import { describe, expect, it } from 'vitest'
import {
  formatVoiceClock,
  isVoiceLikePart,
  parseVoiceNote,
  voiceNotePath,
} from './voiceNote'

// The probe message the desktop (0.4.567) stored for a send-voice upload.
const desktopVoice = {
  url: '/api/gallery/cache/attachment-1ee631d8794e4aa9.m4a',
  mediaType: 'audio/mp4',
  durationMs: 1421,
  waveform: [0.085, 0.214, 0.267],
}

describe('parseVoiceNote', () => {
  it('reads the desktop voice shape', () => {
    expect(parseVoiceNote({ voice: desktopVoice })).toEqual({
      kind: 'playable',
      voice: {
        path: '/api/gallery/cache/attachment-1ee631d8794e4aa9.m4a',
        mediaType: 'audio/mp4',
        durationMs: 1421,
        waveform: [0.085, 0.214, 0.267],
      },
    })
  })

  it('is none for rows without a voice', () => {
    expect(parseVoiceNote(undefined)).toEqual({ kind: 'none' })
    expect(parseVoiceNote({ reactions: [] })).toEqual({ kind: 'none' })
    expect(parseVoiceNote({ voice: null })).toEqual({ kind: 'none' })
  })

  it('keeps a voice with missing optional fields playable', () => {
    expect(
      parseVoiceNote({ voice: { url: '/api/gallery/cache/voice.m4a' } }),
    ).toEqual({
      kind: 'playable',
      voice: {
        path: '/api/gallery/cache/voice.m4a',
        mediaType: undefined,
        durationMs: 0,
        waveform: [],
      },
    })
  })

  it('clamps bad numbers instead of trusting them', () => {
    const state = parseVoiceNote({
      voice: {
        ...desktopVoice,
        mediaType: 'Audio/MP4; codecs=mp4a',
        durationMs: 9e9,
        waveform: [2, -1, 'x', Number.NaN, 0.5],
      },
    })
    expect(state).toMatchObject({
      kind: 'playable',
      voice: {
        mediaType: 'audio/mp4',
        durationMs: 30 * 60 * 1000,
        waveform: [1, 0, 0, 0, 0.5],
      },
    })
    expect(
      parseVoiceNote({ voice: { ...desktopVoice, durationMs: -5 } }),
    ).toMatchObject({ voice: { durationMs: 0 } })
  })

  it('ignores a declared type that is not audio', () => {
    expect(
      parseVoiceNote({ voice: { ...desktopVoice, mediaType: 'text/html' } }),
    ).toMatchObject({ kind: 'playable', voice: { mediaType: undefined } })
  })

  it('downsamples an over-long waveform to 64 peaks', () => {
    const waveform = Array.from({ length: 640 }, (_, index) =>
      index % 10 === 3 ? 1 : 0.1,
    )
    const state = parseVoiceNote({ voice: { ...desktopVoice, waveform } })
    if (state.kind !== 'playable') throw new Error('expected playable')
    expect(state.voice.waveform).toHaveLength(64)
    expect(state.voice.waveform.every((level) => level === 1)).toBe(true)
  })

  it('marks voices it cannot safely fetch as unsupported', () => {
    for (const voice of [
      'voice.m4a',
      {},
      { url: 42 },
      { url: 'https://example.com/api/gallery/cache/a.m4a' },
      { url: '/api/files-abs-binary?path=/etc/passwd' },
      { url: '/api/gallery/cache/../secrets' },
      { url: '/api/gallery/cache/' },
    ])
      expect(parseVoiceNote({ voice })).toEqual({ kind: 'unsupported' })
  })
})

describe('voiceNotePath', () => {
  it('reduces desktop-local absolute URLs to the tunnel path', () => {
    expect(
      voiceNotePath('http://localhost:23001/api/gallery/cache/a.m4a'),
    ).toBe('/api/gallery/cache/a.m4a')
    // Any desktop port, matching the desktop's own sanitizer.
    expect(
      voiceNotePath('http://127.0.0.1:9999/api/gallery/cache/a.m4a#t'),
    ).toBe('/api/gallery/cache/a.m4a')
    expect(voiceNotePath('/api/gallery/cache/a.m4a?v=2')).toBe(
      '/api/gallery/cache/a.m4a',
    )
  })

  it('rejects foreign hosts and other routes', () => {
    expect(
      voiceNotePath('http://192.168.1.2:23001/api/gallery/cache/a.m4a'),
    ).toBe(undefined)
    expect(voiceNotePath('/api/attachments/a.m4a')).toBe(undefined)
    expect(voiceNotePath(`/api/gallery/cache/${'a'.repeat(600)}`)).toBe(
      undefined,
    )
  })
})

describe('formatVoiceClock', () => {
  it('formats m:ss', () => {
    expect(formatVoiceClock(0)).toBe('0:00')
    expect(formatVoiceClock(1421)).toBe('0:01')
    expect(formatVoiceClock(65_000)).toBe('1:05')
    expect(formatVoiceClock(30 * 60 * 1000)).toBe('30:00')
    expect(formatVoiceClock(Number.NaN)).toBe('0:00')
    expect(formatVoiceClock(-1)).toBe('0:00')
  })
})

describe('isVoiceLikePart', () => {
  it('spots audio-looking parts', () => {
    expect(isVoiceLikePart({ type: 'voice' })).toBe(true)
    expect(isVoiceLikePart({ type: 'audio-note' })).toBe(true)
    expect(isVoiceLikePart({ type: 'clip', mediaType: 'audio/ogg' })).toBe(true)
    expect(isVoiceLikePart({ type: 'chart' })).toBe(false)
  })
})
