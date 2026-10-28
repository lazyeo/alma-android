export type OverlayClosingState = {
  phase: 'open' | 'closing' | 'closed'
  rendered: boolean
}

type OverlayClosingEvent =
  { type: 'open' } | { type: 'request-close' } | { type: 'finish-close' }

export function initialOverlayClosingState(open: boolean): OverlayClosingState {
  return open
    ? { phase: 'open', rendered: true }
    : { phase: 'closed', rendered: false }
}

export function shouldFinishOverlayClose(
  closing: boolean,
  target: EventTarget | null,
  overlay: EventTarget | null,
) {
  return closing && target === overlay
}

export function advanceOverlayClosing(
  state: OverlayClosingState,
  event: OverlayClosingEvent,
): OverlayClosingState {
  if (event.type === 'open') {
    if (state.phase === 'open' && state.rendered) return state
    return { phase: 'open', rendered: true }
  }
  if (event.type === 'request-close') {
    if (state.phase !== 'open') return state
    return { phase: 'closing', rendered: true }
  }
  if (state.phase !== 'closing') return state
  return { phase: 'closed', rendered: false }
}
