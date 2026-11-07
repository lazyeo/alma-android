import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react'
import { useConnection, useDesktops } from '../desktops/DesktopContext'
import { visiblePairings } from '../desktops/desktopVisibility'
import {
  useDesktopThreadEvents,
  useUnreadActivity,
} from '../desktops/ThreadActivityProvider'
import { generatingChange, THREADS_RESYNCED } from '../desktops/threadActivity'
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
import { changedThreadIds, mergeThreadList } from './threadListMerge'
import { t } from '../i18n/runtime'
import {
  excludePersonalRunThreads,
  excludePersonalThread,
  usePersonalThreadIds,
} from '../alma/personalThread'

/**
 * The active desktop's thread list: cached first paint, a fresh load, a
 * catch-up after reconnects, and live updates from the shared `/ws/threads`.
 * Threads and GTD both read it so they always show the same rows, neither
 * of them Alma's main conversation nor her background run threads.
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
  const [threads, setRows] = useState<Thread[]>(initial.threads),
    [workspaces, setWorkspaces] = useState<Workspace[]>(initial.workspaces),
    [settings, setSettings] = useState<AlmaSettings>(initial.settings),
    [loading, setLoading] = useState(initial.loading),
    [error, setError] = useState('')
  // Rows as last set, so a load merges into them synchronously.
  const rowsRef = useRef(threads)
  // When each row last changed here (a live event or a local edit), so a
  // fetch that went out earlier cannot paint over it. A counter, not the
  // wall clock: an event and a request in the same millisecond must order.
  const clock = useRef(0)
  const touchedAt = useRef(new Map<string, number>())
  const requests = useRef({ issued: 0, applied: 0 })
  const pairingRef = useRef(pairing.id)
  pairingRef.current = pairing.id
  const replaceRows = (next: Thread[]) => {
    rowsRef.current = next
    setRows(next)
  }
  /** Local changes: events and the screens' own edits. */
  const setThreads = (action: SetStateAction<Thread[]>) => {
    const before = rowsRef.current
    const next = typeof action === 'function' ? action(before) : action
    if (next === before) return
    const now = ++clock.current
    for (const id of changedThreadIds(before, next))
      touchedAt.current.set(id, now)
    replaceRows(next)
  }
  const load = async () => {
    const seq = ++requests.current.issued
    const requestedAt = ++clock.current
    const requestedFor = pairing.id
    try {
      setError('')
      const [fetched, nextWorkspaces, nextSettings] = await Promise.all([
        api.listThreads(),
        api.listWorkspaces(),
        api.getSettings(),
      ])
      // Thread events fire a load each, and answers can come back out of
      // order; one older than what is already applied would undo it.
      if (pairingRef.current !== requestedFor) return
      if (seq < requests.current.applied) return
      requests.current.applied = seq
      const nextThreads = mergeThreadList(
        rowsRef.current,
        fetched,
        requestedAt,
        touchedAt.current,
      )
      for (const [id, at] of touchedAt.current)
        if (at <= requestedAt) touchedAt.current.delete(id)
      replaceRows(nextThreads)
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
      if (pairingRef.current === requestedFor)
        setError(e instanceof Error ? e.message : t('threads.errors.load'))
    } finally {
      if (pairingRef.current === requestedFor) setLoading(false)
    }
  }
  useEffect(() => {
    const cached = initialThreadListState(pairing.id, window.localStorage)
    touchedAt.current.clear()
    replaceRows(cached.threads)
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
      [
        'thread_created',
        'thread_updated',
        'thread_deleted',
        THREADS_RESYNCED,
      ].includes(event.type)
    ) {
      load()
    }
  })
  // Her main conversation opens from the Alma tab, never from a list.
  const personalIds = usePersonalThreadIds(pairing.id)
  const searchable = useMemo(
    () => excludePersonalThread(threads, personalIds),
    [threads, personalIds],
  )
  // Her run threads are filtered from the same state the rows render from,
  // so one arriving by thread_created or a refresh never paints first.
  const listed = useMemo(
    () => excludePersonalRunThreads(searchable),
    [searchable],
  )
  return {
    threads: listed,
    /** Every thread search may match: her run threads, not her main one. */
    searchableThreads: searchable,
    setThreads,
    workspaces,
    settings,
    loading,
    error,
    setError,
    /** Re-fetch threads, projects, and settings (pull-to-refresh). */
    reload: load,
  }
}
