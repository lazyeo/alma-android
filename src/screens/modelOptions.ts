import { en } from '../i18n/en'
import { t } from '../i18n/runtime'
import type { AlmaModel, ReasoningEffort } from '../relay'

export const EFFORT_ORDER: ReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
]

const DEFAULT_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

export function supportsReasoningEffort(model?: AlmaModel) {
  return model?.capabilities.reasoning === true && model.providerType !== 'acp'
}

export function reasoningEffortsForModel(
  model?: AlmaModel,
): Array<'off' | ReasoningEffort> {
  if (!supportsReasoningEffort(model)) return []
  const declared = model?.capabilities.reasoningLevels
  const available =
    Array.isArray(declared) && declared.length
      ? EFFORT_ORDER.filter((effort) => declared.includes(effort))
      : DEFAULT_EFFORTS
  return ['off', ...available]
}

export function effortLabel(effort: 'off' | ReasoningEffort) {
  // Desktops may report levels this build does not know; show them raw.
  return effort in en.composer.effort.levels
    ? t(`composer.effort.levels.${effort}`)
    : effort
}

export function supportsFastMode(model?: AlmaModel) {
  return model?.capabilities.serviceTiers?.includes('priority') === true
}

/** Compact label for the composer, without provider/vendor suffixes. */
export function shortModelName(model?: AlmaModel) {
  if (!model) return t('composer.model')
  const providerSuffix = new RegExp(
    `\\s*(?:[-·|]|by)\\s*${model.provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'i',
  )
  return model.name.replace(providerSuffix, '').trim() || model.name
}

export function groupModelsByProvider(
  models: AlmaModel[],
  usageHistory: Record<string, number> = {},
) {
  const sorted = [...models].sort((a, b) => {
    const usageDifference =
      (usageHistory[b.id] ?? 0) - (usageHistory[a.id] ?? 0)
    if (usageDifference) return usageDifference
    return `${a.provider} - ${a.name}`.localeCompare(
      `${b.provider} - ${b.name}`,
    )
  })
  const groups = new Map<string, AlmaModel[]>()
  for (const model of sorted) {
    const group = groups.get(model.provider)
    if (group) group.push(model)
    else groups.set(model.provider, [model])
  }
  return [...groups].map(([provider, providerModels]) => ({
    provider,
    models: providerModels,
  }))
}

export function normalizeEffortForModel(
  model: AlmaModel | undefined,
  effort: 'off' | ReasoningEffort,
): 'off' | ReasoningEffort {
  const available = reasoningEffortsForModel(model)
  if (!available.length) return 'off'
  if (available.includes(effort)) return effort
  return available.includes('medium') ? 'medium' : available[1] || 'off'
}
