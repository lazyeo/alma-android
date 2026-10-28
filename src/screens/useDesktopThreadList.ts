import { useEffect, useMemo, useState } from 'react'
import { useConnection, useDesktops } from '../desktops/DesktopContext'
import { visiblePairings } from '../desktops/desktopVisibility'
import {
  useDesktopThreadEvents,
  useUnreadActivity,
} from '../desktops/ThreadActivityProvider'
import { generatingChange } from '../desktops/threadActivity'
import { useRealtimeLink } from '../desktops/useRealtimeLink'
import {
  initialThreadListState,
  persistThreadList,
  threadCache,
  type AlmaSettings,
  type Thread,
  type Workspace,
} from '../relay'
import {
  desktopShareShortcuts,
  publishShareShortcuts,
} from '../share/shareShortcuts'
import { applyThreadTitleEvent } from './threadEvents'
import { t } from '../i18n/runtime'

/**
 * The active desktop's thread list: cached first paint, a fresh load, a
 * catch-up after reconnects, and live updates from the shared `/ws/threads`.
 * Threads and GTD both read it so they always show the same rows.
 */
export function useDesktopThreadList() {
  const { api, status, pairing } = useConnection()
  const { store } = useDesktops()
  // Hidden desktops drop out of Direct Share as well as the switcher.
  const pairedIds = visiblePairings(store.pairings).map((item) => item.id)
  const link = useRealtimeLink(api, status)
  const { seed } = useUnreadActivity()
  const initial = useMemo(
    () => initialThreadListState(pairing.id, window.localStorage),
    [pairing.id],
  )
  const [threads, setThreads] = useState<Thread[]>(initial.threads),
    [workspaces, setWorkspaces] = useState<Workspace[]>(initial.workspaces),
    [settings, setSettings] = useState<AlmaSettings>(initial.settings),
    [loading, setLoading] = useState(initial.loading),
    [error, setError] = useState('')
  const load = async () => {
    try {
      setError('')
      const [nextThreads, nextWorkspaces, nextSettings] = await Promise.all([
        api.listThreads(),
        api.listWorkspaces(),
        api.getSettings(),
      ])
      setThreads(nextThreads)
      if (!pairing.hidden)
        publishShareShortcuts(
          desktopShareShortcuts(
            pairing.id,
            pairing.name,
            nextThreads,
            pairedIds,
          ),
        )
      seed(pairing.id, nextThreads)
      setWorkspaces(nextWorkspaces)
      setSettings(nextSettings)
      threadCache.setThreadList(pairing.id, {
        threads: nextThreads,
        workspaces: nextWorkspaces,
        settings: nextSettings,
      })
      persistThreadList(
        window.localStorage,
        pairing.id,
        nextThreads,
        nextWorkspaces,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('threads.errors.load'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const cached = initialThreadListState(pairing.id, window.localStorage)
    setThreads(cached.threads)
    setWorkspaces(cached.workspaces)
    setSettings(cached.settings)
    setLoading(cached.loading)
    void load()
  }, [api, pairing.id])
  useEffect(() => {
    // Thread events were missed while the tunnel was down; catch up once.
    if (link.online && link.epoch > 1) load()
  }, [link])
  // Events come from the desktop's shared background `/ws/threads`.
  useDesktopThreadEvents(pairing.id, (event) => {
    setThreads((rows) =>
      rows.map((row) => {
        const change = generatingChange(row.id, event)
        return change === undefined ? row : { ...row, isGenerating: change }
      }),
    )
    if (['title_generating', 'title_generated'].includes(event.type)) {
      setThreads((rows) => applyThreadTitleEvent(rows, event))
    }
    if (
      ['thread_created', 'thread_updated', 'thread_deleted'].includes(
        event.type,
      )
    ) {
      load()
    }
  })
  return {
    threads,
    setThreads,
    workspaces,
    settings,
    loading,
    error,
    setError,
  }
}
