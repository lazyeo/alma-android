import type { AlmaApi, AlmaModel, ReasoningEffort, Workspace } from '../relay'
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
    model:
      models.find((item) => item.id === settings.chat?.defaultModel)?.id ||
      models[0]?.id ||
      '',
    effort: 'medium',
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
