import { describe, expect, it, vi } from 'vitest'
import {
  DictationSession,
  FINISH_TIMEOUT_MS,
  nativeError,
  type DictationState,
} from './dictationSession'
import type { SpeechPlugin } from './nativeSpeech'
import { presetById } from './presets'

type Listener = (event: any) => void

function fakeSpeech(overrides: Partial<SpeechPlugin> = {}) {
  const listeners = new Map<string, Set<Listener>>()
  const speech = {
    checkMicPermission: vi.fn(async () => ({ mic: 'granted' as const })),
    requestMicPermission: vi.fn(async () => ({ mic: 'granted' as const })),
    setKey: vi.fn(async () => undefined),
    keyStatus: vi.fn(async () => ({ set: true, last4: 'abcd' })),
    deleteKey: vi.fn(async () => undefined),
    startRecording: vi.fn(async () => undefined),
    stopRecording: vi.fn(async () => ({ durationMs: 2000 })),
    cancelRecording: vi.fn(async () => undefined),
    transcribe: vi.fn(async () => ({
      status: 200,
      body: '{"text":"你好 Alma"}',
    })),
    request: vi.fn(async () => ({ status: 200, body: '{}' })),
    startStream: vi.fn(async () => undefined),
    stopStream: vi.fn(async () => undefined),
    cancelStream: vi.fn(async () => undefined),
    addListener: vi.fn(async (name: string, listener: Listener) => {
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
      return { remove: async () => void set.delete(listener) }
    }),
    ...overrides,
  }
  const fire = (name: string, event: unknown) => {
    for (const listener of listeners.get(name) ?? []) listener(event)
  }
  const count = (name: string) => listeners.get(name)?.size ?? 0
  return {
    speech: speech as unknown as SpeechPlugin & typeof speech,
    fire,
    count,
  }
}

function setup(overrides: Partial<SpeechPlugin> = {}) {
  const fake = fakeSpeech(overrides)
  const states: DictationState[] = []
  const timers: (() => void)[] = []
  const session = new DictationSession(
    {
      speech: fake.speech,
      now: () => 1000,
      setTimeout: (callback) => timers.push(callback),
      clearTimeout: () => undefined,
    },
    (state) => states.push(state),
  )
  return { ...fake, session, states, timers }
}

