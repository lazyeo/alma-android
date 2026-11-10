import { describe, expect, it, vi } from 'vitest'
import { presetById } from './presets'
import {
  MAX_POLLS,
  parseSonioxStatus,
  parseSonioxTranscript,
  sonioxCreateSpec,
  transcribeSonioxAsync,
  type NativeRequestSpec,
} from './sonioxAsync'

const engine = presetById('soniox-async')!
const API = 'https://api.soniox.com/v1'

type Reply = { status: number; body: string }

function fakeSpeech(replies: Record<string, Reply | (() => Reply)>) {
  const calls: string[] = []
  const reply = (key: string) => {
    calls.push(key)
    const value = replies[key]
    if (!value) throw new Error(`unexpected ${key}`)
    return typeof value === 'function' ? value() : value
  }
  return {
    calls,
    speech: {
      transcribe: vi.fn(async (spec: { url: string }) =>
        reply(`UPLOAD ${spec.url}`),
      ),
      request: vi.fn(async (spec: NativeRequestSpec) =>
        reply(`${spec.method} ${spec.url}`),
      ),
    },
  }
}

const ok = (json: unknown): Reply => ({
  status: 200,
  body: JSON.stringify(json),
})
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Soniox async', () => {
  it('uploads, polls, fetches the text and deletes both', async () => {
    let polls = 0
    const { speech, calls } = fakeSpeech({
      [`UPLOAD ${API}/files`]: { status: 201, body: '{"id":"f1"}' },
      [`POST ${API}/transcriptions`]: { status: 201, body: '{"id":"t1"}' },
      [`GET ${API}/transcriptions/t1`]: () =>
        ok({ status: ++polls < 3 ? 'processing' : 'completed' }),
      [`GET ${API}/transcriptions/t1/transcript`]: ok({
        text: ' 打开 Herdr ',
      }),
      [`DELETE ${API}/transcriptions/t1`]: { status: 204, body: '' },
      [`DELETE ${API}/files/f1`]: { status: 204, body: '' },
    })
    const sleep = vi.fn(async () => undefined)
    const outcome = await transcribeSonioxAsync(engine, ['Herdr'], {
      speech,
      sleep,
      live: () => true,
    })
    expect(outcome).toEqual({ ok: true, text: '打开 Herdr' })
    expect(sleep).toHaveBeenCalledTimes(2)
    await flush()
    expect(calls.slice(-2)).toEqual([
      `DELETE ${API}/transcriptions/t1`,
      `DELETE ${API}/files/f1`,
    ])
    expect(JSON.parse(speech.request.mock.calls[0][0].body!)).toEqual({
      model: 'stt-async-v6',
      file_id: 'f1',
      language_hints: ['zh', 'en'],
      context: { terms: ['Herdr'] },
    })
  })

  it('reports a failed job and still deletes the upload', async () => {
    const { speech, calls } = fakeSpeech({
      [`UPLOAD ${API}/files`]: { status: 201, body: '{"id":"f1"}' },
      [`POST ${API}/transcriptions`]: {
        status: 401,
        body: '{"status_code":401,"message":"Invalid API key"}',
      },
      [`DELETE ${API}/files/f1`]: { status: 204, body: '' },
    })
    const outcome = await transcribeSonioxAsync(engine, [], {
      speech,
      sleep: async () => undefined,
      live: () => true,
    })
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'auth', detail: 'HTTP 401: Invalid API key' },
    })
    await flush()
    expect(calls.at(-1)).toBe(`DELETE ${API}/files/f1`)
  })

  it('stops polling once cancelled', async () => {
    let alive = true
    const { speech, calls } = fakeSpeech({
      [`UPLOAD ${API}/files`]: { status: 201, body: '{"id":"f1"}' },
      [`POST ${API}/transcriptions`]: { status: 201, body: '{"id":"t1"}' },
      [`GET ${API}/transcriptions/t1`]: ok({ status: 'queued' }),
      [`DELETE ${API}/transcriptions/t1`]: { status: 204, body: '' },
      [`DELETE ${API}/files/f1`]: { status: 204, body: '' },
    })
    const outcome = await transcribeSonioxAsync(engine, [], {
      speech,
      sleep: async () => {
        alive = false
      },
      live: () => alive,
    })
    expect(outcome.ok).toBe(false)
    expect(
      calls.filter((call) => call === `GET ${API}/transcriptions/t1`),
    ).toHaveLength(1)
  })

  it('gives up after the poll limit', async () => {
    const { speech } = fakeSpeech({
      [`UPLOAD ${API}/files`]: { status: 201, body: '{"id":"f1"}' },
      [`POST ${API}/transcriptions`]: { status: 201, body: '{"id":"t1"}' },
      [`GET ${API}/transcriptions/t1`]: ok({ status: 'processing' }),
      [`DELETE ${API}/transcriptions/t1`]: { status: 204, body: '' },
      [`DELETE ${API}/files/f1`]: { status: 204, body: '' },
    })
    const outcome = await transcribeSonioxAsync(engine, [], {
      speech,
      sleep: async () => undefined,
      live: () => true,
    })
    expect(outcome).toEqual({ ok: false, error: { kind: 'timeout' } })
    const polls = speech.request.mock.calls.filter(
      ([spec]) =>
        spec.url === `${API}/transcriptions/t1` && spec.method === 'GET',
    )
    expect(polls).toHaveLength(MAX_POLLS)
  })

  it('omits context without terms', () => {
    const spec = sonioxCreateSpec(engine, [], 'f')
    expect(JSON.parse(spec.body!)).not.toHaveProperty('context')
    expect(spec.body).not.toContain('api_key')
  })

  it('parses job status and transcripts', () => {
    expect(parseSonioxStatus(200, '{"status":"queued"}')).toEqual({
      ok: true,
      value: 'pending',
    })
    expect(
      parseSonioxStatus(200, '{"status":"error","error_message":"bad audio"}'),
    ).toEqual({ ok: false, error: { kind: 'server', detail: 'bad audio' } })
    expect(parseSonioxStatus(429, '{}')).toMatchObject({
      error: { kind: 'rate_limited' },
    })
    expect(
      parseSonioxTranscript(
        200,
        '{"tokens":[{"text":"你好"},{"text":" Alma"},{"text":"<end>"}]}',
      ),
    ).toEqual({ ok: true, text: '你好 Alma' })
    expect(parseSonioxTranscript(200, '{"text":"  "}')).toEqual({
      ok: false,
      error: { kind: 'empty' },
    })
    expect(parseSonioxTranscript(200, 'nope')).toMatchObject({
      error: { kind: 'server' },
    })
  })
})
