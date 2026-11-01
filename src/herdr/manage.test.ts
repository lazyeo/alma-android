import { describe, expect, it } from 'vitest'
import { agentTabName, firstString } from './manage'

describe('Herdr management helpers', () => {
  it('finds the first nested string for a response key', () => {
    expect(
      firstString('pane_id', {
        ignored: { pane_id: 42 },
        result: [{ pane_id: 'pane-created' }, { pane_id: 'pane-later' }],
      }),
    ).toBe('pane-created')
  })

  it('returns undefined when the key has no string value', () => {
    expect(firstString('pane_id', { pane_id: null, nested: [] })).toBeUndefined()
  })

  it('builds a desktop-compatible agent tab name', () => {
    expect(agentTabName('codex', () => 0x12ab34cd)).toBe('codex-12ab34cd')
  })
})