const openai = presetById('openai')!
const soniox = presetById('soniox-rt')!
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('batch dictation', () => {
  it('records, uploads with the preset spec and returns the text', async () => {
    const { session, speech } = setup()
    await session.start(openai, ['Alma'])
    expect(session.current.phase).toBe('recording')
    await session.stop()
    expect(speech.transcribe).toHaveBeenCalledWith({
      engineId: 'openai',
      url: 'https://api.openai.com/v1/audio/transcriptions',
      fields: {
        model: 'gpt-transcribe',
        response_format: 'json',
        prompt: 'Mixed Chinese and English dev talk. Terms: Alma.',
      },
      fileField: 'file',
    })
    expect(session.current).toEqual({ phase: 'done', text: '你好 Alma' })
  })

  it('asks for a key before recording', async () => {
    const { session, speech } = setup({
      keyStatus: vi.fn(async () => ({ set: false })),
    })
    await session.start(openai, [])
    expect(session.current).toEqual({
      phase: 'error',
      error: { kind: 'needs_key' },
      partial: '',
    })
    expect(speech.startRecording).not.toHaveBeenCalled()
  })

  it('maps a native key_missing rejection to needs_key', async () => {
    const { session } = setup({
      transcribe: vi.fn(async () => {
        throw Object.assign(new Error('no key'), { code: 'key_missing' })
      }),
    })
    await session.start(openai, [])
    await session.stop()
    expect(session.current).toMatchObject({ error: { kind: 'needs_key' } })
  })

  it('requests the mic permission and reports a refusal', async () => {
    const { session, speech } = setup({
      checkMicPermission: vi.fn(async () => ({ mic: 'prompt' as const })),
      requestMicPermission: vi.fn(async () => ({ mic: 'denied' as const })),
    })
    await session.start(openai, [])
    expect(speech.requestMicPermission).toHaveBeenCalled()
    expect(session.current).toMatchObject({ error: { kind: 'mic_denied' } })
    expect(speech.startRecording).not.toHaveBeenCalled()
  })

  it('never transcribes after Cancel', async () => {
    const { session, speech } = setup()
    await session.start(openai, [])
    await session.cancel()
    expect(speech.cancelRecording).toHaveBeenCalled()
    await session.stop()
    expect(speech.transcribe).not.toHaveBeenCalled()
    expect(session.current).toEqual({ phase: 'idle' })
  })

  it('drops a result that arrives after Cancel', async () => {
    let answer: (value: { status: number; body: string }) => void = () => {}
    const { session } = setup({
      transcribe: vi.fn(
        () =>
          new Promise<{ status: number; body: string }>((resolve) => {
            answer = resolve
          }),
      ),
    })
    await session.start(openai, [])
    const stopping = session.stop()
    await flush()
    await session.cancel()
    answer({ status: 200, body: '{"text":"late"}' })
    await stopping
    expect(session.current).toEqual({ phase: 'idle' })
  })

  it('treats a very short clip as empty', async () => {
    const { session, speech } = setup({
      stopRecording: vi.fn(async () => ({ durationMs: 120 })),
    })
    await session.start(openai, [])
    await session.stop()
    expect(speech.transcribe).not.toHaveBeenCalled()
    expect(session.current).toMatchObject({ error: { kind: 'empty' } })
  })

  it('classifies HTTP failures', async () => {
    const { session } = setup({
      transcribe: vi.fn(async () => ({
        status: 401,
        body: '{"error":{"message":"bad key"}}',
      })),
    })
    await session.start(openai, [])
    await session.stop()
    expect(session.current).toMatchObject({
      error: { kind: 'auth', detail: 'HTTP 401: bad key' },
    })
  })

  it('stops by itself at the recording limit', async () => {
    const { session, fire, speech } = setup()
    await session.start(openai, [])
    fire('recordingStopped', { reason: 'limit' })
    await flush()
    expect(speech.transcribe).toHaveBeenCalled()
  })

  it('tracks the input level', async () => {
    const { session, fire } = setup()
    await session.start(openai, [])
    fire('level', { rms: 0.4 })
    expect(session.current).toMatchObject({ phase: 'recording', level: 0.4 })
  })
})

describe('Soniox async dictation', () => {
  it('records, then runs the async job through native requests', async () => {
    const replies: Record<string, string> = {
      POST: '{"id":"t1"}',
      GET: '{"status":"completed","text":"异步 Alma"}',
      DELETE: '',
    }
    const { session, speech } = setup({
      transcribe: vi.fn(async () => ({ status: 201, body: '{"id":"f1"}' })),
      request: vi.fn(async (spec) => ({
        status: 200,
        body: replies[spec.method],
      })),
    })
    await session.start(presetById('soniox-async')!, [])
    expect(speech.keyStatus).toHaveBeenCalledWith({ engineId: 'soniox' })
    expect(speech.startRecording).toHaveBeenCalled()
    await session.stop()
    expect(vi.mocked(speech.transcribe).mock.calls[0][0]).toMatchObject({
      engineId: 'soniox',
      url: 'https://api.soniox.com/v1/files',
    })
    for (const [spec] of vi.mocked(speech.request).mock.calls)
      expect(spec.engineId).toBe('soniox')
    expect(session.current).toEqual({ phase: 'done', text: '异步 Alma' })
  })
})

