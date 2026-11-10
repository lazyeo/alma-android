import { describe, expect, it } from 'vitest'
import {
  buildTranscriptionRequest,
  httpErrorKind,
  parseTranscription,
  transcriptionUrl,
} from './openaiCompat'
import {
  DEFAULT_ENGINE_ID,
  keyIdOf,
  keyUrlsOf,
  PRESETS,
  presetById,
  validBaseUrl,
} from './presets'
import {
  applySonioxTokens,
  buildSonioxConfig,
  EMPTY_TRANSCRIPT,
  parseSonioxMessage,
  transcriptText,
  type SonioxTranscript,
} from './soniox'
import {
  buildTermsPrompt,
  DEFAULT_TERMS,
  formatTerms,
  MAX_TERMS,
  parseTerms,
} from './terms'

const openai = presetById('openai')!
const soniox = presetById('soniox-rt')!

describe('presets', () => {
  it('defaults to Soniox real-time, then Soniox async and the OpenAI fallback', () => {
    expect(DEFAULT_ENGINE_ID).toBe('soniox-rt')
    expect(PRESETS.slice(0, 3).map((preset) => preset.id)).toEqual([
      'soniox-rt',
      'soniox-async',
      'openai',
    ])
    expect(presetById('soniox-async')).toMatchObject({
      kind: 'soniox-async',
      baseUrl: 'https://api.soniox.com/v1',
      model: 'stt-async-v6',
    })
    expect(openai.model).toBe('gpt-transcribe')
    expect(openai.models).toEqual([
      'gpt-transcribe',
      'gpt-4o-mini-transcribe',
      'whisper-1',
    ])
  })

  it('shares one key across both Soniox engines and nowhere else', () => {
    const sonioxUrls = [
      'wss://stt-rt.soniox.com/transcribe-websocket',
      'https://api.soniox.com/v1',
    ]
    for (const id of ['soniox-rt', 'soniox-async']) {
      expect(keyIdOf(presetById(id)!)).toBe('soniox')
      expect(keyUrlsOf(presetById(id)!)).toEqual(sonioxUrls)
    }
    for (const preset of PRESETS.filter((p) => !p.id.startsWith('soniox'))) {
      expect(keyIdOf(preset)).toBe(preset.id)
      expect(keyUrlsOf(preset)).toEqual([preset.baseUrl])
    }
  })

  it('has unique ids and valid endpoints for every non-custom preset', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    for (const preset of PRESETS.filter((p) => !p.custom)) {
      expect(validBaseUrl(preset.baseUrl)).toBe(true)
      expect(preset.models[0]).toBe(preset.model)
    }
    expect(soniox.baseUrl.startsWith('wss://')).toBe(true)
  })

  it('accepts only https and wss endpoints', () => {
    expect(validBaseUrl('https://api.example.com/v1')).toBe(true)
    expect(validBaseUrl('https://192.168.1.20:8000/v1')).toBe(true)
    expect(validBaseUrl('http://192.168.1.20:8000/v1')).toBe(false)
    expect(validBaseUrl('http://localhost:9000/v1')).toBe(false)
    expect(validBaseUrl('http://api.example.com/v1')).toBe(false)
    expect(validBaseUrl('https://user:pass@api.example.com')).toBe(false)
    expect(validBaseUrl('https://api.example.com/v1?x=1')).toBe(false)
    expect(validBaseUrl('ftp://api.example.com')).toBe(false)
    expect(validBaseUrl('not a url')).toBe(false)
  })
})

describe('terms', () => {
  it('ships generic defaults', () => {
    expect(DEFAULT_TERMS).toContain('Herdr')
    expect(DEFAULT_TERMS).toContain('WebSocket')
  })

  it('parses lines and commas, trims and drops duplicates', () => {
    expect(
      parseTerms(' Alma \nherdr, Herdr，Codex、 \n\n  web  socket '),
    ).toEqual(['Alma', 'herdr', 'Codex', 'web socket'])
    expect(formatTerms(['A', 'B'])).toBe('A\nB')
  })

  it('caps the list', () => {
    const many = Array.from({ length: MAX_TERMS + 20 }, (_, i) => `t${i}`)
    expect(parseTerms(many.join('\n'))).toHaveLength(MAX_TERMS)
  })

  it('builds the batch prompt', () => {
    expect(buildTermsPrompt(['A', 'B', 'C'])).toBe(
      'Mixed Chinese and English dev talk. Terms: A, B, C.',
    )
    expect(buildTermsPrompt([])).toBe('Mixed Chinese and English dev talk.')
    const long = Array.from({ length: 100 }, (_, i) => `term-number-${i}`)
    expect(buildTermsPrompt(long).length).toBeLessThan(700)
  })
})

