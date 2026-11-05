import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THOUGHT_EMOJI,
  THOUGHT_TIMING,
  thoughtBubbleAllowed,
  thoughtCue,
  thoughtEvent,
  ThoughtRhythm,
  thoughtTool,
  type RhythmInput,
  type Thought,
} from './thoughtBubble'

describe('thoughtTool', () => {
  it.each([
    ['WebSearch', 'search'],
    ['tool-WebFetch', 'search'],
    ['Grep', 'search'],
    ['Glob', 'search'],
    ['Bash', 'command'],
    ['run_script', 'command'],
    ['Edit', 'write'],
    ['Write', 'write'],
    ['NotebookEdit', 'write'],
    ['Read', 'read'],
    ['mcp__fs__read_file', 'read'],
    ['Task', 'command'],
  ])('%s is %s', (name, kind) => {
    expect(thoughtTool(name)).toBe(kind)
  })
})

describe('thoughtEvent', () => {
  const delta = (part: Record<string, unknown>, threadId = 't-alma') => ({
    type: 'message_delta',
    data: { threadId, deltas: [{ type: 'part_add', seq: 1, part }] },
  })

  it('names the tool her step just started', () => {
    expect(thoughtEvent('t-alma', delta({ type: 'tool-Bash' }))).toEqual({
      kind: 'step',
      tool: 'command',
    })
    expect(
      thoughtEvent(
        't-alma',
        delta({ type: 'dynamic-tool', toolName: 'WebSearch' }),
      ),
    ).toEqual({ kind: 'step', tool: 'search' })
  })

  it('clears the tool when she reasons or writes her reply', () => {
    expect(thoughtEvent('t-alma', delta({ type: 'reasoning' }))).toEqual({
      kind: 'step',
    })
    expect(thoughtEvent('t-alma', delta({ type: 'text' }))).toEqual({
      kind: 'step',
    })
  })

  it('marks a failed reply and ignores other threads and frames', () => {
    expect(
      thoughtEvent('t-alma', {
        type: 'generation_error',
        data: { threadId: 't-alma' },
      }),
    ).toEqual({ kind: 'error' })
    expect(
      thoughtEvent('t-alma', delta({ type: 'tool-Bash' }, 't-other')),
    ).toBeUndefined()
    expect(thoughtEvent(null, delta({ type: 'tool-Bash' }))).toBeUndefined()
    expect(
      thoughtEvent('t-alma', {
        type: 'message_delta',
        data: { threadId: 't-alma', deltas: [{ type: 'text_append' }] },
      }),
    ).toBeUndefined()
  })
})

describe('thoughtCue', () => {
  const busy = { busy: true, pendingApprovals: 0, mood: 'neutral' as const }

  it('puts waiting on the user first, then a finished reply', () => {
    expect(
      thoughtCue({ ...busy, pendingApprovals: 1, tool: 'command' }, 'error'),
    ).toBe('approval')
    expect(thoughtCue({ ...busy, busy: false }, 'done')).toBe('done')
    expect(thoughtCue({ ...busy, busy: false }, 'error')).toBe('error')
  })

  it('shows nothing while idle', () => {
    expect(thoughtCue({ ...busy, busy: false, mood: 'happy' })).toBeUndefined()
  })

  it('names the tool, then tiredness, then sometimes her good mood', () => {
    expect(thoughtCue({ ...busy, tool: 'read', mood: 'tired' })).toBe('read')
    expect(thoughtCue({ ...busy, mood: 'sleepy' })).toBe('tired')
    expect(thoughtCue({ ...busy, mood: 'happy' }, undefined, 0.1)).toBe('happy')
    expect(thoughtCue({ ...busy, mood: 'happy' }, undefined, 0.9)).toBe(
      'thinking',
    )
    expect(thoughtCue(busy)).toBe('thinking')
  })

  it('has one emoji per cue', () => {
    expect(THOUGHT_EMOJI).toMatchObject({
      thinking: '💭',
      search: '🔍',
      read: '📖',
      write: '⌨️',
      command: '⚙️',
      approval: '✋',
      error: '😵‍💫',
      done: '✅',
      tired: '😪',
      happy: '😊',
    })
  })

  it('belongs to her big faces only', () => {
    expect([60, 52, 40, 32].every(thoughtBubbleAllowed)).toBe(true)
    expect([31, 28, 24].some(thoughtBubbleAllowed)).toBe(false)
  })
})

