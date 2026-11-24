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
  backgroundThreadKind,
  excludePersonalRunThreads,
  excludePersonalThread,
  usePersonalThreadIds,
  type HiddenThreadKind,
} from '../alma/personalThread'
import { useShowHiddenThreads } from './showHiddenThreads'

const NO_IDS: ReadonlySet<string> = new Set()
const withoutIds = (threads: Thread[], ids: ReadonlySet<string>) =>
  ids.size ? threads.filter((thread) => !ids.has(thread.id)) : threads

/**
 * The active desktop's thread list: cached first paint, a fresh load, a
 * catch-up after reconnects, and live updates from the shared `/ws/threads`.
 * Threads and GTD both read it so they always show the same rows, never
 * Alma's main conversation, and her background run threads and external
 * chats only while "Show hidden threads" is on.
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
  const [showHidden, setShowHidden] = useShowHiddenThreads()
  // Read by loads already in flight, which closed over an older render.
  const showHiddenRef = useRef(showHidden)
  showHiddenRef.current = showHidden
  // Threads only the `showExternal` answer had: the desktop's channel chats.
  const [externalIds, setExternalIds] = useState(NO_IDS)
  const externalIdsRef = useRef(externalIds)
  externalIdsRef.current = externalIds
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
    const withExternal = showHiddenRef.current
    try {
      setError('')
      const [listed, everything, nextWorkspaces, nextSettings] =
        await Promise.all([
          api.listThreads(),
          // Only the difference marks a thread external: no row field does.
          withExternal ? api.listThreads({ showExternal: true }) : undefined,
          api.listWorkspaces(),
          api.getSettings(),
        ])
      const fetched = everything ?? listed
      // Thread events fire a load each, and answers can come back out of
      // order; one older than what is already applied would undo it.
      if (pairingRef.current !== requestedFor) return
      if (seq < requests.current.applied) return
      requests.current.applied = seq
      const listedIds = new Set(listed.map((thread) => thread.id))
      const merged = mergeThreadList(
        rowsRef.current,
        fetched,
        requestedAt,
        touchedAt.current,
      )
      // A default load answers without the external chats; one kept only
      // because an event touched it would otherwise come back untagged.
      const nextThreads = everything
        ? merged
        : merged.filter(
            (thread) =>
              listedIds.has(thread.id) ||
              !externalIdsRef.current.has(thread.id),
          )
      for (const [id, at] of touchedAt.current)
        if (at <= requestedAt) touchedAt.current.delete(id)
      const nextExternal: ReadonlySet<string> = everything
        ? new Set(
            everything
              .filter((thread) => !listedIds.has(thread.id))
              .map((thread) => thread.id),
          )
        : NO_IDS
      replaceRows(nextThreads)
      setExternalIds((ids) =>
        ids.size || nextExternal.size ? nextExternal : ids,
      )
      // Shares and caches keep the desktop's default list, so a cold start
      // with the toggle off never paints an external chat first.
      const defaultThreads = withoutIds(nextThreads, nextExternal)
      if (!pairing.hidden)
        publishShareShortcuts(
          desktopShareShortcuts(
            pairing.id,
            pairing.name,
            defaultThreads,
            pairedIds,
          ),
        )
      seed(pairing.id, nextThreads)
      setWorkspaces(nextWorkspaces)
      setSettings(nextSettings)
      threadCache.setThreadList(pairing.id, {
        threads: defaultThreads,
        workspaces: nextWorkspaces,
        settings: nextSettings,
      })
      persistThreadList(
        window.localStorage,
        pairing.id,
        defaultThreads,
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
    setExternalIds(NO_IDS)
    setWorkspaces(cached.workspaces)
    setSettings(cached.settings)
    setLoading(cached.loading)
    void load()
  }, [api, pairing.id])
  const toggledHidden = useRef(showHidden)
  useEffect(() => {
    // Turning it on needs the `showExternal` list; off drops those rows.
    if (toggledHidden.current === showHidden) return
    toggledHidden.current = showHidden
    void load()
  }, [showHidden])
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
  // Rows still on screen from a `showExternal` load go once it is off,
  // before the reload that drops them answers.
  const searchable = useMemo(
    () =>
      excludePersonalThread(
        showHidden ? threads : withoutIds(threads, externalIds),
        personalIds,
      ),
    [threads, personalIds, showHidden, externalIds],
  )
  // Her run threads are filtered from the same state the rows render from,
  // so one arriving by thread_created or a refresh never paints first.
  const listed = useMemo(
    () => (showHidden ? searchable : excludePersonalRunThreads(searchable)),
    [searchable, showHidden],
  )
  const hiddenKindOf = useMemo(
    () =>
      (thread: Thread): HiddenThreadKind | undefined =>
        externalIds.has(thread.id) ? 'external' : backgroundThreadKind(thread),
    [externalIds],
  )
  return {
    threads: listed,
    /** Every thread search may match: her run threads, not her main one. */
    searchableThreads: searchable,
    /** Whether the lists include her run threads and external chats. */
    showHidden,
    setShowHidden,
    /** Why a row would be hidden with the toggle off, for its tag. */
    hiddenKindOf,
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