describe('openai-compatible batch', () => {
  it('posts multipart file+model with a term prompt to /audio/transcriptions', () => {
    expect(
      buildTranscriptionRequest({ ...openai, baseUrl: 'https://x.test/v1//' }, [
        'Alma',
        'Herdr',
      ]),
    ).toEqual({
      engineId: 'openai',
      url: 'https://x.test/v1/audio/transcriptions',
      fields: {
        model: 'gpt-transcribe',
        response_format: 'json',
        prompt: 'Mixed Chinese and English dev talk. Terms: Alma, Herdr.',
      },
      fileField: 'file',
    })
    expect(transcriptionUrl(' https://a.test/v1 ')).toBe(
      'https://a.test/v1/audio/transcriptions',
    )
  })

  it('never carries a key in the request spec', () => {
    const spec = JSON.stringify(buildTranscriptionRequest(openai, ['Alma']))
    expect(spec).not.toMatch(/authorization|bearer|api_key/i)
  })

  it('returns trimmed text', () => {
    expect(parseTranscription(200, '{"text":"  你好 Alma \\n"}')).toEqual({
      ok: true,
      text: '你好 Alma',
    })
  })

  it('classifies failures', () => {
    expect(parseTranscription(200, '{"text":"  "}')).toEqual({
      ok: false,
      error: { kind: 'empty' },
    })
    expect(parseTranscription(200, 'oops')).toEqual({
      ok: false,
      error: { kind: 'server', detail: 'no text' },
    })
    expect(
      parseTranscription(401, '{"error":{"message":"Incorrect API key"}}'),
    ).toEqual({
      ok: false,
      error: { kind: 'auth', detail: 'HTTP 401: Incorrect API key' },
    })
    expect(parseTranscription(503, '<html>')).toEqual({
      ok: false,
      error: { kind: 'server', detail: 'HTTP 503' },
    })
    expect(httpErrorKind(429)).toBe('rate_limited')
    expect(httpErrorKind(402)).toBe('rate_limited')
    expect(httpErrorKind(400)).toBe('bad_request')
    expect(httpErrorKind(408)).toBe('timeout')
  })
})

describe('soniox real-time', () => {
  it('builds the config frame without a key', () => {
    expect(buildSonioxConfig(soniox, ['Alma', 'Herdr'])).toEqual({
      model: 'stt-rt-v6',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      num_channels: 1,
      language_hints: ['zh', 'en'],
      context: { terms: ['Alma', 'Herdr'] },
    })
    expect(buildSonioxConfig(soniox, [])).not.toHaveProperty('context')
    expect(buildSonioxConfig(soniox, ['A'])).not.toHaveProperty('api_key')
  })

  it('drops marker tokens and keeps the final flag', () => {
    expect(
      parseSonioxMessage(
        JSON.stringify({
          tokens: [
            { text: '你好', is_final: true },
            { text: '<end>', is_final: true },
            { text: ' wor', is_final: false },
            { text: 3 },
            null,
          ],
        }),
      ),
    ).toEqual({
      type: 'tokens',
      tokens: [
        { text: '你好', isFinal: true },
        { text: ' wor', isFinal: false },
      ],
      finished: false,
    })
  })

  it('reports errors', () => {
    expect(
      parseSonioxMessage(
        '{"error_code":401,"error_message":"Invalid API key"}',
      ),
    ).toEqual({
      type: 'error',
      error: { kind: 'auth', detail: '401: Invalid API key' },
    })
    expect(parseSonioxMessage('{"error_code":503}')).toEqual({
      type: 'error',
      error: { kind: 'server', detail: '503' },
    })
    expect(parseSonioxMessage('nope').type).toBe('error')
    expect(parseSonioxMessage('[]').type).toBe('error')
  })

  it('accumulates finals and replaces the tail', () => {
    const feed = (state: SonioxTranscript, raw: object) => {
      const message = parseSonioxMessage(JSON.stringify(raw))
      if (message.type !== 'tokens') throw new Error('unexpected')
      return applySonioxTokens(state, message)
    }
    let state = feed(EMPTY_TRANSCRIPT, {
      tokens: [
        { text: '打开', is_final: true },
        { text: ' Her', is_final: false },
      ],
    })
    expect(state).toEqual({ final: '打开', tail: ' Her', finished: false })
    state = feed(state, {
      tokens: [
        { text: ' Herdr', is_final: true },
        { text: ' 面', is_final: false },
        { text: '板', is_final: false },
      ],
    })
    expect(state).toEqual({
      final: '打开 Herdr',
      tail: ' 面板',
      finished: false,
    })
    expect(transcriptText(state)).toBe('打开 Herdr 面板')
    state = feed(state, {
      tokens: [
        { text: ' 面板', is_final: true },
        { text: '<fin>', is_final: true },
      ],
    })
    expect(state.tail).toBe('')
    state = feed(state, { tokens: [], finished: true })
    expect(state).toEqual({
      final: '打开 Herdr 面板',
      tail: '',
      finished: true,
    })
    expect(transcriptText(state)).toBe('打开 Herdr 面板')
  })
})
