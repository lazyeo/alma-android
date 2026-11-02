import { describe, expect, it } from 'vitest'
import {
  commandInsertion,
  filterHerdrCommands,
  mergeHerdrCommands,
  normalizeHerdrCommands,
} from './commands'
import { BUILTIN_HERDR_COMMANDS } from './builtinCommands'

describe('normalizeHerdrCommands', () => {
  it('keeps valid commands, trims fields, and de-duplicates names', () => {
    expect(
      normalizeHerdrCommands({
        commands: [
          {
            name: ' review ',
            description: ' Review changes ',
            hint: ' files ',
            source: 'command',
          },
          { name: 'review', source: 'skill' },
          { name: 'broken', source: 'other' },
          null,
        ],
      }),
    ).toEqual([
      {
        name: 'review',
        description: 'Review changes',
        hint: 'files',
        source: 'command',
      },
    ])
  })

  it('preserves Codex prompt and Pi skill prefixes for insertion', () => {
    const commands = normalizeHerdrCommands({
      commands: [
        { name: 'prompts:review', source: 'prompt' },
        { name: 'skill:research', source: 'skill' },
      ],
    })

    expect(commands.map(commandInsertion)).toEqual([
      '/prompts:review ',
      '/skill:research ',
    ])
  })
})

describe('mergeHerdrCommands', () => {
  it('adds built-ins when the desktop list is empty', () => {
    const merged = mergeHerdrCommands([], BUILTIN_HERDR_COMMANDS.codex)

    expect(merged.some((command) => command.name === 'models')).toBe(true)
    expect(merged.every((command) => command.source === 'builtin')).toBe(true)
  })

  it('keeps the desktop entry when a built-in name collides case-insensitively', () => {
    const desktop = [
      {
        name: 'Models',
        description: 'Custom model picker',
        source: 'prompt' as const,
      },
    ]

    const merged = mergeHerdrCommands(desktop, BUILTIN_HERDR_COMMANDS.codex)

    expect(
      merged.filter((command) => command.name.toLowerCase() === 'models'),
    ).toEqual(desktop)
  })

  it('filters /mod to the Codex models built-in', () => {
    const merged = mergeHerdrCommands([], BUILTIN_HERDR_COMMANDS.codex)

    expect(filterHerdrCommands(merged, 'mod').map((item) => item.name)).toEqual(
      ['models'],
    )
  })
})

describe('filterHerdrCommands', () => {
  const commands = normalizeHerdrCommands({
    commands: [
      { name: 'review', description: 'Check the patch', source: 'command' },
      { name: 'release', description: 'Publish a build', source: 'command' },
      { name: 'deep-review', description: 'Inspect code', source: 'skill' },
      { name: 'inspect', description: 'Review files', source: 'prompt' },
    ],
  })

  it('orders name prefixes before other name or description matches', () => {
    expect(
      filterHerdrCommands(commands, 're').map((item) => item.name),
    ).toEqual(['review', 'release', 'deep-review', 'inspect'])
  })

  it('matches case-insensitively and caps displayed results', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      name: `Command-${index}`,
      source: 'command' as const,
    }))

    expect(filterHerdrCommands(many, 'COMMAND', 50)).toHaveLength(50)
  })
})
