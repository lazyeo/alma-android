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
import { useEffect, useRef, type ReactNode } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { ConnectionContext, useDesktops } from '../desktops/DesktopContext'
import { DesktopSwitcher } from '../desktops/DesktopSwitcher'
import { AlmaPresenceProvider, useAlmaPresence } from '../alma/AlmaPresence'
import { AlmaThoughtProvider } from '../alma/AlmaThought'
import {
  AlmaNavButton,
  almaNavSlot,
  useAlmaNavVisible,
} from '../alma/AlmaNavButton'
import { AlmaDock } from '../alma/AlmaDock'
import {
  ALMA_ROUTE,
  desktopAgentPanePath,
  desktopAgentsPath,
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
import { splitSidebarSection, threadRouteMatch } from './splitLayout'
import { useLayoutMode, useSidebarCollapsed } from './useLayoutMode'
import { useSidebarSwipe } from './useSidebarSwipe'
import { visiblePairings } from '../desktops/desktopVisibility'
import { useT } from '../i18n'
import { useHerdr } from '../herdr/HerdrProvider'
import { AgentsSidebar } from '../herdr/AgentsSidebar'
import { HerdrMark } from '../herdr/HerdrMark'
import {
  rememberLastViewedPane,
  resolveLastViewedPane,
} from '../herdr/agentsBoardModel'
import { useUpdates } from '../updates/UpdateProvider'
import { useSoftKeyboardOpen } from './useSoftKeyboard'

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

function useNavState() {
  const { pathname } = useLocation()
  const threadsPath = useActiveThreadsPath()
  const desktopId = decodeURIComponent(threadsPath.split('/')[2] ?? '')
  const gtdActive = /^\/d\/[^/]+\/gtd(?:\/|$)/.test(pathname)
  const threadsActive =
    (pathname === '/threads' || pathname.startsWith('/d/')) &&
    !ALMA_ROUTE.test(pathname) &&
    !gtdActive &&
    !pathname.includes('/crystals') &&
    !pathname.includes('/time-clues') &&
    !pathname.includes('/references') &&
    !pathname.includes('/agents')
  const settingsActive =
    pathname === '/settings' || pathname.startsWith('/settings/')
  return { threadsPath, desktopId, threadsActive, gtdActive, settingsActive }
}

function NavItem({
  to,
  label,
  active,
  className = '',
  children,
}: {
  to: string
  label: string
  active: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      replace
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`${className}${active ? ' active' : ''}`.trim()}
    >
      <span className="tab-icon">{children}</span>
    </Link>
  )
}

/**
 * The phone's floating tab bar: Threads, Alma at the centre, Herdr. GTD and
 * Settings open from the Threads header. Children keep their keys across
 * desktop switches so nothing remounts when her slot comes or goes.
 */
function PhoneNav({ hidden }: { hidden: boolean }) {
  const t = useT()
  const { threadsPath, desktopId, threadsActive } = useNavState()
  const alma = useAlmaNavVisible()
  return (
    <nav
      className={`tab-bar floating-nav${alma ? ' with-alma' : ''}`}
      aria-label={t('nav.main')}
      data-hidden={hidden ? 'true' : undefined}
      aria-hidden={hidden ? 'true' : undefined}
      {...(hidden ? ({ inert: '' } as Record<string, string>) : {})}
    >
      <NavItem
        key="threads"
        to={threadsPath}
        label={t('nav.threads')}
        active={threadsActive}
        className="threads-entry"
      >
        <MessagesSquare size={22} />
      </NavItem>
      <AlmaNavButton key="alma" placement="tab" />
      {desktopId ? <AgentsNavLink key="agents" desktopId={desktopId} /> : null}
    </nav>
  )
}

/**
 * The split rail under its top slot: Threads, Herdr, the Library
 * destinations, then the sidebar toggle, GTD and Settings at the foot.
 */