describe('ThoughtRhythm', () => {
  let shown: Array<Thought | null>
  let rhythm: ThoughtRhythm
  let random: () => number
  const base: RhythmInput = {
    busy: false,
    pendingApprovals: 0,
    mood: 'neutral',
    suppressed: false,
    reduced: false,
  }
  const visible = () => rhythm.thought
  const make = () =>
    new ThoughtRhythm({
      onChange: (thought) => shown.push(thought),
      random: () => random(),
      now: () => Date.now(),
    })
  const ids = () => [
    ...new Set(shown.flatMap((thought) => (thought ? [thought.id] : []))),
  ]

  beforeEach(() => {
    vi.useFakeTimers()
    shown = []
    random = () => 0.5
    rhythm = make()
  })
  afterEach(() => {
    rhythm.dispose()
    vi.useRealTimers()
  })

  it('stays quiet while idle', () => {
    rhythm.update(base)
    vi.advanceTimersByTime(60_000)
    expect(shown).toEqual([])
  })

  it('pops one bubble when work starts, holds it, then fades it out', () => {
    rhythm.update({ ...base, busy: true })
    expect(visible()).toMatchObject({ cue: 'thinking', phase: 'in' })
    vi.advanceTimersByTime(THOUGHT_TIMING.hold - 1)
    expect(visible()?.phase).toBe('in')
    vi.advanceTimersByTime(1)
    expect(visible()?.phase).toBe('out')
    vi.advanceTimersByTime(THOUGHT_TIMING.exit)
    expect(visible()).toBeNull()
  })

  it('repeats every 10 to 15 s with jitter while she stays busy', () => {
    for (const [roll, delay] of [
      [0, 10_000],
      [0.5, 12_500],
      [0.999, 14_995],
    ]) {
      rhythm.dispose()
      shown = []
      random = () => roll
      rhythm = make()
      rhythm.update({ ...base, busy: true })
      expect(ids()).toHaveLength(1)
      vi.advanceTimersByTime(delay - 1)
      expect(ids(), `roll ${roll}`).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(ids(), `roll ${roll}`).toHaveLength(2)
      // Unchanged state never brings one sooner than the period.
      rhythm.update({ ...base, busy: true })
      expect(ids()).toHaveLength(2)
    }
  })

  it('shows a new step at once, but never two bubbles or closer than the gap', () => {
    rhythm.update({ ...base, busy: true })
    vi.advanceTimersByTime(1000)
    rhythm.update({ ...base, busy: true, tool: 'search' })
    expect(visible()?.cue).toBe('thinking')
    vi.advanceTimersByTime(THOUGHT_TIMING.hold + THOUGHT_TIMING.exit - 1000)
    expect(visible()).toBeNull()
    vi.advanceTimersByTime(
      THOUGHT_TIMING.gap - (THOUGHT_TIMING.hold + THOUGHT_TIMING.exit) - 1,
    )
    expect(visible()).toBeNull()
    vi.advanceTimersByTime(1)
    expect(visible()).toMatchObject({ cue: 'search', phase: 'in' })
    // Each emission is the current bubble, a phase of it, or none: a new
    // id only ever follows null.
    let previous: Thought | null = null
    for (const thought of shown) {
      if (thought && previous) expect(thought.id).toBe(previous.id)
      previous = thought
    }
  })

  it('prefers the pending approval over the running tool', () => {
    rhythm.update({ ...base, busy: true, pendingApprovals: 1, tool: 'read' })
    expect(visible()?.cue).toBe('approval')
  })

  it('shows a finished reply once, then nothing while idle', () => {
    rhythm.update({ ...base, busy: true })
    vi.advanceTimersByTime(6000)
    rhythm.update(base)
    rhythm.finish('done')
    expect(visible()).toMatchObject({ cue: 'done', emoji: '✅' })
    vi.advanceTimersByTime(60_000)
    expect(ids()).toHaveLength(2)
    expect(visible()).toBeNull()
  })

  it('waits out a bubble already up before the finished one', () => {
    rhythm.update({ ...base, busy: true })
    rhythm.update(base)
    rhythm.finish('error')
    expect(visible()?.cue).toBe('thinking')
    vi.advanceTimersByTime(THOUGHT_TIMING.gap)
    expect(visible()).toMatchObject({ cue: 'error', emoji: '😵‍💫' })
  })

  it('drops the bubble during the face flight and shows what changed after', () => {
    rhythm.update({ ...base, busy: true })
    expect(visible()).not.toBeNull()
    rhythm.update({ ...base, busy: true, suppressed: true })
    expect(visible()).toBeNull()
    rhythm.update({ ...base, busy: true, tool: 'write', suppressed: true })
    vi.advanceTimersByTime(30_000)
    expect(ids()).toHaveLength(1)
    rhythm.update({ ...base, busy: true, tool: 'write' })
    expect(visible()).toMatchObject({ cue: 'write', emoji: '⌨️' })
  })

  it('holds a finished reply that lands mid-flight until the face lands', () => {
    rhythm.update({ ...base, suppressed: true })
    rhythm.finish('done')
    expect(visible()).toBeNull()
    rhythm.update(base)
    expect(visible()?.cue).toBe('done')
  })

  it('shows half as often under reduced motion', () => {
    random = () => 0
    rhythm.update({ ...base, busy: true, reduced: true })
    vi.advanceTimersByTime(19_999)
    expect(ids()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(ids()).toHaveLength(2)
    rhythm.update({ ...base, busy: true, reduced: true, tool: 'read' })
    vi.advanceTimersByTime(THOUGHT_TIMING.gap * 2 - 1)
    expect(ids()).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(ids()).toHaveLength(3)
  })
})
