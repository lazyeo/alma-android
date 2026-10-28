import type { DesktopStatus } from './connectionManager'

/**
 * Whether a screen's realtime socket should be open, plus a counter that
 * advances each time the desktop comes back online. Screens key their socket
 * effect on this value so a dropped tunnel closes the socket and a recovered
 * one reopens it exactly once, independent of how many status updates arrive.
 */
export interface RealtimeLink {
  online: boolean
  epoch: number
}

const isOnline = (status: DesktopStatus) => status === 'online'

export const initialRealtimeLink = (status: DesktopStatus): RealtimeLink =>
  isOnline(status) ? { online: true, epoch: 1 } : { online: false, epoch: 0 }

/** Returns the same object when nothing changed so effects do not re-run. */
export function nextRealtimeLink(
  link: RealtimeLink,
  status: DesktopStatus,
): RealtimeLink {
  const online = isOnline(status)
  if (online === link.online) return link
  return { online, epoch: online ? link.epoch + 1 : link.epoch }
}
