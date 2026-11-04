import { describe, expect, it } from 'vitest'
import {
  listActions,
  personaLayout,
  personaParts,
  personaSide,
} from './personaLayout'

const row = (role: string) => ({ message: { role } })

describe('personaLayout', () => {
  it('groups consecutive rows by side and marks run edges', () => {
    expect(
      personaLayout([
        row('user'),
        row('assistant'),
        row('assistant'),
        row('tool'),
        row('user'),
        row('user'),
        row('assistant'),
      ]),
    ).toEqual([
      { side: 'user', first: true, last: true },
      { side: 'alma', first: true, last: false },
      { side: 'alma', first: false, last: false },
      { side: 'alma', first: false, last: true },
      { side: 'user', first: true, last: false },
      { side: 'user', first: false, last: true },
      { side: 'alma', first: true, last: true },
    ])
  })

  it('handles empty and single-row threads', () => {
    expect(personaLayout([])).toEqual([])
    expect(personaLayout([row('assistant')])).toEqual([
      { side: 'alma', first: true, last: true },
    ])
  })

  it('treats everything but the user as Alma', () => {
    expect(personaSide('user')).toBe('user')
    expect(personaSide('assistant')).toBe('alma')
    expect(personaSide('system')).toBe('alma')
  })
})

describe('personaParts', () => {
  it('collapses tools and sub-agents into distinct names in order', () => {
    const split = personaParts([
      { type: 'step-start' },
      { type: 'reasoning', text: 'Let me look.' },
      { type: 'tool-Read', state: 'output-available', toolCallId: 'a' },
      { type: 'dynamic-tool', toolName: 'Task', state: 'output-available' },
      { type: 'tool-Read', state: 'output-available', toolCallId: 'b' },
      { type: 'text', text: 'Done, all good.' },
      { type: 'file', url: 'x.png', mediaType: 'image/png' },
    ])
    expect(split.actions).toEqual(['Read', 'Task'])
    expect(split.body.map((part) => part.type)).toEqual(['text', 'file'])
    expect(split.reasoning).toHaveLength(1)
    expect(split.acting).toBe(false)
  })

  it('drops blank text and reasoning and flags tools without results', () => {
    const split = personaParts([
      { type: 'text', text: '  ' },
      { type: 'reasoning', text: '' },
      { type: 'tool-Bash', state: 'input-available' },
    ])
    expect(split.body).toEqual([])
    expect(split.reasoning).toEqual([])
    expect(split.actions).toEqual(['Bash'])
    expect(split.acting).toBe(true)
  })
})

describe('listActions', () => {
  it('joins names as a natural list in each language', () => {
    expect(listActions(['Read'], 'en')).toBe('Read')
    expect(listActions(['Read', 'Bash', 'Task'], 'en')).toMatch(
      /^Read, Bash,? and Task$/,
    )
    expect(listActions(['Read', 'Bash'], 'zh-CN')).toBe('Read和Bash')
  })
})
