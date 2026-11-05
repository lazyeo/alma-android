import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useDesktopThreadEvents } from '../desktops/ThreadActivityProvider'
import { DUR_FAST_MS, DUR_PANEL_MS, EASE_OUT } from '../motionTokens'
import { useAlmaPresence } from './AlmaPresence'
import { useAlmaMotionRunning } from './almaExpand'
import {
  thoughtBubbleAllowed,
  thoughtEvent,
  ThoughtRhythm,
  type Thought,
  type ThoughtTool,
} from './thoughtBubble'
import { useReducedMotion } from './useReducedMotion'

/** Mirrors `--dur-stagger`: each trailing dot, then the bubble. */
const STAGGER_MS = 40

const AlmaThoughtContext = createContext<{
  thought: Thought | null
  reduced: boolean
} | null>(null)

function useDocumentHidden() {
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  )
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return hidden
}

/**
 * One rhythm for the whole app, so her face in the tab bar, the rail or
 * the dock shows the same single bubble. Reads only what the app already
 * has: presence (busy, approvals, mood) and her thread's events on the
 * shared `/ws/threads` stream (the step she started, a failed reply).
 */
export function AlmaThoughtProvider({ children }: { children: ReactNode }) {
  const presence = useAlmaPresence()
  const flying = useAlmaMotionRunning()
  const reduced = useReducedMotion()
  const hidden = useDocumentHidden()
  const [thought, setThought] = useState<Thought | null>(null)
  const [tool, setTool] = useState<ThoughtTool | undefined>()
  const rhythm = useRef<ThoughtRhythm | null>(null)
  rhythm.current ??= new ThoughtRhythm({ onChange: setThought })
  useEffect(() => () => rhythm.current?.dispose(), [])

  const ready = presence?.state.status === 'ready' ? presence.state : undefined
  const threadId = ready?.personal.threadId
  const busy = Boolean(
    ready && (presence?.generating || ready.personal.running > 0),
  )
  const pendingApprovals = ready?.personal.pendingApprovals ?? 0
  const mood = presence?.face.mood ?? 'neutral'

  // A failed reply shows at once; a reply that ends otherwise shows ✅.
  const failed = useRef(false)
  useDesktopThreadEvents(presence?.desktopId ?? '', (event) => {
    const step = thoughtEvent(threadId, event)
    if (step?.kind === 'step') setTool(step.tool)
    else if (step?.kind === 'error' && !failed.current) {
      failed.current = true
      rhythm.current?.finish('error')
    }
  })
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      if (!failed.current) rhythm.current?.finish('done')
      setTool(undefined)
    }
    if (!wasBusy.current && busy) failed.current = false
    wasBusy.current = busy
  }, [busy])

  useEffect(() => {
    rhythm.current?.update({
      busy,
      pendingApprovals,
      tool: busy ? tool : undefined,
      mood,
      suppressed: flying || hidden,
      reduced,
    })
  }, [busy, pendingApprovals, tool, mood, flying, hidden, reduced])

  return (
    <AlmaThoughtContext.Provider value={{ thought, reduced }}>
      {children}
    </AlmaThoughtContext.Provider>
  )
}

export type ThoughtPlacement = 'tab' | 'rail' | 'dock'

/**
 * The bubble itself, up and to the right of her face (beside it on the
 * rail and dock, which sit under the status bar). Absolutely placed in
 * the face's own box, so it never moves layout; decorative, since the
 * busy and approval state is already announced. Pops in with transform
 * and opacity only: the trailing dots first, then the bubble from 0.6 on
 * the plain ease-out; it fades out. Reduced motion: a plain fade.
 */
export function AlmaThought({
  placement,
  faceSize,
}: {
  placement: ThoughtPlacement
  faceSize: number
}) {
  const context = useContext(AlmaThoughtContext)
  const ref = useRef<HTMLSpanElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const thought = context?.thought
  const allowed = thoughtBubbleAllowed(faceSize)
  const reduced = context?.reduced ?? false
  // The rail is its own layer under the list pane, which would cover the
  // half of the bubble past its edge, so there the bubble is lifted into
  // the body at the anchor's box, read once per bubble (the rail never
  // moves while it shows).
  const lifted = placement === 'rail'
  const [fixedAt, setFixedAt] = useState<{ left: number; top: number }>()
  const id = allowed ? thought?.id : undefined
  useLayoutEffect(() => {
    if (!lifted || id === undefined || !anchorRef.current) return
    const box = anchorRef.current.getBoundingClientRect()
    setFixedAt({ left: box.left, top: box.top })
  }, [lifted, id])
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !thought || typeof root.animate !== 'function') return
    const animations: Animation[] = []
    const run = (
      element: Element | null,
      frames: Keyframe[],
      timing: KeyframeAnimationOptions,
    ) => {
      if (element instanceof HTMLElement)
        animations.push(
          element.animate(frames, { easing: EASE_OUT, ...timing }),
        )
    }
    if (thought.phase === 'out')
      run(root, [{ opacity: 1 }, { opacity: 0 }], {
        duration: DUR_FAST_MS,
        fill: 'forwards',
      })
    else if (reduced)
      run(root, [{ opacity: 0 }, { opacity: 1 }], {
        duration: DUR_PANEL_MS,
        fill: 'backwards',
      })
    else {
      const pop = [
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' },
      ]
      root.querySelectorAll('.alma-thought-dot').forEach((dot, index) =>
        run(dot, pop, {
          duration: DUR_FAST_MS,
          delay: index * STAGGER_MS,
          fill: 'backwards',
        }),
      )
      run(root.querySelector('.alma-thought-bubble'), pop, {
        duration: DUR_PANEL_MS,
        delay: 2 * STAGGER_MS,
        fill: 'backwards',
      })
    }
    return () => {
      for (const animation of animations) animation.cancel()
    }
  }, [thought?.id, thought?.phase, reduced, fixedAt])
  if (!allowed || !thought) return null
  const className = `alma-thought alma-thought-${placement}`
  const bubble = (
    <span
      ref={ref}
      className={lifted ? `${className} alma-thought-lifted` : className}
      aria-hidden="true"
      data-cue={thought.cue}
      data-phase={thought.phase}
      style={fixedAt && lifted ? fixedAt : undefined}
    >
      <span className="alma-thought-dot" />
      <span className="alma-thought-dot" />
      <span className="alma-thought-bubble">{thought.emoji}</span>
    </span>
  )
  if (!lifted) return bubble
  return (
    <>
      <span
        ref={anchorRef}
        className={`${className} alma-thought-anchor`}
        aria-hidden="true"
      />
      {fixedAt ? createPortal(bubble, document.body) : null}
    </>
  )
}
