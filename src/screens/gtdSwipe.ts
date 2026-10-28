import { gtdStatusLabel } from './gtdModel'
import type { ThreadGtdStatus } from './threadGtd'

/** Never start inside Android's left back-gesture zone (design: 24px). */
export const GTD_SWIPE_EDGE_PX = 24
/** Same claim rule as the sidebar: 10px, horizontal over 1.5× vertical. */
export const GTD_SWIPE_INTENT_PX = 10
/** Release past this distance commits the revealed action. */
export const GTD_SWIPE_COMMIT_PX = 88
/** The row stops following the finger here. */
export const GTD_SWIPE_MAX_PX = 128

export type GtdSwipeDirection = 'right' | 'left'
export interface GtdSwipeAction {
  status: ThreadGtdStatus
  label: string
}

const FORWARD_STATUS: Record<ThreadGtdStatus, ThreadGtdStatus | undefined> = {
  inbox: 'todo',
  todo: 'in_progress',
  in_progress: 'done',
  done: 'archived',
  archived: undefined,
}

const BACKWARD_STATUS: Record<ThreadGtdStatus, ThreadGtdStatus> = {
  inbox: 'archived',
  todo: 'inbox',
  in_progress: 'todo',
  done: 'in_progress',
  archived: 'done',
}

/**
 * Right advances one step through inbox → todo → in_progress → done → archived.
 * Left moves one step back, except Inbox files directly to Archived.
 */
export function gtdSwipeAction(
  status: ThreadGtdStatus,
  direction: GtdSwipeDirection,
): GtdSwipeAction | undefined {
  const target =
    direction === 'right' ? FORWARD_STATUS[status] : BACKWARD_STATUS[status]
  return target ? { status: target, label: gtdStatusLabel(target) } : undefined
}

export type GtdSwipeIntent = 'edge' | 'pending' | 'horizontal' | 'vertical'

export function gtdSwipeIntent(
  startX: number,
  dx: number,
  dy: number,
): GtdSwipeIntent {
  if (startX < GTD_SWIPE_EDGE_PX) return 'edge'
  const x = Math.abs(dx),
    y = Math.abs(dy)
  if (x >= GTD_SWIPE_INTENT_PX && x > 1.5 * y) return 'horizontal'
  if (y >= GTD_SWIPE_INTENT_PX && y >= x) return 'vertical'
  return 'pending'
}

const direction = (dx: number): GtdSwipeDirection => (dx > 0 ? 'right' : 'left')

export function gtdSwipeArmed(dx: number, status: ThreadGtdStatus) {
  if (Math.abs(dx) < GTD_SWIPE_COMMIT_PX) return undefined
  return gtdSwipeAction(status, direction(dx))
}

/** Visual offset; reduced motion keeps the row still and commits on release. */
export function gtdSwipeOffset(
  dx: number,
  status: ThreadGtdStatus,
  reducedMotion: boolean,
) {
  if (reducedMotion || !dx || !gtdSwipeAction(status, direction(dx))) return 0
  return Math.sign(dx) * Math.min(Math.abs(dx), GTD_SWIPE_MAX_PX)
}