describe('real-time dictation', () => {
  it('opens the stream with the key-less config', async () => {
    const { session, speech } = setup()
    await session.start(soniox, ['Herdr'])
    expect(speech.startStream).toHaveBeenCalledTimes(1)
    const options = vi.mocked(speech.startStream).mock.calls[0][0]
    expect(options.engineId).toBe('soniox')
    expect(options.url).toBe('wss://stt-rt.soniox.com/transcribe-websocket')
    expect(JSON.parse(options.config)).toMatchObject({
      model: 'stt-rt-v6',
      context: { terms: ['Herdr'] },
    })
    expect(options.config).not.toContain('api_key')
    expect(speech.startRecording).not.toHaveBeenCalled()
  })

  it('previews tokens, then finalises on finished', async () => {
    const { session, fire, speech } = setup()
    await session.start(soniox, [])
    fire('streamMessage', {
      data: JSON.stringify({
        tokens: [
          { text: '打开', is_final: true },
          { text: ' Her', is_final: false },
        ],
      }),
    })
    expect(session.current).toMatchObject({
      phase: 'recording',
      transcript: { final: '打开', tail: ' Her' },
    })
    const stopping = session.stop()
    await flush()
    expect(speech.stopStream).toHaveBeenCalled()
    expect(session.current.phase).toBe('finishing')
    fire('streamMessage', {
      data: JSON.stringify({
        tokens: [
          { text: ' Herdr', is_final: true },
          { text: '<end>', is_final: true },
        ],
        finished: true,
      }),
    })
    await stopping
    expect(session.current).toEqual({ phase: 'done', text: '打开 Herdr' })
  })

  it('keeps what was heard when finished never arrives', async () => {
    const { session, fire, timers, speech } = setup()
    await session.start(soniox, [])
    fire('streamMessage', {
      data: JSON.stringify({ tokens: [{ text: '你好', is_final: true }] }),
    })
    const stopping = session.stop()
    await flush()
    expect(timers).toHaveLength(1)
    timers[0]()
    await stopping
    expect(speech.cancelStream).toHaveBeenCalled()
    expect(session.current).toEqual({ phase: 'done', text: '你好' })
    expect(FINISH_TIMEOUT_MS).toBe(5000)
  })

  it('times out when nothing was heard', async () => {
    const { session, timers } = setup()
    await session.start(soniox, [])
    const stopping = session.stop()
    await flush()
    timers[0]()
    await stopping
    expect(session.current).toMatchObject({ error: { kind: 'timeout' } })
  })

  it('reports a server error and keeps the partial text', async () => {
    const { session, fire, speech } = setup()
    await session.start(soniox, [])
    fire('streamMessage', {
      data: JSON.stringify({ tokens: [{ text: '半句', is_final: true }] }),
    })
    fire('streamMessage', {
      data: '{"error_code":401,"error_message":"Invalid API key"}',
    })
    expect(session.current).toEqual({
      phase: 'error',
      error: { kind: 'auth', detail: '401: Invalid API key' },
      partial: '半句',
    })
    expect(speech.cancelStream).toHaveBeenCalled()
  })

  it('reports a dropped connection while recording', async () => {
    const { session, fire } = setup()
    await session.start(soniox, [])
    fire('streamClosed', { code: 1006, reason: '', error: 'reset' })
    expect(session.current).toMatchObject({
      error: { kind: 'network', detail: 'reset' },
    })
  })

  it('maps a refused host binding', async () => {
    const { session } = setup({
      startStream: vi.fn(async () => {
        throw Object.assign(new Error('host'), { code: 'host_not_allowed' })
      }),
    })
    await session.start(soniox, [])
    expect(session.current).toMatchObject({
      error: { kind: 'host_not_allowed' },
    })
  })

  it('ignores stream messages after Cancel and removes listeners', async () => {
    const { session, fire, count, speech } = setup()
    await session.start(soniox, [])
    expect(count('streamMessage')).toBe(1)
    await session.cancel()
    expect(speech.cancelStream).toHaveBeenCalled()
    fire('streamMessage', {
      data: JSON.stringify({ tokens: [{ text: 'x', is_final: true }] }),
    })
    expect(session.current).toEqual({ phase: 'idle' })
    await flush()
    expect(count('streamMessage')).toBe(0)
  })

  it('cancels native work when Cancel lands during Start', async () => {
    let open: () => void = () => {}
    const { session, speech } = setup({
      startStream: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            open = resolve
          }),
      ),
    })
    const starting = session.start(soniox, [])
    await flush()
    await session.cancel()
    open()
    await starting
    expect(session.current).toEqual({ phase: 'idle' })
    expect(speech.cancelStream).toHaveBeenCalledTimes(2)
  })
})

describe('nativeError', () => {
  it('maps codes and keeps unknown messages as detail', () => {
    expect(nativeError({ code: 'network', message: 'x' })).toEqual({
      kind: 'network',
    })
    expect(nativeError({ code: 'weird', message: 'boom' })).toEqual({
      kind: 'unknown',
      detail: 'boom',
    })
    expect(nativeError('nope')).toEqual({ kind: 'unknown' })
  })
})
