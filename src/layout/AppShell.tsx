import {
  AtSign,
  CalendarClock,
  Gem,
  ListTodo,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react'
import { Fragment, useRef, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectionContext, useDesktops } from '../desktops/DesktopContext'
import { DesktopSwitcher } from '../desktops/DesktopSwitcher'
import {
  desktopCrystalsPath,
  desktopGtdPath,
  desktopReferencesPath,
  desktopThreadsPath,
  desktopTimeCluesPath,
} from '../desktopRoutes'
import { ThreadsScreen } from '../screens/ThreadsScreen'
import { GtdScreen } from '../screens/GtdScreen'
import { useTimeCluesStatus } from '../screens/useTimeCluesStatus'
import { StartScreen } from '../screens/StartScreen'
import { threadNavigationOptions, threadRouteMatch } from './splitLayout'
import { useLayoutMode, useSidebarCollapsed } from './useLayoutMode'
import { useSidebarSwipe } from './useSidebarSwipe'
import { visiblePairings } from '../desktops/desktopVisibility'
import { useT } from '../i18n'

const NAV_ITEMS = [
  { to: '/threads', labelKey: 'nav.threads', Icon: MessagesSquare },
  { to: '/gtd', labelKey: 'nav.gtd', Icon: ListTodo },
  { to: '/settings', labelKey: 'nav.settings', Icon: Settings },
] as const

function ActiveDesktopStrip() {
  const { store, desktops } = useDesktops()
  const activeId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const desktop = desktops.find((item) => item.pairing.id === activeId)
  if (!desktop?.connection) return null
  return (
    <ConnectionContext.Provider value={desktop.connection}>
      <DesktopSwitcher className="desktop-strip" />
    </ConnectionContext.Provider>
  )
}

/** Threads links straight to the active desktop's scoped list. */
function useActiveThreadsPath() {
  const { store } = useDesktops()
  const activeId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  return activeId ? desktopThreadsPath(activeId) : '/threads'
}

function MainNav({
  className,
  compact,
  children,
  beforeSettings,
}: {
  className: string
  compact?: boolean
  children?: ReactNode
  beforeSettings?: ReactNode
}) {
  const t = useT()
  const { pathname } = useLocation()
  const threadsPath = useActiveThreadsPath()
  return (
    <nav className={className} aria-label={t('nav.main')}>
      {NAV_ITEMS.map(({ to, labelKey, Icon }, index) => {
        const label = t(labelKey)
        const threads = to === '/threads'
        const gtd = to === '/gtd'
        const destination = threads
          ? threadsPath
          : gtd
            ? desktopGtdPath(
                decodeURIComponent(threadsPath.split('/')[2] ?? ''),
              )
            : to
        const active = gtd
          ? /^\/d\/[^/]+\/gtd(?:\/|$)/.test(pathname)
          : threads
            ? (pathname === to || pathname.startsWith('/d/')) &&
              !/^\/d\/[^/]+\/gtd(?:\/|$)/.test(pathname) &&
              !pathname.includes('/crystals') &&
              !pathname.includes('/time-clues') &&
              !pathname.includes('/references')
            : pathname === to || pathname.startsWith(`${to}/`)
        return (
          <Fragment key={to}>
            {index === 2 ? beforeSettings : null}
            <NavLink
              to={destination}
              {...threadNavigationOptions(pathname, destination)}
              aria-label={compact ? label : undefined}
              title={compact ? label : undefined}
              aria-current={active ? 'page' : undefined}
              className={active ? 'active' : ''}
            >
              <span className="tab-icon">
                <Icon size={22} />
              </span>
              {compact ? null : label}
            </NavLink>
            {index === 1 ? children : null}
          </Fragment>
        )
      })}
    </nav>
  )
}

function CrystalsRailLink({ desktopId }: { desktopId: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const active = pathname.startsWith(desktopCrystalsPath(desktopId))
  return (
    <NavLink
      to={desktopCrystalsPath(desktopId)}
      aria-label={t('nav.crystals')}
      title={t('nav.crystals')}
      aria-current={active ? 'page' : undefined}
      className={`crystals-entry${active ? ' active' : ''}`}
    >
      <span className="tab-icon">
        <Gem size={22} />
      </span>
    </NavLink>
  )
}

function ReferencesRailLink({ desktopId }: { desktopId: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const active = pathname.startsWith(desktopReferencesPath(desktopId))
  return (
    <NavLink
      to={desktopReferencesPath(desktopId)}
      aria-label={t('nav.references')}
      title={t('nav.references')}
      aria-current={active ? 'page' : undefined}
      className={`references-entry${active ? ' active' : ''}`}
    >
      <span className="tab-icon">
        <AtSign size={22} />
      </span>
    </NavLink>
  )
}

function TimeCluesRailLink({ desktopId }: { desktopId: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const { supported, unread } = useTimeCluesStatus(desktopId)
  if (!supported) return null
  const active = pathname === desktopTimeCluesPath(desktopId)
  return (
    <NavLink
      to={desktopTimeCluesPath(desktopId)}
      aria-label={t('nav.timeClues')}
      title={t('nav.timeClues')}
      aria-current={active ? 'page' : undefined}
      className={`time-clues-entry${active ? ' active' : ''}`}
    >
      <span className="tab-icon">
        <CalendarClock size={22} />
        {unread ? (
          <span
            className="time-clues-unread-dot"
            aria-label={t('nav.unseenTimeClues')}
          />
        ) : null}
      </span>
    </NavLink>
  )
}

/** The active desktop's thread or GTD list, mounted beside the outlet. */
function SidebarThreads({
  selectedThreadId,
  gtd,
}: {
  selectedThreadId?: string
  gtd: boolean
}) {
  const t = useT()
  const { store, desktops } = useDesktops()
  const activeId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const desktop = desktops.find((item) => item.pairing.id === activeId)
  if (!desktop?.connection)
    return (
      <p className="empty">
        {desktop
          ? t('connection.connectingTo', { name: desktop.pairing.name })
          : t('connection.connectingDesktop')}
      </p>
    )
  return (
    <ConnectionContext.Provider value={desktop.connection}>
      {gtd ? (
        <GtdScreen
          key={desktop.pairing.id}
          selectedThreadId={selectedThreadId}
        />
      ) : (
        <ThreadsScreen
          key={desktop.pairing.id}
          selectedThreadId={selectedThreadId}
        />
      )}
    </ConnectionContext.Provider>
  )
}

/**
 * One layout route for every screen. Element types stay identical across
 * child routes so the outlet (and, in split mode, the sidebar list with its
 * state) is never remounted by navigation; only the URL decides content.
 */
export function AppShell() {
  const t = useT()
  const mode = useLayoutMode()
  const [collapsed, toggleSidebar, setSidebarCollapsed] = useSidebarCollapsed()
  const shellRef = useRef<HTMLDivElement>(null)
  const sidebarSwipe = useSidebarSwipe(shellRef, collapsed, setSidebarCollapsed)
  const { pathname } = useLocation()
  const { store } = useDesktops()
  const activeDesktopId =
    store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const thread = threadRouteMatch(pathname)
  const detail =
    Boolean(thread?.threadId) || /^\/d\/[^/]+\/screen\/?$/.test(pathname)

  if (mode === 'single')
    return (
      <div className={detail ? 'detail-shell' : 'app-shell'}>
        <main className={detail ? 'detail-main' : 'screen'}>
          <Outlet />
        </main>
        {detail ? null : (
          <>
            <ActiveDesktopStrip />
            <MainNav className="tab-bar" />
          </>
        )}
      </div>
    )

  return (
    <div
      ref={shellRef}
      className={`split-shell${collapsed ? ' collapsed' : ''}`}
      {...sidebarSwipe}
    >
      <div className="split-rail">
        <span className="split-logo" aria-hidden="true">
          <img src="/icon-192.png" alt="" />
        </span>
        <MainNav
          className="split-nav"
          compact
          beforeSettings={
            <button
              className="split-toggle"
              aria-label={
                collapsed ? t('nav.showThreadList') : t('nav.hideThreadList')
              }
              aria-expanded={!collapsed}
              onClick={toggleSidebar}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
          }
        >
          {activeDesktopId ? (
            <>
              <CrystalsRailLink desktopId={activeDesktopId} />
              <TimeCluesRailLink desktopId={activeDesktopId} />
              <ReferencesRailLink desktopId={activeDesktopId} />
            </>
          ) : null}
        </MainNav>
      </div>
      <aside
        className="split-sidebar"
        aria-label={thread?.section === 'gtd' ? t('nav.gtd') : t('nav.threads')}
        aria-hidden={collapsed}
        {...(collapsed ? ({ inert: '' } as Record<string, string>) : {})}
      >
        <div className="split-sidebar-content">
          <SidebarThreads
            selectedThreadId={thread?.threadId}
            gtd={thread?.section === 'gtd'}
          />
          <ActiveDesktopStrip />
        </div>
      </aside>
      {/* Root pages render here beside the persistent thread list. */}
      <main
        className={`split-main${detail ? ' detail' : thread ? '' : ' page'}`}
      >
        <Outlet />
      </main>
    </div>
  )
}

/** `/d/:desktopId/threads`: the list itself, or the empty detail pane. */
export function ThreadsListRoute() {
  const mode = useLayoutMode()
  const location = useLocation()
  if (mode === 'single' && !new URLSearchParams(location.search).has('new'))
    return <ThreadsScreen />
  return <StartScreen />
}
