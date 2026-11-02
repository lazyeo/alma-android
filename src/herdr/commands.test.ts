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
  it('adds the desktop 0.4.363 built-ins when the desktop list is empty', () => {
    const merged = mergeHerdrCommands([], BUILTIN_HERDR_COMMANDS.codex)

    expect(merged.map((command) => command.name)).toEqual([
      'model',
      'permissions',
      'review',
      'new',
      'resume',
      'fork',
      'init',
      'compact',
      'diff',
      'mention',
      'status',
      'mcp',
      'quit',
    ])
    expect(merged.every((command) => command.source === 'builtin')).toBe(true)
  })

  it('keeps the desktop entry when a built-in name collides case-insensitively', () => {
    const desktop = [
      {
        name: 'Model',
        description: 'Custom model picker',
        source: 'prompt' as const,
      },
    ]

    const merged = mergeHerdrCommands(desktop, BUILTIN_HERDR_COMMANDS.codex)

    expect(
      merged.filter((command) => command.name.toLowerCase() === 'model'),
    ).toEqual([{ ...desktop[0], interactive: true }])
  })

  it('marks only picker commands interactive and includes desktop hints', () => {
    expect(
      BUILTIN_HERDR_COMMANDS.claude.find(({ name }) => name === 'model'),
    ).toMatchObject({
      hint: '<model>',
      interactive: true,
    })
    expect(
      BUILTIN_HERDR_COMMANDS.claude.find(({ name }) => name === 'review')
        ?.interactive,
    ).toBeFalsy()
    expect(
      BUILTIN_HERDR_COMMANDS.codex.find(({ name }) => name === 'mention')
        ?.interactive,
    ).toBe(true)
    expect(
      BUILTIN_HERDR_COMMANDS.pi.find(({ name }) => name === 'thinking'),
    ).toMatchObject({
      hint: '<level>',
      interactive: true,
    })
  })

  it('filters /mod to the Codex model built-in', () => {
    const merged = mergeHerdrCommands([], BUILTIN_HERDR_COMMANDS.codex)

    expect(filterHerdrCommands(merged, 'mod').map((item) => item.name)).toEqual(
      ['model'],
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
