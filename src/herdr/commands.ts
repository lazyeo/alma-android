export type HerdrCommandSource = 'command' | 'skill' | 'prompt' | 'builtin'

export interface HerdrCommand {
  name: string
  description?: string
  hint?: string
  interactive?: boolean
  source: HerdrCommandSource
}

const sources = new Set<HerdrCommandSource>([
  'command',
  'skill',
  'prompt',
  'builtin',
])

export function normalizeHerdrCommands(value: unknown): HerdrCommand[] {
  if (!value || typeof value !== 'object' || !('commands' in value)) return []
  const input = value.commands
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const commands: HerdrCommand[] = []
  for (const item of input.slice(0, 400)) {
    if (!item || typeof item !== 'object') continue
    const name =
      'name' in item && typeof item.name === 'string' ? item.name.trim() : ''
    const source = 'source' in item ? item.source : undefined
    if (!name || !sources.has(source as HerdrCommandSource) || seen.has(name))
      continue
    seen.add(name)
    const description =
      'description' in item && typeof item.description === 'string'
        ? item.description.trim()
        : ''
    const hint =
      'hint' in item && typeof item.hint === 'string' ? item.hint.trim() : ''
    commands.push({
      name,
      ...(description ? { description } : {}),
      ...(hint ? { hint } : {}),
      source: source as HerdrCommandSource,
    })
  }
  return commands
}

export function mergeHerdrCommands(
  desktop: readonly HerdrCommand[],
  builtins: readonly HerdrCommand[],
): HerdrCommand[] {
  const builtinByName = new Map(
    builtins.map((command) => [command.name.toLowerCase(), command]),
  )
  const mergedDesktop = desktop.map((command) => {
    const interactive = builtinByName.get(
      command.name.toLowerCase(),
    )?.interactive
    return interactive ? { ...command, interactive } : command
  })
  const seen = new Set(desktop.map((command) => command.name.toLowerCase()))
  return [
    ...mergedDesktop,
    ...builtins.filter((command) => {
      const name = command.name.toLowerCase()
      if (seen.has(name)) return false
      seen.add(name)
      return true
    }),
  ]
}

export function filterHerdrCommands(
  commands: readonly HerdrCommand[],
  query: string,
  limit = 50,
): HerdrCommand[] {
  const needle = query.toLocaleLowerCase()
  const prefix: HerdrCommand[] = []
  const substring: HerdrCommand[] = []

  for (const command of commands) {
    const name = command.name.toLocaleLowerCase()
    if (name.startsWith(needle)) prefix.push(command)
    else if (
      name.includes(needle) ||
      command.description?.toLocaleLowerCase().includes(needle)
    )
      substring.push(command)
    if (prefix.length + substring.length >= limit) break
  }
  return [...prefix, ...substring].slice(0, limit)
}

export const commandInsertion = (command: HerdrCommand) => `/${command.name} `
