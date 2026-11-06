// Shared by every live picture from the desktop (the Mac screen and the
// in-app browser): how long to wait before reopening a socket that the
// desktop or the network closed.

/**
 * Waits by consecutive failure. A target switch or a return to the app
 * reopens at once.
 */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]

export const reconnectDelay = (failures: number) =>
  RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)]
