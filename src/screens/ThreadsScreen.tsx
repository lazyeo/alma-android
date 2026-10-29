import {
  highlightQuery,
  searchSnippet,
  parseThreadSearch,
  type SearchHit,
} from './threadSearch'
import { isUnsupportedEndpoint } from '../relay'
import { filterProjects, filterThreadList } from './threadListModel'
import { useUnreadActivity } from '../desktops/ThreadActivityProvider'
import { haptic } from '../haptics'
import {
  AtSign,
  CalendarClock,
  Check,
  ChevronDown,
  Gem,
  Library,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TabBar } from '../components/TabBar'
import {
  useLocation,
  useNavigate,
  type NavigateOptions,
} from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { AnchoredMenu, pointAnchor } from '../components/AnchoredMenu'
import { useConnection } from '../desktops/DesktopContext'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { threadNavigationOptions } from '../layout/splitLayout'
import {
  desktopCrystalsPath,
  desktopGtdPath,
  desktopReferencesPath,
  desktopThreadPath,
  desktopTimeCluesPath,
} from '../desktopRoutes'
import { useTimeCluesStatus } from './useTimeCluesStatus'
import type { Thread } from '../relay'
import { resolveDefaultWorkspaceId } from './workspaceOptions'
import { presenceClass, usePresence } from '../components/usePresence'
import { autoTodo, findAutoTodoMessage, isTodoThread } from './threadGtd'
import {
  ThreadRow,
  ThreadRowContent,
  relative,
  useThreadRowIndicators,
} from './ThreadListRow'
import { useThreadOrganize } from './ThreadOrganize'
import { useDesktopThreadList } from './useDesktopThreadList'
import { useT } from '../i18n'

