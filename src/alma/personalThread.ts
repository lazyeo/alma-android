import { useEffect, useMemo } from 'react'
import type { PersonalAgentState } from '../screens/personalAgent'
import { useAlmaPresence } from './AlmaPresence'
import { personalThreadKey, type PersonalSetupStorage } from './personalSetup'

/**
 * Her main conversation lives behind the Alma tab, so every thread list
 * (Threads, projects, the project card, GTD, search) leaves it out. Lists
 * only ever drop it on the phone: the desktop thread is never touched.
 */
export function excludePersonalThread<T extends { id: string }>(
  threads: readonly T[],
  id: string | readonly string[] | null | undefined,
): T[] {
  const ids = typeof id === 'string' ? [id] : (id ?? [])
  if (!ids.length) return threads as T[]
  const hidden = new Set(ids)
  return threads.some((thread) => hidden.has(thread.id))
    ? threads.filter((thread) => !hidden.has(thread.id))
    : (threads as T[])
}

/**
 * Which thread is hers on `desktopId`:
 *
 * - the desktop's answer once it has one (presence ready with a thread);
 * - none on a desktop without a personal agent;
 * - else (loading, an error, a presence for another desktop, or a ready
 *   desktop still being set up) the id this phone last saw, so the row
 *   never flashes in while presence loads.
 */
export function personalThreadIds({
  desktopId,
  presenceDesktopId,
  state,
  cached,
}: {
  desktopId: string
  presenceDesktopId?: string
  state?: PersonalAgentState
  cached?: string | null
}): string[] {
  if (state && presenceDesktopId === desktopId) {
    if (state.status === 'ready' && state.personal.threadId)
      return [state.personal.threadId]
    if (state.status === 'unsupported') return []
  }
  return cached ? [cached] : []
}

function browserStorage(): PersonalSetupStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readCachedPersonalThread(
  desktopId: string,
  storage: PersonalSetupStorage | undefined = browserStorage(),
) {
  try {
    return storage?.getItem(personalThreadKey(desktopId)) || null
  } catch {
    return null
  }
}

export function rememberPersonalThread(
  desktopId: string,
  threadId: string,
  storage: PersonalSetupStorage | undefined = browserStorage(),
) {
  try {
    if (storage?.getItem(personalThreadKey(desktopId)) !== threadId)
      storage?.setItem(personalThreadKey(desktopId), threadId)
  } catch {
    // A full or blocked store only costs the cache.
  }
}

/** Her thread ids on `desktopId`, from presence or this phone's cache. */
export function usePersonalThreadIds(desktopId: string): string[] {
  const presence = useAlmaPresence()
  const state = presence?.state
  const presenceDesktopId = presence?.desktopId
  const desktopThread =
    presenceDesktopId === desktopId && state?.status === 'ready'
      ? state.personal.threadId
      : null
  // The desktop's answer is the cache for the next cold start.
  useEffect(() => {
    if (desktopThread) rememberPersonalThread(desktopId, desktopThread)
  }, [desktopId, desktopThread])
  const ids = personalThreadIds({
    desktopId,
    presenceDesktopId,
    state,
    cached: readCachedPersonalThread(desktopId),
  })
  const key = ids.join('\n')
  return useMemo(() => ids, [key])
}
