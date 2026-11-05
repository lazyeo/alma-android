// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ThreadActivityProvider,
  useThreadActivityPublisher,
} from '../desktops/ThreadActivityProvider'
import type { RealtimeEvent } from '../relay'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AlmaPresenceContext, presenceFace } from './AlmaPresence'
import { AlmaThought, AlmaThoughtProvider } from './AlmaThought'
import { THOUGHT_TIMING } from './thoughtBubble'

const motion = vi.hoisted(() => ({ running: false }))
vi.mock('./almaExpand', () => ({
  useAlmaMotionRunning: () => motion.running,
}))

const ready = (
  counters: { running?: number; pendingApprovals?: number } = {},
): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId: 't-alma',
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: counters.running ?? 0,
    pendingApprovals: counters.pendingApprovals ?? 0,
  },
})

let publish: (event: RealtimeEvent) => void = () => undefined

function Publisher() {
  const { publish: send } = useThreadActivityPublisher()
  publish = (event) => send('home', event)
  return null
}

function tree(state: PersonalAgentState, faceSize: number, generating = false) {
  const children: ReactNode = (
    <>
      <Publisher />
      <span data-testid="face">
        <AlmaThought placement="tab" faceSize={faceSize} />
      </span>
    </>
  )
  return (
    <ThreadActivityProvider>
      <AlmaPresenceContext.Provider
        value={{
          desktopId: 'home',
          state,
          generating,
          face: presenceFace(state, generating),
          refresh: vi.fn(),
        }}
      >
        <AlmaThoughtProvider>{children}</AlmaThoughtProvider>
      </AlmaPresenceContext.Provider>
    </ThreadActivityProvider>
  )
}

const bubble = () => document.querySelector('.alma-thought')

beforeEach(() => {
  vi.useFakeTimers()
  motion.running = false
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AlmaThought', () => {
  it('pops one decorative bubble over her face while she works', () => {
    render(tree(ready({ running: 1 }), 60))
    const shown = bubble()
    expect(shown?.getAttribute('aria-hidden')).toBe('true')
    expect(shown?.textContent).toBe('💭')
    expect(document.querySelectorAll('.alma-thought-dot')).toHaveLength(2)
    act(() => vi.advanceTimersByTime(THOUGHT_TIMING.hold))
    expect(bubble()?.getAttribute('data-phase')).toBe('out')
    act(() => vi.advanceTimersByTime(THOUGHT_TIMING.exit))
    expect(bubble()).toBeNull()
  })

  it('shows nothing while she is idle', () => {
    render(tree(ready(), 60))
    act(() => vi.advanceTimersByTime(60_000))
    expect(bubble()).toBeNull()
  })

  it('never draws on small avatars', () => {
    render(tree(ready({ running: 1 }), 28))
    expect(bubble()).toBeNull()
  })

  it('names the tool her thread just started on the shared stream', () => {
    render(tree(ready({ running: 1 }), 60))
    act(() => vi.advanceTimersByTime(THOUGHT_TIMING.gap))
    act(() =>
      publish({
        type: 'message_delta',
        data: {
          threadId: 't-alma',
          deltas: [{ type: 'part_add', part: { type: 'tool-WebSearch' } }],
        },
      }),
    )
    expect(bubble()?.textContent).toBe('🔍')
  })

  it('shows a finished reply once when she goes idle', () => {
    const { rerender } = render(tree(ready(), 60, true))
    act(() => vi.advanceTimersByTime(THOUGHT_TIMING.gap))
    rerender(tree(ready(), 60, false))
    expect(bubble()?.textContent).toBe('✅')
  })

  it('stays down while her face flies in the expand', () => {
    motion.running = true
    const { rerender } = render(tree(ready({ running: 1 }), 60))
    expect(bubble()).toBeNull()
    motion.running = false
    rerender(tree(ready({ running: 1 }), 60))
    expect(bubble()?.textContent).toBe('💭')
  })
})
