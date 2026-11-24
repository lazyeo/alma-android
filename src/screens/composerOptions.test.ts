import { describe, expect, it, vi } from 'vitest'
import { loadComposerOptions } from './composerOptions'

const models = [{ id: 'p1:m', name: 'M' }]
const settings = { theme: 'dark' }
const workspaces = [{ id: 'w1', name: 'W' }]

function api(
  fail: Partial<Record<'models' | 'settings' | 'workspaces', Error>> = {},
) {
  const answer = <T>(key: keyof typeof fail, value: T) =>
    vi.fn(() =>
      fail[key] ? Promise.reject(fail[key]) : Promise.resolve(value),
    )
  return {
    listModels: answer('models', models),
    getSettings: answer('settings', settings),
    listWorkspaces: answer('workspaces', workspaces),
  }
}

describe('loadComposerOptions', () => {
  it('loads the models, settings and projects', async () => {
    expect(await loadComposerOptions(api() as never)).toEqual({
      models,
      settings,
      workspaces,
      errors: [],
    })
  })

  // Seen on the phone: one failed call left Alma's composer with no models
  // at all (an empty Model chip, no effort), as all three were dropped.
  it('keeps the models when the settings or the projects fail', async () => {
    const result = await loadComposerOptions(
      api({ workspaces: new Error('relay closed') }) as never,
    )
    expect(result.models).toBe(models)
    expect(result.settings).toBe(settings)
    expect(result.workspaces).toBeUndefined()
    expect(result.errors.map((error) => error.message)).toEqual([
      'relay closed',
    ])
  })

  it('reports a failed model list instead of an empty one', async () => {
    const result = await loadComposerOptions(
      api({ models: new Error('timeout') }) as never,
    )
    expect(result.models).toBeUndefined()
    expect(result.workspaces).toBe(workspaces)
    expect(result.errors).toHaveLength(1)
  })
})
