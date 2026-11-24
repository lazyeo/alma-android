import type { AlmaApi, AlmaModel, AlmaSettings, Workspace } from '../relay'

/** What a thread's composer offers: models, the settings, the projects. */
export interface ComposerOptions {
  /** Absent when the list could not be read (not an empty list). */
  models?: AlmaModel[]
  settings?: AlmaSettings
  workspaces?: Workspace[]
  /** Each call that failed, so the caller can say so. */
  errors: Error[]
}

type OptionsApi = Pick<AlmaApi, 'listModels' | 'getSettings' | 'listWorkspaces'>

/**
 * Reads the composer's options as three independent calls. One failing
 * (a relay that is still connecting, a session that drops) must not take
 * the others with it: with all-or-nothing loading, a failed project list
 * once left Alma's composer with no models, an empty Model chip and no
 * reasoning effort.
 */
export async function loadComposerOptions(
  api: OptionsApi,
): Promise<ComposerOptions> {
  const [models, settings, workspaces] = await Promise.allSettled([
    api.listModels(),
    api.getSettings(),
    api.listWorkspaces(),
  ])
  const errors: Error[] = []
  const value = <T>(result: PromiseSettledResult<T>) => {
    if (result.status === 'fulfilled') return result.value
    errors.push(
      result.reason instanceof Error
        ? result.reason
        : new Error(String(result.reason)),
    )
    return undefined
  }
  return {
    models: value(models),
    settings: value(settings),
    workspaces: value(workspaces),
    errors,
  }
}
