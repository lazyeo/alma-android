import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  DUR_FAST_MS,
  DUR_PANEL_MS,
  EASE_OUT,
  navigationMotionRunning,
  reducedMotionPreferred,
} from '../motionTokens'

export type FlipBox = { top: number; height: number }
export type FlipPlan = {
  moves: Array<{ key: string; dy: number }>
  enters: string[]
}

const STAGGER_MS = 40
const MAX_ENTERS = 6

/**
 * Decides how a list edit moves. Rows that stay glide from their old place
 * (`dy`, old top minus new top); a few new rows rise in. Nothing moves on
 * the first measurement, when the order is unchanged, or when most rows
 * are different (a tab, filter or desktop swap is a new list, not an
 * edit). Rows that are off screen at both ends are left alone.
 */
export function planListFlip(
  previous: Map<string, FlipBox>,
  next: Map<string, FlipBox>,
  view: { top: number; bottom: number },
  maxEnters = MAX_ENTERS,
): FlipPlan {
  const plan: FlipPlan = { moves: [], enters: [] }
  if (!previous.size || !next.size) return plan
  const before = [...previous.keys()]
  const after = [...next.keys()]
  if (
    before.length === after.length &&
    before.every((key, index) => key === after[index])
  )
    return plan
  const kept = after.filter((key) => previous.has(key))
  if (kept.length < Math.min(previous.size, next.size) / 2) return plan
  const onScreen = (box: FlipBox) =>
    box.top + box.height > view.top && box.top < view.bottom
  for (const key of kept) {
    const from = previous.get(key)!
    const to = next.get(key)!
    const dy = from.top - to.top
    if (Math.abs(dy) >= 1 && (onScreen(from) || onScreen(to)))
      plan.moves.push({ key, dy })
  }
  const added = after.filter((key) => !previous.has(key))
  if (added.length <= maxEnters)
    plan.enters = added.filter((key) => onScreen(next.get(key)!))
  return plan
}

function translateY(value: string) {
  const parts = value.trim().split(/\s+/)
  return parts.length > 1 ? Number.parseFloat(parts[1]) || 0 : 0
}

/**
 * A list edit (a row added, removed or moved) carries the rows below
 * instead of jumping them: every `[data-flip-key]` row inside the
 * container that changed place glides back from where it was on the
 * compositor (`translate` only, so it composes with the row's own
 * transform). Layout is read only when the key order changed, and never
 * while a route or `/alma` transition runs, under reduced motion, or in a
 * hidden page; those just take a new baseline next time.
 */
export function useListFlip(containerRef: RefObject<HTMLElement>) {
  const state = useRef<{
    container?: HTMLElement
    order: string
    boxes: Map<string, FlipBox>
    stale: boolean
    running: WeakMap<HTMLElement, Animation>
  }>({ order: '', boxes: new Map(), stale: false, running: new WeakMap() })

  useLayoutEffect(() => {
    const markStale = () => {
      state.current.stale = true
    }
    window.addEventListener('resize', markStale)
    return () => window.removeEventListener('resize', markStale)
  }, [])

  useLayoutEffect(() => {
    const current = state.current
    const container = containerRef.current
    if (!container) {
      current.container = undefined
      current.boxes = new Map()
      current.order = ''
      return
    }
    const nodes = [
      ...container.querySelectorAll<HTMLElement>('[data-flip-key]'),
    ]
    const keys = nodes.map((node) => node.dataset.flipKey ?? '')
    const order = keys.join('\n')
    if (container === current.container && order === current.order) return
    const baseline = container !== current.container || current.stale
    current.container = container
    current.order = order
    current.stale = false
    if (
      navigationMotionRunning() ||
      reducedMotionPreferred() ||
      document.visibilityState === 'hidden'
    ) {
      current.boxes = new Map()
      return
    }
    // A row still gliding keeps its visual offset as its new start.
    const offsets = new Map<HTMLElement, number>()
    for (const node of nodes) {
      const animation = current.running.get(node)
      if (animation?.playState !== 'running') continue
      offsets.set(node, translateY(getComputedStyle(node).translate))
      animation.cancel()
    }
    const origin = container.getBoundingClientRect().top
    const boxes = new Map<string, FlipBox>()
    const byKey = new Map<string, HTMLElement>()
    nodes.forEach((node, index) => {
      const rect = node.getBoundingClientRect()
      boxes.set(keys[index], { top: rect.top - origin, height: rect.height })
      byKey.set(keys[index], node)
    })
    const previous = current.boxes
    current.boxes = boxes
    if (baseline) return
    // Previous tops are layout tops; add any offset a row was showing.
    const shown = new Map(previous)
    for (const [node, offset] of offsets) {
      const key = node.dataset.flipKey ?? ''
      const box = shown.get(key)
      if (box) shown.set(key, { ...box, top: box.top + offset })
    }
    const plan = planListFlip(shown, boxes, {
      top: -origin,
      bottom: window.innerHeight - origin,
    })
    for (const { key, dy } of plan.moves) {
      const node = byKey.get(key)!
      if (typeof node.animate !== 'function') continue
      current.running.set(
        node,
        node.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], {
          duration: DUR_PANEL_MS,
          easing: EASE_OUT,
        }),
      )
    }
    plan.enters.forEach((key, index) => {
      const node = byKey.get(key)!
      if (typeof node.animate !== 'function') return
      current.running.set(
        node,
        node.animate(
          [
            { opacity: 0, translate: '0 8px' },
            { opacity: 1, translate: '0 0' },
          ],
          {
            duration: DUR_FAST_MS,
            delay: index * STAGGER_MS,
            easing: EASE_OUT,
            fill: 'backwards',
          },
        ),
      )
    })
  })
}