function RailNav({
  extras,
  toggle,
}: {
  extras?: ReactNode
  toggle: ReactNode
}) {
  const t = useT()
  const { badge } = useUpdates()
  const { threadsPath, desktopId, threadsActive, gtdActive, settingsActive } =
    useNavState()
  return (
    <nav className="split-nav" aria-label={t('nav.main')}>
      <NavItem
        to={threadsPath}
        label={t('nav.threads')}
        active={threadsActive}
        className="threads-entry"
      >
        <MessagesSquare size={22} />
      </NavItem>
      {desktopId ? <AgentsNavLink desktopId={desktopId} /> : null}
      {extras}
      {toggle}
      <NavItem
        to={desktopId ? desktopGtdPath(desktopId) : '/gtd'}
        label={t('nav.gtd')}
        active={gtdActive}
        className="gtd-rail-entry"
      >
        <ListTodo size={22} />
      </NavItem>
      <NavItem
        to="/settings"
        label={t('nav.settings')}
        active={settingsActive}
        className="settings-rail-entry"
      >
        <Settings size={22} />
        {badge ? (
          <span
            className="update-badge-dot"
            aria-label={t('settings.updates.availableDot')}
          />
        ) : null}
      </NavItem>
    </nav>
  )
}

export function AgentsNavLink({
  desktopId,
  compact = true,
}: {
  desktopId: string
  compact?: boolean
}) {
  const t = useT()
  const { pathname } = useLocation()
  const active = pathname.startsWith(desktopAgentsPath(desktopId))
  return (
    <NavLink
      to={desktopAgentsPath(desktopId)}
      replace
      aria-label={t('nav.agents')}
      title={t('nav.agents')}
      aria-current={active ? 'page' : undefined}
      className={`agents-entry${active ? ' active' : ''}`}
    >
      <span className="tab-icon">
        <HerdrMark size={22} />
      </span>
      {compact ? null : t('nav.agents')}
    </NavLink>
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
 * Alma's presence wraps the whole shell so nav and /alma share one poller.
 */
export function AppShell() {
  return (
    <AlmaPresenceProvider>
      <AlmaThoughtProvider>
        <AppShellLayout />
      </AlmaThoughtProvider>
    </AlmaPresenceProvider>
  )
}

/**
 * The rail's top slot: Alma's face while the desktop has (or may have) her,
 * otherwise the non-interactive app logo. Both share one fixed box and
 * crossfade on opacity, so nothing below moves when she comes or goes.
 */
function SplitRailTop() {
  const alma = almaNavSlot(useAlmaPresence()) === 'shown'
  return (
    <div className="split-logo" data-alma={alma ? 'true' : undefined}>
      <span className="split-logo-mark" aria-hidden="true">
        <img src="/icon-192.png" alt="" />
      </span>
      <AlmaNavButton placement="rail" />
    </div>
  )
}

function AppShellLayout() {
  const t = useT()
  const mode = useLayoutMode()
  const [collapsed, toggleSidebar, setSidebarCollapsed] = useSidebarCollapsed()
  const shellRef = useRef<HTMLDivElement>(null)
  const sidebarSwipe = useSidebarSwipe(shellRef, collapsed, setSidebarCollapsed)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const keyboardOpen = useSoftKeyboardOpen()
  const { store } = useDesktops()
  const activeDesktopId =
    store.activeId ?? visiblePairings(store.pairings)[0]?.id
  const thread = threadRouteMatch(pathname)
  const sidebarSection = splitSidebarSection(pathname)
  const agentsMatch = /^\/d\/([^/]+)\/agents(?:\/([^/]+))?\/?$/.exec(pathname)
  const agentsDesktopId = agentsMatch
    ? decodeURIComponent(agentsMatch[1])
    : undefined
  const agentsPaneId = agentsMatch?.[2]
    ? decodeURIComponent(agentsMatch[2])
    : undefined
  const { agents } = useHerdr()
  const agentWorkspaces = agentsDesktopId ? agents(agentsDesktopId) : []
  const screenDetail = /^\/d\/[^/]+\/screen\/?$/.test(pathname)
  const almaDetail = ALMA_ROUTE.test(pathname)
  // On phones GTD and Settings open from the Threads header like the
  // Library pages: Back plus a local title, no tab bar.
  const phoneChild =
    /^\/d\/[^/]+\/(?:crystals|time-clues|references)(?:\/|$)/.test(pathname) ||
    /^\/d\/[^/]+\/gtd\/?$/.test(pathname) ||
    pathname === '/settings'
  // The phone new-thread page keeps its composer clear of the floating bar.
  const newThread =
    Boolean(thread && !thread.threadId) &&
    new URLSearchParams(search).has('new')
  const detail =
    Boolean(thread?.threadId) ||
    screenDetail ||
    almaDetail ||
    Boolean(agentsPaneId) ||
    (mode === 'single' && phoneChild)

  useEffect(() => {
    if (agentsDesktopId && agentsPaneId)
      rememberLastViewedPane(agentsDesktopId, agentsPaneId)
  }, [agentsDesktopId, agentsPaneId])

  useEffect(() => {
    if (mode !== 'split' || !agentsDesktopId || agentsPaneId) return
    const paneId = resolveLastViewedPane(agentsDesktopId, agentWorkspaces)
    if (paneId)
      navigate(desktopAgentPanePath(agentsDesktopId, paneId), { replace: true })
  }, [agentWorkspaces, agentsDesktopId, agentsPaneId, mode, navigate])

  if (screenDetail)
    return (
      <div className="detail-shell">
        <main className="detail-main">
          <Outlet />
        </main>
      </div>
    )

  if (mode === 'single')
    return (
      <div className={detail ? 'detail-shell' : 'app-shell'}>
        <main
          className={
            detail ? `detail-main${phoneChild ? ' phone-child' : ''}` : 'screen'
          }
        >
          <Outlet />
        </main>
        {detail ? null : (
          <div className="phone-dock">
            {newThread ? null : <PhoneNav hidden={keyboardOpen} />}
          </div>
        )}
      </div>
    )

  // Alma takes the whole content area right of the rail, as her expand
  // promises; the list pane stays mounted (state and scroll kept) but folds
  // away while she is open and returns when she is left.
  const almaFull = almaDetail
  const sidebarHidden = collapsed || almaFull
  return (
    <div
      ref={shellRef}
      className={`split-shell${collapsed ? ' collapsed' : ''}${almaFull ? ' alma-full' : ''}`}
      {...(almaFull ? {} : sidebarSwipe)}
    >
      {/* Her one face on /alma, docked across the rail edge (see AlmaDock). */}
      {almaFull ? <AlmaDock /> : null}
      <div className="split-rail">
        <SplitRailTop />
        <RailNav
          toggle={
            <button
              className="split-toggle"
              aria-label={
                collapsed ? t('nav.showThreadList') : t('nav.hideThreadList')
              }
              aria-expanded={!sidebarHidden}
              disabled={almaFull}
              onClick={toggleSidebar}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
          }
          extras={
            activeDesktopId ? (
              <>
                <CrystalsRailLink desktopId={activeDesktopId} />
                <TimeCluesRailLink desktopId={activeDesktopId} />
                <ReferencesRailLink desktopId={activeDesktopId} />
              </>
            ) : null
          }
        />
      </div>
      <aside
        className="split-sidebar"
        aria-label={
          sidebarSection === 'agents'
            ? t('nav.agents')
            : sidebarSection === 'gtd'
              ? t('nav.gtd')
              : t('nav.threads')
        }
        aria-hidden={sidebarHidden}
        {...(sidebarHidden ? ({ inert: '' } as Record<string, string>) : {})}
      >
        <div className="split-sidebar-content">
          {sidebarSection === 'agents' ? (
            <AgentsSidebar />
          ) : (
            <SidebarThreads
              selectedThreadId={thread?.threadId}
              gtd={sidebarSection === 'gtd'}
            />
          )}
          <ActiveDesktopStrip />
        </div>
      </aside>
      {/* Root pages render here beside the persistent thread list. */}
      <main
        className={`split-main${detail ? ' detail' : thread || agentsMatch ? '' : ' page'}`}
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
