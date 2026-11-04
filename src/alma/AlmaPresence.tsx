import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useDesktops } from '../desktops/DesktopContext'
import { visiblePairings } from '../desktops/desktopVisibility'
import { useGeneratingIds } from '../desktops/ThreadActivityProvider'
import type { PersonalAgentState } from '../screens/personalAgent'
import { usePersonalAgent } from '../screens/usePersonalAgent'
import { prefetchAlmaThread } from './almaPrefetch'
import { faceActivity, faceMoodFromVitals, type FaceState } from './faceState'
import { ensurePersonalThread } from './personalSetup'

/** Finding or creating her main conversation when the desktop has none. */
export type AlmaSetupStatus = 'idle' | 'running' | 'error'

export interface AlmaPresence {
  desktopId?: string
  state: PersonalAgentState
  /** The personal agent's main thread is streaming a reply. */
  generating: boolean
  face: FaceState
  refresh(): Promise<void>
  setup?: AlmaSetupStatus
  /** Finds or creates her main thread and points the desktop at it. */
  startSetup?(): void
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
  const { state: polled, refresh } = usePersonalAgent(api)
  const [setup, setSetup] = useState<{
    key?: string
    status: AlmaSetupStatus
    threadId?: string
  }>({ status: 'idle' })
  const setupKey = api && desktopId ? desktopId : undefined
  const current = setup.key === setupKey ? setup : { status: 'idle' as const }
  const latestKey = useRef(setupKey)
  latestKey.current = setupKey
  const startSetup = useCallback(() => {
    if (!api || !setupKey) return
    setSetup({ key: setupKey, status: 'running' })
    ensurePersonalThread(api, setupKey)
      .then(async (result) => {
        if (latestKey.current !== setupKey) return
        // The poller catches up from the desktop; until then the thread we
        // just resolved stands in, so a slow refresh cannot restart setup.
        setSetup({
          key: setupKey,
          status: 'idle',
          ...(result.status === 'ready' ? { threadId: result.threadId } : {}),
        })
        await refresh()
      })
      .catch((error) => {
        console.warn('[personal-agent] setup failed', error)
        if (latestKey.current === setupKey)
          setSetup({ key: setupKey, status: 'error' })
      })
  }, [api, setupKey, refresh])
  const state = useMemo<PersonalAgentState>(
    () =>
      polled.status === 'ready' && !polled.personal.threadId && current.threadId
        ? {
            ...polled,
            personal: { ...polled.personal, threadId: current.threadId },
          }
        : polled,
    [polled, current.threadId],
  )
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
      setup: current.status,
      startSetup,
      prefetchThread,
    }),
    [
      desktopId,
      state,
      generating,
      refresh,
      current.status,
      startSetup,
      prefetchThread,
    ],
  )
  return (
    <AlmaPresenceContext.Provider value={value}>
      {children}
    </AlmaPresenceContext.Provider>
  )
}
