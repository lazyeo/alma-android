/**
 * Alma's thought bubble: now and then, while she works, a small comic
 * bubble over her face holds one emoji for what she is doing and how she
 * feels. Everything here is pure or timer-driven, so the mapping and the
 * rhythm are tested without a DOM.
 *
 * Signals, all already on the app: the presence poller (running work,
 * pending approvals, vitals), her main thread's generating flag, and the
 * shared `/ws/threads` stream, whose `message_delta` frames name the part
 * she just started (reasoning, text or a tool) and whose
 * `generation_error` marks a failed reply.
 */
import type { RealtimeEvent } from '../relay'
import { DUR_PANEL_MS, FADE_EXIT_MS } from '../motionTokens'
import type { FaceMood } from './faceState'

/** What a running tool is doing, from its name. */
export type ThoughtTool = 'search' | 'read' | 'write' | 'command'

export type ThoughtCue =
  'thinking' | ThoughtTool | 'approval' | 'error' | 'done' | 'tired' | 'happy'

export const THOUGHT_EMOJI: Record<ThoughtCue, string> = {
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
}

/** The bubble belongs to her big faces only, never small avatars. */
export const THOUGHT_MIN_FACE_PX = 32

export function thoughtBubbleAllowed(faceSize: number) {
  return faceSize >= THOUGHT_MIN_FACE_PX
}

// Checked in order: web search outranks "read" in `web_read`, a shell
// outranks "write" in `run_write_script`.
const TOOL_WORDS: [RegExp, ThoughtTool][] = [
  [/search|fetch|web|brows|grep|glob|find|lookup|query/, 'search'],
  [/bash|shell|exec|command|terminal|script|run|process|spawn/, 'command'],
  [
    /write|edit|patch|apply|creat|replace|insert|notebook|update|delete/,
    'write',
  ],
  [/read|view|open|cat\b|list|ls\b|get|load|show/, 'read'],
]

/** A tool name (`Bash`, `tool-WebSearch`, `mcp__x__read_file`) → its kind. */
export function thoughtTool(name: string): ThoughtTool {
  const text = name.replace(/^tool-/, '').toLowerCase()
  return TOOL_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? 'command'
}

/** What a `/ws/threads` event says about her main thread's current step. */
export type ThoughtEvent =
  { kind: 'step'; tool?: ThoughtTool } | { kind: 'error' } | undefined

/**
 * `message_delta` adding a part: a tool part names its tool, reasoning or
 * text clear it. `generation_error` marks the reply as failed.
 */
export function thoughtEvent(
  threadId: string | null | undefined,
  event: Pick<RealtimeEvent, 'type' | 'data'>,
): ThoughtEvent {
  const data = event.data
  if (!threadId || data?.threadId !== threadId) return undefined
  if (event.type === 'generation_error') return { kind: 'error' }
  if (event.type !== 'message_delta' || !Array.isArray(data.deltas))
    return undefined
  let step: ThoughtEvent
  for (const delta of data.deltas) {
    if (delta?.type !== 'part_add' || typeof delta.part?.type !== 'string')
      continue
    const part = delta.part
    if (part.type === 'dynamic-tool' || part.type.startsWith('tool-'))
      step = {
        kind: 'step',
        tool: thoughtTool(
          typeof part.toolName === 'string' ? part.toolName : part.type,
        ),
      }
    else if (part.type === 'reasoning' || part.type === 'text')
      step = { kind: 'step' }
  }
  return step
}

export interface ThoughtSignals {
  /** Her reply streams or other work runs. */
  busy: boolean
  pendingApprovals: number
  /** The tool her current step runs, when the stream said. */
  tool?: ThoughtTool
  mood: FaceMood
}

/** Share of busy bubbles that show her good mood instead of the work. */
export const HAPPY_FLAVOUR = 0.3

/**
 * The one emoji for now. Waiting on the user wins over everything; then a
 * finished or failed reply (shown once); nothing while idle; then the
 * running tool, then tiredness, then now and then a good mood, else 💭.
 * `flavour` (0..1, random per bubble) only picks the good-mood flavour.
 */
export function thoughtCue(
  signals: ThoughtSignals,
  outcome?: 'done' | 'error',
  flavour = 1,
): ThoughtCue | undefined {
  if (signals.pendingApprovals > 0) return 'approval'
  if (outcome) return outcome
  if (!signals.busy) return undefined
  if (signals.tool) return signals.tool
  if (signals.mood === 'tired' || signals.mood === 'sleepy') return 'tired'
  if (
    (signals.mood === 'happy' || signals.mood === 'relaxed') &&
    flavour < HAPPY_FLAVOUR
  )
    return 'happy'
  return 'thinking'
}

/** Rhythm, in ms. Reduced motion shows bubbles half as often. */
export const THOUGHT_TIMING = {
  /** How long a bubble stays up before it fades. */
  hold: 3500,
  /** Mirrors the bubble's fade out (`--dur-fast` and its slack). */
  exit: FADE_EXIT_MS,
  /** Mirrors the pop in (`--dur-panel`). */
  enter: DUR_PANEL_MS,
  /** While busy with nothing new, one bubble every 10–15 s. */
  period: 10_000,
  jitter: 5_000,
  /** Changes never stack closer than this. */
  gap: 5_000,
  reducedScale: 2,
} as const

