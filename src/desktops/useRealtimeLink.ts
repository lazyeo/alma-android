import { useState } from 'react'
import {
  initialRealtimeLink,
  nextRealtimeLink,
  type AlmaApi,
  type DesktopStatus,
  type RealtimeLink,
} from '../relay'

/**
 * Tracks the realtime link for one api. Derived during render (React's
 * "adjust state on prop change" pattern) so StrictMode double effects cannot
 * miscount reconnects; a new api starts a fresh link.
 */
export function useRealtimeLink(
  api: AlmaApi,
  status: DesktopStatus,
): RealtimeLink {
  const [state, setState] = useState(() => ({
    api,
    link: initialRealtimeLink(status),
  }))
  const link =
    state.api === api
      ? nextRealtimeLink(state.link, status)
      : initialRealtimeLink(status)
  if (state.api !== api || link !== state.link) setState({ api, link })
  return link
}
