import { expect, it } from 'vitest'
import {
  groupParts,
  reasoningLive,
  thoughtLabel,
  toolState,
} from './streamingPresentation'
it('groups consecutive tools across step starts, preserving text boundaries', () => {
  const tool = { type: 'tool-Read' }
  const groups = groupParts([
    tool,
    { type: 'step-start' },
    tool,
    tool,
    { type: 'text', text: 'end' },
    tool,
  ])
  expect(groups.map((g) => g.parts.length)).toEqual([3, 1, 1])
  expect(groups.map((g) => g.tools)).toEqual([true, false, true])
})
it('only the unfinished reasoning tail of a generating message is live', () => {
  expect(
    reasoningLive(
      [{ type: 'reasoning' }, { type: 'text', text: 'answer started' }],
      0,
      true,
    ),
  ).toBe(false)
  expect(
    reasoningLive(
      [{ type: 'reasoning' }, { type: 'tool-Bash', state: 'input-available' }],
      0,
      true,
    ),
  ).toBe(false)
  expect(
    reasoningLive([{ type: 'reasoning' }, { type: 'step-start' }], 0, true),
  ).toBe(true)
  expect(reasoningLive([{ type: 'reasoning', state: 'done' }], 0, true)).toBe(
    false,
  )
  expect(reasoningLive([{ type: 'reasoning' }], 0, false)).toBe(false)
})
it('derives terminal tool states and duration labels', () => {
  expect(toolState({ type: 'tool-Bash', state: 'output-error' })).toBe('error')
  expect(toolState({ type: 'tool-Bash', state: 'output-available' })).toBe(
    'done',
  )
  expect(toolState({ type: 'tool-Bash', state: 'input-available' })).toBe(
    'running',
  )
  expect(thoughtLabel(2300, 8000)).toBe('Thought for 2s')
  expect(thoughtLabel(undefined, 5000)).toBe('Thought for 5s')
  expect(thoughtLabel()).toBe('Thought')
})
it('uses per-part milliseconds before row metadata seconds', async () => {
  const { reasoningDuration } = await import('./streamingPresentation')
  expect(
    reasoningDuration({ type: 'reasoning', reasoningDurationMs: 1200 }, 8),
  ).toBe(1200)
  expect(reasoningDuration({ type: 'reasoning' }, 8)).toBe(8000)
  expect(
    reasoningDuration({ type: 'reasoning', reasoningDurationMs: NaN }, -1),
  ).toBeUndefined()
})
