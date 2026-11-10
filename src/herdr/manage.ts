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

export interface CoderAgentProvider {
  id: string
  type?: string
  acpCommand?: string | null
  acpArgs?: string[] | null
}

const commandName = (value: string) =>
  (value.trim().split(/[\\/]/).pop() ?? '')
    .replace(/\.(cmd|exe|ps1)$/i, '')
    .toLowerCase()

function acpAgentKind(command: string, args: string[]): HerdrAgentKind | null {
  for (const token of [command, ...args].map(commandName).filter(Boolean)) {
    const name = token.replace(/^@[^/]+\//, '').replace(/@[^@]*$/, '')
    if (name === 'codex' || name === 'codex-acp') return 'codex'
    if (
      name === 'claude' ||
      name === 'claude-code-acp' ||
      name === 'acp-extension-claude' ||
      name === 'claude-agent-acp'
    )
      return 'claude'
    if (name === 'pi' || name === 'pi-acp') return 'pi'
  }
  return null
}

/**
 * The agent the desktop starts for a new Herdr conversation, mirroring its
 * server (0.4.511): `settings.chat.coderAgentProviderId` names the coding
 * agent; built-in choices and unknown or non-ACP providers mean Claude Code,
 * an ACP provider maps by its command.
 */
export function desktopDefaultAgent(
  coderAgentProviderId: unknown,
  providers: CoderAgentProvider[],
): HerdrAgentKind {
  const id =
    typeof coderAgentProviderId === 'string' ? coderAgentProviderId.trim() : ''
  if (!id || ['__auto__', '__claude_code__', '__builtin__'].includes(id))
    return 'claude'
  const provider = providers.find((item) => item.id === id)
  if (!provider || provider.type !== 'acp') return 'claude'
  return (
    acpAgentKind(
      provider.acpCommand ?? '',
      Array.isArray(provider.acpArgs)
        ? provider.acpArgs.filter((arg) => typeof arg === 'string')
        : [],
    ) ?? 'claude'
  )
}
