import { Archive, ChevronDown } from 'lucide-react'
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnchoredMenu, pointAnchor } from '../components/AnchoredMenu'
import { presenceClass, usePresence } from '../components/usePresence'
import { TabBar } from '../components/TabBar'
import { useConnection } from '../desktops/DesktopContext'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { useUnreadActivity } from '../desktops/ThreadActivityProvider'
import { desktopGtdPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { threadNavigationOptions } from '../layout/splitLayout'
import { useLayoutMode } from '../layout/useLayoutMode'
import { overlayCount } from '../overlayStack'
import type { Thread } from '../relay'
import { StartScreen } from './StartScreen'
import {
  GTD_STATUS_ICON,
  gtdStatusLabel,
  GTD_STATUS_ORDER,
  favoriteGroups,
  gtdSourceThreads,
  gtdStatusCounts,
  gtdStatusOf,
  loadGtdSegment,
  saveGtdSegment,
  splitInbox,
  threadsInStatus,
} from './gtdModel'
import {
  gtdSwipeAction,
  gtdSwipeArmed,
  gtdSwipeIntent,
  gtdSwipeOffset,
  type GtdSwipeAction,
} from './gtdSwipe'
import { autoTodo, type ThreadGtdStatus } from './threadGtd'
import {
  ThreadRow,
  ThreadRowContent,
  useThreadRowIndicators,
} from './ThreadListRow'
import { useThreadOrganize } from './ThreadOrganize'
import { useDesktopThreadList } from './useDesktopThreadList'
import { useT } from '../i18n'

/** `/d/:desktopId/gtd`: the list on phones, the empty detail pane in split. */
export function GtdListRoute() {
  const mode = useLayoutMode()
  const location = useLocation()
  if (mode === 'single' && !new URLSearchParams(location.search).has('new'))
    return <GtdScreen />
  return <StartScreen />
}

/**
 * Desktop's GTD sidebar as a mobile list: status segments, favorites above,
 * and conversations opened beside (split) or above (phone) the list.
 */
export function GtdScreen({
  selectedThreadId,
}: {
  selectedThreadId?: string
} = {}) {
  const t = useT()
  const { api, pairing } = useConnection()
  const navigate = useNavigate()
  const location = useLocation()
  const { threads, setThreads, workspaces, loading, error, setError } =
    useDesktopThreadList()
  const errorPresence = usePresence(Boolean(error))
  const presentedError = useRef(error)
  if (error) presentedError.current = error
  const { markRead } = useUnreadActivity()
  const { indicatorsFor } = useThreadRowIndicators(pairing.id)
  const organize = useThreadOrganize({ api, threads, setThreads, setError })
  const [segment, setSegment] = useState<ThreadGtdStatus>(() =>
    loadGtdSegment(window.sessionStorage),
  )
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const [olderOpen, setOlderOpen] = useState(false)
  const [actionMenu, setActionMenu] = useState<{
    thread: Thread
    x: number
    y: number
  }>()
  const source = useMemo(() => gtdSourceThreads(threads), [threads])
  const counts = useMemo(() => gtdStatusCounts(source), [source])
  const favorites = useMemo(() => favoriteGroups(source), [source])
  const rows = useMemo(
    () => threadsInStatus(source, segment),
    [source, segment],
  )
  const inbox = segment === 'inbox' ? splitInbox(rows, Date.now()) : undefined
  const favoriteCount = favorites.pinned.length + favorites.favorites.length

  const open = (thread: Thread) => {
    void haptic('light')
    markRead(pairing.id, thread.id)
    const path = desktopGtdPath(pairing.id, thread.id)
    navigate(path, threadNavigationOptions(location.pathname, path))
  }
  const row = (thread: Thread, swipeable: boolean) => {
    const selected = thread.id === selectedThreadId
    const content = (style?: CSSProperties) => (
      <ThreadRow
        className={`thread-row${selected ? ' selected' : ''}`}
        style={style}
        aria-current={selected ? 'page' : undefined}
        onClick={() => open(thread)}
        onActions={({ x, y }) => setActionMenu({ thread, x, y })}
      >
        <ThreadRowContent
          thread={thread}
          workspaces={workspaces}
          indicators={indicatorsFor(
            thread,
            organize.pendingDoneIds.has(thread.id),
          )}
          detail={autoTodo(thread)?.what}
        />
      </ThreadRow>
    )
    if (!swipeable) return <div key={thread.id}>{content()}</div>
    return (
      <GtdSwipeRow
        key={thread.id}
        status={gtdStatusOf(thread)}
        onCommit={(action) => void organize.setStatus(thread, action.status)}
      >
        {content}
      </GtdSwipeRow>
    )
  }

  return (
    <section className="root-page gtd-page">
      <ScopedRootHeader
        title={t('nav.gtd')}
        childOnPhone
        className="gtd-header"
        actions={
          <button
            className="header-icon-button gtd-archive-button"
            aria-label={t('gtd.archivedCount', { count: counts.archived })}
            aria-pressed={segment === 'archived'}
            onClick={() => {
              setSegment('archived')
              setOlderOpen(false)
              saveGtdSegment(window.sessionStorage, 'archived')
              void haptic('light')
            }}
          >
            <Archive size={19} aria-hidden="true" />
          </button>
        }
      />
      <TabBar
        className={segment === 'archived' ? 'archive-open' : ''}
        items={GTD_STATUS_ORDER.map((status) => ({
          value: status,
          label: gtdStatusLabel(status),
          count: counts[status],
          icon: GTD_STATUS_ICON[status],
        }))}
        selected={segment}
        onSelect={(status) => {
          setSegment(status)
          setOlderOpen(false)
          saveGtdSegment(window.sessionStorage, status)
        }}
        label={t('gtd.statusTabs')}
        selectedLabelOnly
        compactAtWidth={260}
      />
      <div className="page-body threads-page-body">
        {errorPresence.rendered ? (
          <p className={`error ${presenceClass(errorPresence.phase)}`}>
            {presentedError.current}
          </p>
        ) : null}
        {loading ? (
          <p className="empty">{t('threads.loading')}</p>
        ) : (
          <div className="thread-list gtd-list">
            {segment !== 'archived' && favoriteCount ? (
              <section className="gtd-group" aria-label={t('gtd.favorites')}>
                <button
                  className="gtd-group-toggle"
                  aria-expanded={favoritesOpen}
                  onClick={() => {
                    setFavoritesOpen((value) => !value)
                    void haptic('selection')
                  }}
                >
                  <span>{t('gtd.favorites')}</span>
                  <small>{favoriteCount}</small>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {favoritesOpen
                  ? [...favorites.pinned, ...favorites.favorites].map(
                      (thread) => row(thread, false),
                    )
                  : null}
              </section>
            ) : null}
            <section className="gtd-group" aria-label={gtdStatusLabel(segment)}>
              {(inbox ? inbox.recent : rows).map((thread) => row(thread, true))}
              {inbox?.older.length ? (
                <>
                  <button
                    className="gtd-group-toggle gtd-older-toggle"
                    aria-expanded={olderOpen}
                    onClick={() => {
                      setOlderOpen((value) => !value)
                      void haptic('selection')
                    }}
                  >
                    <span>{t('gtd.olderThanWeek')}</span>
                    <small>{inbox.older.length}</small>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  {olderOpen
                    ? inbox.older.map((thread) => row(thread, true))
                    : null}
                </>
              ) : null}
              {!rows.length ? (
                <p className="empty">
                  {t('gtd.emptySegment', { status: gtdStatusLabel(segment) })}
                </p>
              ) : null}
            </section>
          </div>
        )}
      </div>
      <AnchoredMenu
        open={Boolean(actionMenu)}
        onOpenChange={(value: boolean) => {
          if (!value) setActionMenu(undefined)
        }}
        anchorRect={
          actionMenu ? pointAnchor(actionMenu.x, actionMenu.y) : undefined
        }
        label={t('threads.actions.label')}
        immediateClose
        header={
          actionMenu && autoTodo(actionMenu.thread) ? (
            <div className="thread-todo-menu">
              <strong>{autoTodo(actionMenu.thread)?.what}</strong>
              <small>{autoTodo(actionMenu.thread)?.quote}</small>
            </div>
          ) : undefined
        }
        items={actionMenu ? organize.menuItems(actionMenu.thread) : []}
      />
      {organize.overlays}
    </section>
  )
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Horizontal swipe for one GTD row. Vertical scrolling stays native
 * (`touch-action: pan-y`); the swipe claims only after clear horizontal
 * intent, outside the Android back zone, and never while an overlay (such as
 * the long-press menu) is open. Crossing the commit distance ticks a
 * selection haptic; releasing past it submits with a light impact.
 */
function GtdSwipeRow({
  status,
  onCommit,
  children,
}: {
  status: ThreadGtdStatus
  onCommit(action: GtdSwipeAction): void
  children(style?: CSSProperties): ReactNode
}) {
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    dx: number
    claimed: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const reduce = reducedMotion()
  const direction = dx > 0 ? 'right' : 'left'
  const revealed = dx ? gtdSwipeAction(status, direction) : undefined
  const armed = gtdSwipeArmed(dx, status)
  const offset = gtdSwipeOffset(dx, status, reduce)
  const RevealedIcon = revealed ? GTD_STATUS_ICON[revealed.status] : undefined

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (!current.claimed) return
    suppressClick.current = true
    const action = cancelled ? undefined : gtdSwipeArmed(current.dx, status)
    setDragging(false)
    setDx(0)
    if (action) {
      void haptic('light')
      onCommit(action)
    }
  }

  return (
    <div
      className={`gtd-swipe-row${dragging ? ' dragging' : ''}${
        revealed ? ` reveal-${direction}` : ''
      }${armed ? ' armed' : ''}`}
      onPointerDown={(event) => {
        suppressClick.current = false
        if (event.pointerType === 'mouse' && event.button !== 0) return
        if ((event.target as HTMLElement).closest('button, a, input')) return
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dx: 0,
          claimed: false,
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) return
        const nextDx = event.clientX - current.startX
        if (!current.claimed) {
          const intent = gtdSwipeIntent(
            current.startX,
            nextDx,
            event.clientY - current.startY,
          )
          if (intent === 'pending') return
          if (intent !== 'horizontal' || overlayCount() > 0) {
            drag.current = null
            return
          }
          current.claimed = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setDragging(true)
        }
        if (
          Boolean(gtdSwipeArmed(current.dx, status)) !==
          Boolean(gtdSwipeArmed(nextDx, status))
        )
          void haptic('selection')
        current.dx = nextDx
        setDx(nextDx)
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onClickCapture={(event) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {revealed && RevealedIcon ? (
        <div className="gtd-swipe-action" aria-hidden="true">
          <RevealedIcon size={16} />
          <span>{revealed.label}</span>
        </div>
      ) : null}
      {children(offset ? { transform: `translateX(${offset}px)` } : undefined)}
    </div>
  )
}
