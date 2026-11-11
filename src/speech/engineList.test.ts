import { describe, expect, it } from 'vitest'
import {
  engineGroups,
  engineOn,
  KEY_PROVIDERS,
  keyBadge,
  moveListed,
} from './engineList'
import { defaultSpeechSettings, type SpeechSettings } from './engineStore'

const allKeys = Object.fromEntries(
  KEY_PROVIDERS.map((id) => [id, { set: true, last4: 'abcd' }]),
)
const noKeys = Object.fromEntries(
  KEY_PROVIDERS.map((id) => [id, { set: false }]),
)

describe('KEY_PROVIDERS', () => {
  it('lists the shared Soniox key once', () => {
    expect(KEY_PROVIDERS).toEqual([
      'soniox',
      'openai',
      'groq',
      'siliconflow',
      'custom',
    ])
  })
})

describe('engineOn', () => {
  const settings = defaultSpeechSettings()

  it('needs the switch, the setup and a saved key', () => {
    expect(engineOn(settings, 'openai', allKeys)).toBe(true)
    expect(engineOn(settings, 'openai', noKeys)).toBe(false)
    expect(
      engineOn({ ...settings, disabled: ['openai'] }, 'openai', allKeys),
    ).toBe(false)
    // Custom has no base URL or model yet.
    expect(engineOn(settings, 'custom', allKeys)).toBe(false)
  })

  it('keeps the saved switch while the key status loads', () => {
    expect(engineOn(settings, 'openai', {})).toBe(true)
  })
})

describe('engineGroups', () => {
  it('folds the uncommon engines that are not in use', () => {
    const { listed, more } = engineGroups(defaultSpeechSettings(), noKeys)
    expect(listed).toEqual(['soniox-rt', 'openai', 'soniox-async'])
    expect(more).toEqual(['groq', 'siliconflow', 'custom'])
  })

  it('lists an uncommon engine once it is on, in its place', () => {
    const keys = { ...noKeys, siliconflow: { set: true } }
    const { listed, more } = engineGroups(defaultSpeechSettings(), keys)
    expect(listed).toEqual([
      'soniox-rt',
      'openai',
      'soniox-async',
      'siliconflow',
    ])
    expect(more).toEqual(['groq', 'custom'])
  })
})

describe('moveListed', () => {
  const settings: SpeechSettings = {
    ...defaultSpeechSettings(),
    // groq is folded between the listed rows.
    order: [
      'soniox-rt',
      'groq',
      'openai',
      'soniox-async',
      'siliconflow',
      'custom',
    ],
  }
  const listed = ['soniox-rt', 'openai', 'soniox-async']

  it('moves among the listed rows and leaves folded ones alone', () => {
    expect(moveListed(settings, listed, 'soniox-async', 0).order).toEqual([
      'soniox-async',
      'soniox-rt',
      'groq',
      'openai',
      'siliconflow',
      'custom',
    ])
    expect(moveListed(settings, listed, 'soniox-rt', 1).order).toEqual([
      'groq',
      'openai',
      'soniox-rt',
      'soniox-async',
      'siliconflow',
      'custom',
    ])
  })

  it('moves to the end of the listed rows, before the folded tail', () => {
    expect(moveListed(settings, listed, 'soniox-rt', 2).order).toEqual([
      'groq',
      'openai',
      'soniox-async',
      'soniox-rt',
      'siliconflow',
      'custom',
    ])
    expect(moveListed(settings, listed, 'soniox-rt', 9).order).toEqual(
      moveListed(settings, listed, 'soniox-rt', 2).order,
    )
  })
})

describe('keyBadge', () => {
  it('says loading, missing, or the last four, and when it is shared', () => {
    expect(keyBadge('openai')).toEqual({ kind: 'loading' })
    expect(keyBadge('openai', { set: false })).toEqual({ kind: 'missing' })
    expect(keyBadge('openai', { set: true, last4: 'wxyz' })).toEqual({
      kind: 'set',
      last4: 'wxyz',
      shared: false,
    })
    expect(keyBadge('soniox', { set: true, last4: 'wxyz' })).toEqual({
      kind: 'set',
      last4: 'wxyz',
      shared: true,
    })
  })
})