export type ThoughtPhase = 'in' | 'out'

export interface Thought {
  /** Increments per bubble; the view restarts its pop-in on a new id. */
  id: number
  cue: ThoughtCue
  emoji: string
  phase: ThoughtPhase
}

interface RhythmOptions {
  onChange(thought: Thought | null): void
  random?: () => number
  now?: () => number
}

export interface RhythmInput extends ThoughtSignals {
  /** The expand or collapse flies her face, or the page is hidden. */
  suppressed: boolean
  reduced: boolean
}

/**
 * Decides when a bubble shows. A new cue (her step or state changed) shows
 * at once unless one is up or one showed under `gap` ago, then right after.
 * While she stays busy one shows every `period` plus up to `jitter`. A
 * finished or failed reply shows once. Never two at a time, none while
 * idle, and suppression drops the current one on the spot.
 */
export class ThoughtRhythm {
  private input: RhythmInput = {
    busy: false,
    pendingApprovals: 0,
    mood: 'neutral',
    suppressed: false,
    reduced: false,
  }
  private current: Thought | null = null
  private nextId = 0
  private lastKey: ThoughtCue | undefined
  private lastShownAt = -Infinity
  private pending = false
  private outcome: 'done' | 'error' | undefined
  private phaseTimer: ReturnType<typeof setTimeout> | undefined
  private waitTimer: ReturnType<typeof setTimeout> | undefined
  private periodTimer: ReturnType<typeof setTimeout> | undefined
  private readonly random: () => number
  private readonly now: () => number

  constructor(private readonly options: RhythmOptions) {
    this.random = options.random ?? Math.random
    this.now = options.now ?? Date.now
  }

  get thought() {
    return this.current
  }

  private scale() {
    return this.input.reduced ? THOUGHT_TIMING.reducedScale : 1
  }

  private active() {
    return this.input.busy || this.input.pendingApprovals > 0
  }

  update(input: RhythmInput) {
    const wasSuppressed = this.input.suppressed
    this.input = input
    if (input.suppressed) {
      this.drop()
      clearTimeout(this.waitTimer)
      this.clearPeriod()
      const key = thoughtCue(input)
      if (key !== this.lastKey) {
        this.lastKey = key
        this.pending = key !== undefined
      }
      return
    }
    const key = thoughtCue(input)
    if (key !== this.lastKey) {
      this.lastKey = key
      if (key !== undefined) this.request()
    } else if (wasSuppressed && (this.pending || this.outcome)) this.request()
    if (this.active()) this.schedulePeriod(false)
    else this.clearPeriod()
  }

  /** Her reply ended; shown once, after any bubble already up. */
  finish(outcome: 'done' | 'error') {
    this.outcome = outcome
    if (!this.input.suppressed) this.request()
  }

  dispose() {
    clearTimeout(this.phaseTimer)
    clearTimeout(this.waitTimer)
    this.clearPeriod()
  }

  private clearPeriod() {
    clearTimeout(this.periodTimer)
    this.periodTimer = undefined
  }

  private emit(thought: Thought | null) {
    this.current = thought
    this.options.onChange(thought)
  }

  private drop() {
    clearTimeout(this.phaseTimer)
    if (this.current) this.emit(null)
  }

  private request() {
    clearTimeout(this.waitTimer)
    const gap = THOUGHT_TIMING.gap * this.scale()
    const wait = Math.max(0, this.lastShownAt + gap - this.now())
    if (this.current || wait > 0) {
      this.pending = true
      if (!this.current) this.waitTimer = setTimeout(() => this.flush(), wait)
      return
    }
    this.show()
  }

  private flush() {
    if (this.input.suppressed || (!this.pending && !this.outcome)) return
    this.request()
  }

  private show() {
    this.pending = false
    const outcome = this.outcome
    this.outcome = undefined
    const cue = thoughtCue(this.input, outcome, this.random())
    if (!cue) return
    this.lastShownAt = this.now()
    this.emit({
      id: ++this.nextId,
      cue,
      emoji: THOUGHT_EMOJI[cue],
      phase: 'in',
    })
    clearTimeout(this.phaseTimer)
    this.phaseTimer = setTimeout(() => {
      if (!this.current) return
      this.emit({ ...this.current, phase: 'out' })
      this.phaseTimer = setTimeout(() => {
        this.emit(null)
        if (this.pending || this.outcome) this.request()
      }, THOUGHT_TIMING.exit)
    }, THOUGHT_TIMING.hold)
    if (this.active()) this.schedulePeriod(true)
  }

  /** The next unprompted bubble; `restart` re-arms it from now. */
  private schedulePeriod(restart: boolean) {
    if (this.periodTimer !== undefined && !restart) return
    this.clearPeriod()
    const delay =
      (THOUGHT_TIMING.period + this.random() * THOUGHT_TIMING.jitter) *
      this.scale()
    this.periodTimer = setTimeout(() => {
      this.periodTimer = undefined
      if (this.input.suppressed || !this.active()) return
      if (this.current) this.schedulePeriod(true)
      else this.show()
    }, delay)
  }
}
