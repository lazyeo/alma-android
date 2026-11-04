import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { useDesktops } from '../desktops/DesktopContext'
import { visiblePairings } from '../desktops/desktopVisibility'
import { useGeneratingIds } from '../desktops/ThreadActivityProvider'
import type { PersonalAgentState } from '../screens/personalAgent'
import { usePersonalAgent } from '../screens/usePersonalAgent'
import { prefetchAlmaThread } from './almaPrefetch'
import { faceActivity, faceMoodFromVitals, type FaceState } from './faceState'

export interface AlmaPresence {
  desktopId?: string
  state: PersonalAgentState
  /** The personal agent's main thread is streaming a reply. */
  generating: boolean
  face: FaceState
  refresh(): Promise<void>
  /** Warms the thread cache with her main thread before /alma opens. */
  prefetchThread?(fallbackTitle: string): void
}

export const AlmaPresenceContext = createContext<AlmaPresence | null>(null)

/** Alma's state for the active desktop; null outside the app shell. */
export const useAlmaPresence = () => useContext(AlmaPresenceContext)

export function presenceFace(
  state: PersonalAgentState,
  generating: boolean,
): FaceState {
  if (state.status !== 'ready') return { mood: 'neutral', activity: 'idle' }
  return {
    mood: faceMoodFromVitals(state.vitals),
    activity: faceActivity({
      generating,
      running: state.personal.running,
      pendingApprovals: state.personal.pendingApprovals,
    }),
  }
}

/**
 * One poller per app: the tab button, the rail, the /alma header and the
 * Threads pull-to-refresh all read and refresh the same state.
 */
export function AlmaPresenceProvider({ children }: { children: ReactNode }) {
  const { store, desktops } = useDesktops()
  const desktopId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const api = desktops.find((item) => item.pairing.id === desktopId)?.connection
    ?.api
  const { state, refresh } = usePersonalAgent(api)
  const generatingIds = useGeneratingIds(desktopId ?? '')
  const threadId = state.status === 'ready' ? state.personal.threadId : null
  const generating = Boolean(threadId && generatingIds.has(threadId))

  // A finished reply is when mood and counters usually move.
  const wasGenerating = useRef(generating)
  useEffect(() => {
    if (wasGenerating.current && !generating) void refresh()
    wasGenerating.current = generating
  }, [generating, refresh])

  const prefetchThread = useCallback(
    (fallbackTitle: string) => {
      if (api && desktopId && threadId)
        void prefetchAlmaThread(api, desktopId, threadId, { fallbackTitle })
    },
    [api, desktopId, threadId],
  )

  const value = useMemo<AlmaPresence>(
    () => ({
      desktopId,
      state,
      generating,
      face: presenceFace(state, generating),
      refresh,
      prefetchThread,
    }),
    [desktopId, state, generating, refresh, prefetchThread],
  )
  return (
    <AlmaPresenceContext.Provider value={value}>
      {children}
    </AlmaPresenceContext.Provider>
  )
}