export function ThreadsScreen({
  selectedThreadId,
}: {
  /** Highlighted row when the list sits beside an open thread. */
  selectedThreadId?: string
} = {}) {
  const t = useT()
  const { api, pairing } = useConnection(),
    navigate = useNavigate(),
    location = useLocation()
  const navigateToThread = (threadId: string, options?: NavigateOptions) => {
    const path = desktopThreadPath(pairing.id, threadId)
    navigate(path, {
      ...threadNavigationOptions(location.pathname, path),
      ...options,
    })
  }
  const {
    threads,
    setThreads,
    workspaces,
    settings,
    loading,
    error,
    setError,
  } = useDesktopThreadList()
  const [query, setQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false)
  const errorPresence = usePresence(Boolean(error))
  const presentedError = useRef(error)
  if (error) presentedError.current = error
  const [tab, setTab] = useState<'threads' | 'projects'>('threads')
  const [remote, setRemote] = useState<{ query: string; hits: SearchHit[] }>({
    query: '',
    hits: [],
  })
  const [searchState, setSearchState] = useState('')
  const [searchSupported, setSearchSupported] = useState(true)
  const { supported: timeCluesSupported, unread: timeCluesUnread } =
    useTimeCluesStatus(pairing.id)
  useEffect(() => {
    setSearchSupported(true)
  }, [api])
  useEffect(() => {
    const q = query.trim()
    let cancelled = false
    setSearchState('')
    if (q.length < 2 || tab !== 'threads' || !searchSupported) return
    setSearchState('loading')
    const timer = window.setTimeout(() => {
      api
        .searchThreads(q)
        .then((value) => {
          if (cancelled) return
          setRemote({ query: q, hits: parseThreadSearch(value, q) })
          setSearchState('')
        })
        .catch((cause) => {
          if (cancelled) return
          if (isUnsupportedEndpoint(cause)) {
            setSearchSupported(false)
            setSearchState('')
          } else setSearchState(t('threads.search.contentUnavailable'))
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [api, query, tab, searchSupported])
  const { markRead } = useUnreadActivity()
  const { generating, pendingThreadIds, indicatorsFor } =
    useThreadRowIndicators(pairing.id)
  const [projectId, setProjectId] = useState<string>()
  const searchRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<Thread>()
  const visible = useMemo(
    () =>
      filterThreadList(
        threads,
        workspaces,
        query,
        tab === 'projects' && projectId ? projectId : 'all',
      ),
    [threads, query, projectId, workspaces, tab],
  )
  const defaultWorkspaceId = useMemo(
    () => resolveDefaultWorkspaceId(settings, workspaces),
    [settings, workspaces],
  )
  const projects = useMemo(
    () => filterProjects(threads, workspaces, query),
    [threads, workspaces, query],
  )
  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchRef.current?.focus())
  }, [searchOpen])
  useEffect(() => {
    const closeSearch = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !searchOpen) return
      setSearchOpen(false)
      setQuery('')
    }
    window.addEventListener('keydown', closeSearch)
    return () => window.removeEventListener('keydown', closeSearch)
  }, [searchOpen])
  const create = (
    workspaceId: string | null | undefined = defaultWorkspaceId,
  ) => {
    setCreateOpen(false)
    navigate(
      `/d/${encodeURIComponent(pairing.id)}/threads?new=1&project=${encodeURIComponent(workspaceId ?? '')}`,
    )
  }
  // Row actions open a sheet; the old prompt() asked the user to type the
  // literal word "rename", so a typed title was silently ignored.
  const [actionMenu, setActionMenu] = useState<{
    thread: Thread
    x: number
    y: number
  }>()
  const [renaming, setRenaming] = useState<{ thread: Thread; title: string }>()
  const [saving, setSaving] = useState(false)
  const organize = useThreadOrganize({ api, threads, setThreads, setError })
  const submitRename = async () => {
    void haptic('light')
    if (!renaming) return
    const title = renaming.title.trim()
    if (!title || title === renaming.thread.title) {
      setRenaming(undefined)
      return
    }
    setSaving(true)
    try {
      const updated = await api.renameThread(renaming.thread.id, title)
      setThreads((rows) =>
        rows.map((row) =>
          row.id === renaming.thread.id
            ? { ...row, title: updated.title || title }
            : row,
        ),
      )
      setRenaming(undefined)
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : t('threads.errors.rename'),
      )
    } finally {
      setSaving(false)
    }
  }
  const markDone = (thread: Thread) => {
    setActionMenu(undefined)
    void organize.setStatus(thread, 'done')
  }
  const goToTodoMessage = async (thread: Thread) => {
    const todo = autoTodo(thread)
    if (!todo) return
    setActionMenu(undefined)
    try {
      const detail = await api.getThread(thread.id)
      const match = findAutoTodoMessage(detail.messages ?? [], todo)
      navigateToThread(thread.id, {
        state: match ? { fromSearch: true, searchRowId: match.id } : undefined,
      })
    } catch (navigateError) {
      setError(
        navigateError instanceof Error
          ? navigateError.message
          : t('threads.errors.findTodo'),
      )
    }
  }
  const removeThread = async (thread: Thread) => {
    void haptic('light')
    setActionMenu(undefined)
    setDeleting(undefined)
    try {
      await api.deleteThread(thread.id)
      setThreads((rows) => rows.filter((row) => row.id !== thread.id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('threads.errors.delete'),
      )
    }
  }
  return (
    <section className="root-page threads-page">
      <ScopedRootHeader
        title={t('nav.threads')}
        className={searchOpen ? 'searching' : ''}
        actions={
          <>
            <AnchoredMenu
              open={libraryOpen}
              onOpenChange={setLibraryOpen}
              label={t('threads.library')}
              trigger={
                <button
                  className="header-icon-button library-entry split-header-hidden"
                  aria-label={t('threads.library')}
                >
                  <Library size={19} />
                  {timeCluesUnread ? (
                    <span
                      className="library-unread-dot"
                      aria-label={t('nav.unseenTimeClues')}
                    />
                  ) : null}
                </button>
              }
              items={[
                {
                  key: 'crystals',
                  label: t('nav.crystals'),
                  icon: <Gem size={16} />,
                  onSelect: () => navigate(desktopCrystalsPath(pairing.id)),
                },
                ...(timeCluesSupported
                  ? [
                      {
                        key: 'time-clues',
                        label: t('nav.timeClues'),
                        icon: <CalendarClock size={16} />,
                        detail: timeCluesUnread ? (
                          <span
                            className="library-menu-unread-dot"
                            aria-label={t('threads.unseen')}
                          />
                        ) : undefined,
                        onSelect: () =>
                          navigate(desktopTimeCluesPath(pairing.id)),
                      },
                    ]
                  : []),
                {
                  key: 'references',
                  label: t('nav.references'),
                  icon: <AtSign size={16} />,
                  onSelect: () => navigate(desktopReferencesPath(pairing.id)),
                },
              ]}
            />
            <button
              className="header-icon-button gtd-entry split-header-hidden"
              aria-label={t('nav.gtd')}
              onClick={() => {
                void haptic('light')
                navigate(desktopGtdPath(pairing.id))
              }}
            >
              <ListTodo size={19} />
            </button>
            <button
              className="header-icon-button"
              aria-label={t('common.search')}
              onClick={() => {
                setSearchOpen(true)
                void haptic('light')
              }}
            >
              <Search size={19} />
            </button>
            <button
              className="header-icon-button"
              onClick={() => {
                void haptic('light')
                navigate(`/d/${encodeURIComponent(pairing.id)}/threads?new=1`)
              }}
              aria-label={t('threads.newThread')}
            >
              <Plus size={20} strokeWidth={2} />
            </button>
          </>
        }
      >
        <div className="thread-header-search">
          <div className="thread-search-pill">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('threads.search.label')}
              aria-label={t('threads.search.label')}
              tabIndex={searchOpen ? 0 : -1}
            />
            <button
              className="thread-search-clear"
              aria-label={
                query ? t('threads.search.clear') : t('threads.search.close')
              }
              onClick={() => {
                if (query) setQuery('')
                else setSearchOpen(false)
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </ScopedRootHeader>
      <TabBar<'threads' | 'projects'>
        items={[
          { value: 'threads', label: t('nav.threads') },
          { value: 'projects', label: t('threads.projects') },
        ]}
        selected={tab}
        onSelect={setTab}
        label={t('threads.views')}
      />
      <div className="page-body threads-page-body">
        {errorPresence.rendered ? (
          <p className={`error ${presenceClass(errorPresence.phase)}`}>
            {presentedError.current}
          </p>
        ) : null}
        <div className={`thread-list thread-tab-content ${tab}`} key={tab}>
          {loading ? (
            <p className="empty">{t('threads.loading')}</p>
          ) : tab === 'projects' ? (
            projects.length ? (
              projects.map((project) => {
                const open = project.id === projectId
                const projectThreads = filterThreadList(
                  threads,
                  workspaces,
                  '',
                  project.id,
                )
                return (
                  <div
                    className={`project-group${open ? ' open' : ''}`}
                    key={project.id}
                  >
                    <button
                      className="project-row"
                      aria-expanded={open}
                      onClick={() => {
                        setProjectId(open ? undefined : project.id)
                        void haptic('light')
                      }}
                    >
                      <span className="project-row-copy">
                        <strong>{project.name}</strong>
                        <small>
                          {t('threads.threadCount', { count: project.count })}
                        </small>
                      </span>
                      <span className="project-row-meta">
                        <time>{relative(project.latestActivity)}</time>
                        <ChevronDown size={16} />
                      </span>
                    </button>
                    <div className="project-threads" aria-hidden={!open}>
                      <div className="project-threads-inner">
                        <button
                          className="project-new-action"
                          onClick={() =>
                            void create(
                              project.id === 'none' ? null : project.id,
                            )
                          }
                        >
                          <Plus size={14} />
                          {t('threads.newInProject')}
                        </button>
                        {projectThreads.map((thread) => (
                          <CompactProjectThread
                            key={thread.id}
                            thread={thread}
                            selected={thread.id === selectedThreadId}
                            needsResponse={
                              // Generating outranks a pending response.
                              pendingThreadIds.has(thread.id) &&
                              !generating.has(thread.id) &&
                              !thread.isGenerating
                            }
                            onOpen={() => {
                              markRead(pairing.id, thread.id)
                              navigateToThread(thread.id)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="empty">{t('threads.noProjects')}</p>
            )
          ) : query.trim() ? (
            <div className="search-results" aria-live="polite">
              {(() => {
                const q = query.trim()
                const local = threads.filter(
                  (row) =>
                    !row.parentThreadId &&
                    !row.isIncognito &&
                    (row.title || '').toLowerCase().includes(q.toLowerCase()),
                )
                const hits = remote.query === q ? remote.hits : []
                const titles = local.map(
                  (row) =>
                    hits.find((h) => h.id === row.id) || {
                      id: row.id,
                      title: row.title || t('common.untitledThread'),
                      count: 0,
                      snippets: [],
                    },
                )
                for (const hit of hits)
                  if (
                    hit.title.toLowerCase().includes(q.toLowerCase()) &&
                    !titles.some((title) => title.id === hit.id)
                  )
                    titles.push(hit)
                const content = hits.filter(
                  (h) => !titles.some((title) => title.id === h.id),
                )
                return (
                  <>
                    {(
                      [
                        [t('threads.search.titleMatches'), titles],
                        [t('threads.search.contentMatches'), content],
                      ] as const
                    ).map(([label, rows]) =>
                      rows.length ? (
                        <section key={label}>
                          <h2 className="search-group-title">{label}</h2>
                          {rows.map((hit) => (
                            <article className="search-result" key={hit.id}>
                              <button
                                className="search-result-title"
                                onClick={() => navigateToThread(hit.id)}
                              >
                                <Highlight text={hit.title} query={q} />
                                {hit.count > 0 ? (
                                  <small>
                                    {t('threads.search.matches', {
                                      count: hit.count,
                                    })}
                                  </small>
                                ) : null}
                              </button>
                              {hit.snippets.map((snippet, index) => (
                                <button
                                  className="search-snippet"
                                  key={index}
                                  onClick={() =>
                                    navigateToThread(hit.id, {
                                      state: {
                                        searchRowId: snippet.rowId || '',
                                        fromSearch: true,
                                      },
                                    })
                                  }
                                >
                                  <Highlight
                                    text={searchSnippet(snippet.text, q)}
                                    query={q}
                                  />
                                </button>
                              ))}
                            </article>
                          ))}
                        </section>
                      ) : null,
                    )}
                    {searchState === 'loading' ? (
                      <p className="empty">
                        <LoaderCircle className="spinner" size={14} />{' '}
                        {t('threads.search.searching')}
                      </p>
                    ) : searchState ? (
                      <p className="error">{searchState}</p>
                    ) : !titles.length && !content.length ? (
                      <p className="empty">{t('threads.search.noMatches')}</p>
                    ) : null}
                    {!searchSupported ? (
                      <p className="empty">{t('threads.search.titleOnly')}</p>
                    ) : null}
                  </>
                )
              })()}
            </div>
          ) : visible.length ? (
            visible.map((thread) => {
              const selected = thread.id === selectedThreadId
              return (
                <ThreadRow
                  className={`thread-row${selected ? ' selected' : ''}`}
                  key={thread.id}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => {
                    void haptic('light')
                    markRead(pairing.id, thread.id)
                    navigateToThread(thread.id)
                  }}
                  onActions={({ x, y }) => setActionMenu({ thread, x, y })}
                >
                  <ThreadRowContent
                    thread={thread}
                    workspaces={workspaces}
                    indicators={indicatorsFor(
                      thread,
                      organize.pendingDoneIds.has(thread.id),
                    )}
                  />
                </ThreadRow>
              )
            })
          ) : (
            <p className="empty">{t('threads.empty')}</p>
          )}
        </div>
      </div>
      <AnchoredMenu
        open={Boolean(actionMenu)}
        onOpenChange={(open: boolean) => {
          if (!open) setActionMenu(undefined)
        }}
        anchorRect={
          actionMenu ? pointAnchor(actionMenu.x, actionMenu.y) : undefined
        }
        label={t('threads.actions.label')}
        immediateClose
        header={
          actionMenu && isTodoThread(actionMenu.thread) ? (
            <div className="thread-todo-menu">
              {autoTodo(actionMenu.thread) ? (
                <>
                  <strong>{autoTodo(actionMenu.thread)?.what}</strong>
                  <small>{autoTodo(actionMenu.thread)?.quote}</small>
                  <button
                    onClick={() => void goToTodoMessage(actionMenu.thread)}
                  >
                    {t('threads.actions.goToMessage')}
                  </button>
                </>
              ) : null}
              <button onClick={() => markDone(actionMenu.thread)}>
                {t('threads.actions.markDone')}
              </button>
            </div>
          ) : undefined
        }
        items={
          actionMenu
            ? [
                ...organize.menuItems(actionMenu.thread),
                { type: 'separator', key: 'organize-separator' },
                {
                  key: 'rename',
                  label: t('common.rename'),
                  icon: <Pencil size={16} />,
                  onSelect: () =>
                    setRenaming({
                      thread: actionMenu.thread,
                      title: actionMenu.thread.title ?? '',
                    }),
                },
                { type: 'separator', key: 'danger-separator' },
                {
                  key: 'delete',
                  label: t('common.delete'),
                  icon: <Trash2 size={16} />,
                  destructive: true,
                  onSelect: () => setDeleting(actionMenu.thread),
                },
              ]
            : []
        }
      />
      {organize.overlays}
      {deleting ? (
        <BottomSheet
          title={t('threads.delete.title')}
          onClose={() => setDeleting(undefined)}
          footer={
            <button
              className="danger"
              onClick={() => void removeThread(deleting)}
            >
              {t('threads.delete.confirm')}
            </button>
          }
        >
          <p>
            {t('threads.delete.body', {
              title: deleting.title || t('thread.untitled'),
            })}
          </p>
        </BottomSheet>
      ) : null}
      {renaming ? (
        <BottomSheet
          title={t('thread.rename.title')}
          onClose={() => setRenaming(undefined)}
          footer={
            <button
              className="primary"
              disabled={saving || !renaming.title.trim()}
              onClick={() => void submitRename()}
            >
              {saving ? t('thread.rename.saving') : t('common.save')}
            </button>
          }
        >
          <input
            className="rename-input"
            autoFocus
            value={renaming.title}
            enterKeyHint="done"
            onChange={(event) =>
              setRenaming({ ...renaming, title: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void submitRename()
              }
            }}
          />
        </BottomSheet>
      ) : null}
      {createOpen ? (
        <BottomSheet
          title={t('threads.createSheet.title')}
          label={t('threads.createSheet.label')}
          className="workspace-sheet"
          onClose={() => setCreateOpen(false)}
        >
          <div className="sheet-list">
            {workspaces.map((workspace) => {
              const isDefault = workspace.id === defaultWorkspaceId
              return (
                <button
                  className={`sheet-row${isDefault ? ' selected' : ''}`}
                  key={workspace.id}
                  onClick={() => void create(workspace.id)}
                >
                  <span className="sheet-row-copy">
                    <span>{workspace.name}</span>
                    <small>
                      {isDefault
                        ? t('threads.createSheet.defaultProject')
                        : workspace.path || workspace.id}
                    </small>
                  </span>
                  {isDefault ? (
                    <Check
                      className="sheet-row-check"
                      size={18}
                      strokeWidth={2}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  )
}

function CompactProjectThread({
  thread,
  selected,
  needsResponse,
  onOpen,
}: {
  thread: Thread
  selected: boolean
  needsResponse: boolean
  onOpen(): void
}) {
  const t = useT()
  return (
    <button
      className={`project-thread-row${selected ? ' selected' : ''}`}
      onClick={() => {
        void haptic('light')
        onOpen()
      }}
    >
      <span>{thread.title || t('common.untitledThread')}</span>
      <span className="project-thread-meta">
        <time>{relative(thread.updatedAt ?? thread.createdAt)}</time>
        {needsResponse ? (
          <span
            className="response-dot"
            aria-label={t('threads.row.needsResponse')}
          />
        ) : null}
      </span>
    </button>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightQuery(text, query).map((part, index) =>
        part.match ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}
