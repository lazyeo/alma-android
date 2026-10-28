export interface ThreadGoal {
  condition: string
  setAt: string | number
  turnsEvaluated: number
  pausedAt?: string | number
  achievedAt?: string | number
  lastReason?: string
}
export function parseGoal(value: unknown): ThreadGoal | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (
    typeof v.condition !== 'string' ||
    !v.condition.trim() ||
    !['string', 'number'].includes(typeof v.setAt) ||
    typeof v.turnsEvaluated !== 'number' ||
    !Number.isFinite(v.turnsEvaluated)
  )
    return null
  return {
    condition: v.condition,
    setAt: v.setAt as string | number,
    turnsEvaluated: v.turnsEvaluated,
    ...(['string', 'number'].includes(typeof v.pausedAt)
      ? { pausedAt: v.pausedAt as string | number }
      : {}),
    ...(['string', 'number'].includes(typeof v.achievedAt)
      ? { achievedAt: v.achievedAt as string | number }
      : {}),
    ...(typeof v.lastReason === 'string' ? { lastReason: v.lastReason } : {}),
  }
}
export type GoalStatus = 'none' | 'active' | 'paused' | 'achieved'

export function goalStatus(goal: ThreadGoal | null): GoalStatus {
  return !goal
    ? 'none'
    : goal.achievedAt != null
      ? 'achieved'
      : goal.pausedAt != null
        ? 'paused'
        : 'active'
}
