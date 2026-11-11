import { describe, expect, it, vi } from 'vitest'
import { checkKey, keyCheckFromStatus, keyCheckSpec } from './keyCheck'
import { presetById } from './presets'

const preset = (id: string) => presetById(id)!

describe('keyCheckSpec', () => {
  it('lists models on OpenAI-compatible APIs', () => {
    expect(keyCheckSpec(preset('openai'))).toEqual({
      engineId: 'openai',
      method: 'GET',
      url: 'https://api.openai.com/v1/models',
    })
    expect(keyCheckSpec(preset('siliconflow')).url).toBe(
      'https://api.siliconflow.cn/v1/models',
    )
    expect(
      keyCheckSpec({ ...preset('custom'), baseUrl: 'https://x.example/v1/' })
        .url,
    ).toBe('https://x.example/v1/models')
  })

  it('uses the shared key on the Soniox REST host for both Soniox engines', () => {
    for (const id of ['soniox-rt', 'soniox-async'])
      expect(keyCheckSpec(preset(id))).toEqual({
        engineId: 'soniox',
        method: 'GET',
        url: 'https://api.soniox.com/v1/files',
      })
  })
})

describe('keyCheckFromStatus', () => {
  it('names the reason', () => {
    expect(keyCheckFromStatus(200)).toEqual({ state: 'ok' })
    expect(keyCheckFromStatus(401)).toMatchObject({ reason: 'auth' })
    expect(keyCheckFromStatus(403)).toMatchObject({ reason: 'auth' })
    expect(keyCheckFromStatus(402)).toMatchObject({ reason: 'quota' })
    expect(keyCheckFromStatus(429)).toMatchObject({ reason: 'quota' })
    expect(keyCheckFromStatus(503)).toMatchObject({ reason: 'server' })
    expect(keyCheckFromStatus(404)).toEqual({
      state: 'failed',
      reason: 'unverified',
      detail: 'HTTP 404',
    })
  })
})

describe('checkKey', () => {
  it('reports a transport failure as a network problem', async () => {
    const request = vi.fn(async () => {
      throw Object.assign(new Error('offline'), { code: 'network' })
    })
    expect(await checkKey(request, preset('openai'))).toEqual({
      state: 'failed',
      reason: 'network',
    })
  })

  it('goes through the native request with the spec', async () => {
    const request = vi.fn(async () => ({ status: 200 }))
    expect(await checkKey(request, preset('groq'))).toEqual({ state: 'ok' })
    expect(request).toHaveBeenCalledWith(keyCheckSpec(preset('groq')))
  })
})
