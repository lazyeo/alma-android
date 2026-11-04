import type { Translator } from '../i18n/core'
import type { Messages } from '../i18n/en'
import {
  personalMoodLabel,
  type AlmaVitals,
  type PersonalAgentSnapshot,
} from '../screens/personalAgent'

export interface AlmaStatusLine {
  kind: 'thinking' | 'approvals' | 'working' | 'mood'
  text: string
}

/**
 * The single line under "Alma" in her header. Only the most pressing fact is
 * shown: a live reply, then things waiting on the user, then background
 * work, then how she feels. Nothing at all when none of that applies.
 */
export function almaStatusLine(
  {
    generating,
    personal,
    vitals,
  }: {
    generating: boolean
    personal: Pick<PersonalAgentSnapshot, 'running' | 'pendingApprovals'>
    vitals?: AlmaVitals
  },
  t: Translator<Messages>,
): AlmaStatusLine | undefined {
  if (generating)
    return { kind: 'thinking', text: t('threads.personal.status.thinking') }
  if (personal.pendingApprovals > 0)
    return {
      kind: 'approvals',
      text: t('threads.personal.status.approvals', {
        count: personal.pendingApprovals,
      }),
    }
  if (personal.running > 0)
    return {
      kind: 'working',
      text: t('threads.personal.status.working', { count: personal.running }),
    }
  const mood = personalMoodLabel(vitals?.mood, t)
  return mood ? { kind: 'mood', text: mood } : undefined
}
