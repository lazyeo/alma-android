export type HerdrAgentKind = 'claude' | 'codex' | 'pi'

export function firstString(key: string, json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined
  if (!Array.isArray(json)) {
    const record = json as Record<string, unknown>
    if (typeof record[key] === 'string') return record[key]
  }
  for (const value of Object.values(json)) {
    const found = firstString(key, value)
    if (found !== undefined) return found
  }
  return undefined
}

export function agentTabName(
  kind: HerdrAgentKind,
  random: () => number = Math.random,
) {
  const value = random()
  const suffix = Math.floor(value < 1 ? value * 0x1_0000_0000 : value)
    .toString(16)
    .padStart(8, '0')
    .slice(-8)
  return `${kind}-${suffix}`
}
