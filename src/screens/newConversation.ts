import type {
  AlmaApi,
  AlmaModel,
  AlmaSettings,
  ReasoningEffort,
  Workspace,
} from '../relay'
import { normalizeEffortForModel } from './modelOptions'
import { resolveDefaultWorkspaceId } from './workspaceOptions'

export interface NewConversationDefaults {
  workspaces: Workspace[]
  models: AlmaModel[]
  workspaceId: string
  model: string
  effort: ReasoningEffort | 'off'
  fastMode: boolean
}

/** The composer's starting effort before the model narrows it. */
export const COMPOSER_DEFAULT_EFFORT: ReasoningEffort = 'medium'

/** The desktop's default chat model when it is listed, else the first one. */
export function composerDefaultModel(
  models: AlmaModel[],
  settings: AlmaSettings,
) {
  return (
    models.find((item) => item.id === settings.chat?.defaultModel)?.id ||
    models[0]?.id ||
    ''
  )
}

export async function loadNewConversationDefaults(
  api: AlmaApi,
  workspaceId?: string,
): Promise<NewConversationDefaults> {
  const [workspaces, models, settings] = await Promise.all([
    api.listWorkspaces(),
    api.listModels(),
    api.getSettings(),
  ])
  return {
    workspaces,
    models,
    workspaceId:
      workspaceId ?? resolveDefaultWorkspaceId(settings, workspaces) ?? '',
    model: composerDefaultModel(models, settings),
    effort: COMPOSER_DEFAULT_EFFORT,
    fastMode: false,
  }
}

export async function createNewConversation(
  api: AlmaApi,
  defaults: Pick<
    NewConversationDefaults,
    'models' | 'workspaceId' | 'model' | 'effort' | 'fastMode'
  >,
) {
  const id = (
    await api.createThread('New Chat', defaults.workspaceId || undefined)
  ).id
  const selected = defaults.models.find((item) => item.id === defaults.model)
  await api.updateThread(id, {
    workspaceId: defaults.workspaceId || undefined,
    model: defaults.model,
    reasoningEffort: normalizeEffortForModel(selected, defaults.effort),
    fastMode: defaults.fastMode,
  })
  return id
}
