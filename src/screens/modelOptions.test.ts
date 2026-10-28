import { describe, expect, it } from 'vitest'
import type { AlmaModel } from '../relay'
import {
  effortLabel,
  groupModelsByProvider,
  reasoningEffortsForModel,
  shortModelName,
  supportsFastMode,
  supportsReasoningEffort,
} from './modelOptions'

const models: AlmaModel[] = [
  {
    id: 'openai:gpt-fast',
    modelId: 'gpt-fast',
    name: 'GPT Fast',
    provider: 'OpenAI',
    providerId: 'openai',
    capabilities: {
      reasoning: true,
      reasoningLevels: ['high', 'low', 'ultra'],
      serviceTiers: ['priority'],
    },
  },
  {
    id: 'anthropic:claude',
    modelId: 'claude',
    name: 'Claude',
    provider: 'Anthropic',
    providerId: 'anthropic',
    capabilities: { reasoning: true },
  },
  {
    id: 'openai:gpt-basic',
    modelId: 'gpt-basic',
    name: 'GPT Basic',
    provider: 'OpenAI',
    providerId: 'openai',
    capabilities: {},
  },
]

describe('model options', () => {
  it('puts recently used providers/models first while preserving provider groups', () => {
    expect(
      groupModelsByProvider(models, {
        'anthropic:claude': 200,
        'openai:gpt-basic': 100,
      }),
    ).toEqual([
      { provider: 'Anthropic', models: [models[1]] },
      { provider: 'OpenAI', models: [models[2], models[0]] },
    ])
  })

  it('matches desktop reasoning visibility and effort ordering', () => {
    expect(supportsReasoningEffort(models[0])).toBe(true)
    expect(supportsReasoningEffort({ ...models[0], providerType: 'acp' })).toBe(
      false,
    )
    expect(supportsReasoningEffort(models[2])).toBe(false)
    expect(reasoningEffortsForModel(models[0])).toEqual([
      'off',
      'low',
      'high',
      'ultra',
    ])
    expect(reasoningEffortsForModel(models[1])).toEqual([
      'off',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  it('only exposes fast mode for priority service-tier models', () => {
    expect(supportsFastMode(models[0])).toBe(true)
    expect(supportsFastMode(models[1])).toBe(false)
  })

  it('uses a short composer label without a provider suffix', () => {
    expect(shortModelName({ ...models[1], name: 'Opus 5.5 · Anthropic' })).toBe(
      'Opus 5.5',
    )
    expect(shortModelName(models[0])).toBe('GPT Fast')
  })
})

describe('effortLabel', () => {
  it('uses sentence case labels', () => {
    expect(effortLabel('off')).toBe('Off')
    expect(effortLabel('medium')).toBe('Medium')
    expect(effortLabel('xhigh')).toBe('Extra high')
  })
})
