import { ExtensionProvider } from './extensions'
import {
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  DesktopConnectionManager,
  activatePairing,
  clearDesktopThreadCache,
  loadPairingStore,
  removePairing,
  renamePairing,
  savePairingStore,
  upsertPairing,
  type ManagedTunnel,
  type PairingStore,
  type StoredPairing,
} from './relay'
import { PairScreen } from './screens/PairScreen'
import { ShareScreen } from './share/ShareScreen'
import { installShareIntake } from './share/useSharePayload'
import { SettingsScreen } from './screens/SettingsScreen'
import { CrystalDetailScreen, CrystalsScreen } from './screens/CrystalsScreen'
import { TimeCluesScreen } from './screens/TimeCluesScreen'
import { GtdListRoute } from './screens/GtdScreen'
import {
  ReferenceDetailScreen,
  ReferencesScreen,
} from './screens/ReferencesScreen'
import { HandoffProvider, useHandoff } from './handoff/HandoffProvider'
import { HerdrProvider } from './herdr/HerdrProvider'
import { AgentPaneScreen } from './herdr/HerdrScreens'
import { AgentsListRoute } from './herdr/AgentsListRoute'
import { ThreadActivityProvider } from './desktops/ThreadActivityProvider'
import {
  ConnectionContext,
  DesktopsContext,
  useDesktops,
  type DesktopSummary,
  type DesktopsValue,
} from './desktops/DesktopContext'
import { desktopThreadPath, desktopThreadsPath } from './desktopRoutes'
import { AppShell, ThreadsListRoute } from './layout/AppShell'
import { parentRoute } from './navigation/parentRoute'
import { useLayoutMode } from './layout/useLayoutMode'
import { exitNativeApp, subscribeNativeAppEvents } from './nativeBridge'
import { closeTopOverlay, handleOverlayPopState } from './overlayStack'
import { setDesktopHidden, visiblePairings } from './desktops/desktopVisibility'
import { useT } from './i18n'
import {
  backgroundConnectionStatus,
  getNativeBackgroundConnectionRunning,
  loadBackgroundConnectionEnabled,
  setBackgroundConnectionEnabled,
  setNativeBackgroundConnection,
  subscribeBackgroundConnectionEnabled,
  subscribeNativeBackgroundConnectionStopped,
  updateNativeBackgroundConnectionStatus,
} from './backgroundConnection'

const RemoteScreen = lazy(() =>
  import('./screens/remoteScreen/RemoteScreen').then((module) => ({
    default: module.RemoteScreen,
  })),
)
import {
  UpdateProvider,
  type UpdateDependencies,
} from './updates/UpdateProvider'

const ThreadScreen = lazy(() =>
  import('./screens/ThreadScreen').then((module) => ({
    default: module.ThreadScreen,
  })),
)

/** Legacy unscoped routes (and unknown ones) resolve to the active desktop. */
function ActiveRedirect() {
  const { threadId } = useParams()
  const { store } = useDesktops()
  const activeId = store.activeId ?? visiblePairings(store.pairings)[0]?.id
  if (!activeId) return <Navigate to="/pair" replace />
  return (
    <Navigate
      to={
        threadId
          ? desktopThreadPath(activeId, threadId)
          : desktopThreadsPath(activeId)
      }
      replace
    />
  )
}

function OpeningThread() {
  const t = useT()
  return <p className="empty">{t('thread.opening')}</p>
}

function DesktopScope() {
  const t = useT()
  const { desktopId = '' } = useParams()
  const { store, desktops, activate } = useDesktops()
  const desktop = desktops.find((item) => item.pairing.id === desktopId)
  const known = Boolean(desktop)
  useEffect(() => {
    if (
      known &&
      desktop?.pairing.hidden !== true &&
      store.activeId !== desktopId
    )
      activate(desktopId)
  }, [known, desktop?.pairing.hidden, store.activeId, desktopId, activate])

  if (!desktop) {
    // Thread ids are desktop-specific, so never carry one to another desktop.
    const fallback = store.activeId ?? visiblePairings(store.pairings)[0]?.id
    return (
      <Navigate
        to={fallback ? desktopThreadsPath(fallback) : '/pair'}
        replace
      />
    )
  }
  if (!desktop.connection)
    return (
      <p className="empty">
        {t('connection.connectingTo', { name: desktop.pairing.name })}
      </p>
    )
  return (
    <ConnectionContext.Provider value={desktop.connection}>
      {/* Remount per desktop so screen caches never leak across desktops. */}
      <Fragment key={desktopId}>
        <Outlet />
      </Fragment>
    </ConnectionContext.Provider>
  )
}

const isPairingLink = (url: string) => url.startsWith('alma://connect')

function HerdrBridge({
  desktops,
  children,
}: {
  desktops: Parameters<typeof HandoffProvider>[0]['desktops']
  children: React.ReactNode
}) {
  const { notificationSettings } = useHandoff()
  return (
    <HerdrProvider
      desktops={desktops}
      notificationSettings={notificationSettings}
    >
      {children}
    </HerdrProvider>
  )
}

/**
 * Dev-only seam: screenshot fixtures supply an in-memory store and mock
 * tunnels so no real desktop or pairing is touched.
 */
export interface AppFixture {
  store: PairingStore
  createTunnel(pairing: StoredPairing): ManagedTunnel
  statusByDesktop?: Record<string, DesktopSummary['status']>
  updateDependencies?: UpdateDependencies
}

export default function App({ fixture }: { fixture?: AppFixture } = {}) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [store, setStore] = useState<PairingStore>(
    () => fixture?.store ?? loadPairingStore(),
  )
  const [pairingUrl, setPairingUrl] = useState<string>()
  const manager = useMemo(
    () => new DesktopConnectionManager(fixture?.createTunnel),
    // The fixture is fixed for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [connectionVersion, setConnectionVersion] = useState(0)
  const [backgroundConnectionEnabled, setBackgroundConnectionState] = useState(
    loadBackgroundConnectionEnabled,
  )
  const layoutMode = useLayoutMode()
  const screenOrigin = useRef<string>()
  const previousPathname = useRef(location.pathname)
  if (
    /^\/d\/[^/]+\/screen\/?$/.test(location.pathname) &&
    !/^\/d\/[^/]+\/screen\/?$/.test(previousPathname.current)
  )
    screenOrigin.current = previousPathname.current
  previousPathname.current = location.pathname
  const activeHomePath = store.activeId
    ? desktopThreadsPath(store.activeId)
    : undefined
  const backContext = useRef({
    pathname: location.pathname,
    layoutMode,
    screenOrigin: screenOrigin.current,
    activeHomePath,
  })
  backContext.current = {
    pathname: location.pathname,
    layoutMode,
    screenOrigin: screenOrigin.current,
    activeHomePath,
  }

  useEffect(() => {
    const unsubscribe = manager.subscribe(() =>
      setConnectionVersion((version) => version + 1),
    )
    return () => {
      unsubscribe()
      manager.close()
    }
  }, [manager])
  useEffect(() => {
    const routedId = /^\/d\/([^/]+)/.exec(location.pathname)?.[1]
    const routedPairing = store.pairings.find(
      ({ id }) => id === (routedId ? decodeURIComponent(routedId) : ''),
    )
    const connected = visiblePairings(store.pairings)
    manager.sync(
      routedPairing?.hidden ? [...connected, routedPairing] : connected,
    )
  }, [manager, store.pairings, location.pathname])

  const updateStore = useCallback(
    (update: (current: PairingStore) => PairingStore) =>
      setStore((current) => {
        const next = update(current)
        if (next !== current && !fixture) savePairingStore(next)
        return next
      }),
    [fixture],
  )

  // `navigate` changes identity on every route change; reading it via a ref
  // keeps native listeners subscribed once instead of re-subscribing per route.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  useEffect(() => {
    let disposed = false
    let unsubscribe: () => void = () => undefined
    void subscribeNativeAppEvents({
      onUrl(url) {
        // Pairing links add or update a desktop even while already paired.
        if (!isPairingLink(url)) return
        setPairingUrl(url)
        navigateRef.current('/pair')
      },
      onBack() {
        if (closeTopOverlay()) return
        const {
          pathname,
          layoutMode: mode,
          screenOrigin: origin,
          activeHomePath: homePath,
        } = backContext.current
        const parent = parentRoute(pathname, mode, origin ?? homePath)
        if (parent) navigateRef.current(parent, { replace: true })
        else void exitNativeApp()
      },
    }).then((remove) => {
      if (disposed) remove()
      else unsubscribe = remove
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])
  useEffect(() => installShareIntake(() => navigateRef.current('/share')), [])
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!handleOverlayPopState(() => window.history.go(1))) return
      event.preventDefault()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const desktops = useMemo<DesktopSummary[]>(
    () =>
      store.pairings.map((pairing) => {
        const connection = manager.get(pairing.id)
        return {
          pairing,
          status:
            fixture?.statusByDesktop?.[pairing.id] ??
            connection?.status ??
            'connecting',
          connection: connection && {
            pairing,
            tunnel: connection.tunnel,
            api: connection.api,
            status: fixture?.statusByDesktop?.[pairing.id] ?? connection.status,
            error:
              fixture?.statusByDesktop?.[pairing.id] === 'offline'
                ? 'Desktop is offline'
                : connection.error,
          },
        }
      }),
    // connectionVersion tracks the manager's mutable connection statuses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.pairings, manager, connectionVersion],
  )

  const desktopsValue = useMemo<DesktopsValue>(
    () => ({
      store,
      desktops,
      activate: (id) => updateStore((current) => activatePairing(current, id)),
      rename: (id, name) =>
        updateStore((current) => renamePairing(current, id, name)),
      setHidden: (id, hidden) =>
        updateStore((current) => setDesktopHidden(current, id, hidden)),
      remove: (id) => {
        clearDesktopThreadCache(id)
        updateStore((current) => removePairing(current, id))
      },
    }),
    [store, desktops, updateStore],
  )

  const backgroundStatus = backgroundConnectionStatus(
    desktops
      .filter(({ pairing }) => pairing.hidden !== true)
      .map(({ pairing, status }) => ({
        name: pairing.name,
        status,
        relayUrl: pairing.relayUrl,
      })),
    desktops.find(({ pairing }) => pairing.id === store.activeId)?.pairing.name,
    {
      connected: (name, transport) =>
        t('settings.backgroundConnection.connected', { name, transport }),
      reconnecting: t('settings.backgroundConnection.reconnecting'),
      waiting: t('settings.backgroundConnection.waiting'),
      relay: t('settings.backgroundConnection.transport.relay'),
      lan: t('settings.backgroundConnection.transport.lan'),
    },
  )

  useEffect(
    () => subscribeBackgroundConnectionEnabled(setBackgroundConnectionState),
    [],
  )
  useEffect(() => {
    if (!backgroundConnectionEnabled || fixture) return
    void getNativeBackgroundConnectionRunning().then((running) => {
      if (running === false) setBackgroundConnectionEnabled(false)
    })
  }, [fixture, backgroundConnectionEnabled])
  useEffect(() => {
    if (fixture) return
    void setNativeBackgroundConnection(
      backgroundConnectionEnabled,
      backgroundStatus,
      {
        title: t('settings.backgroundConnection.notificationTitle'),
        channelName: t('settings.backgroundConnection.channelName'),
        channelDescription: t(
          'settings.backgroundConnection.channelDescription',
        ),
        stop: t('settings.backgroundConnection.stop'),
      },
    )
  }, [fixture, backgroundConnectionEnabled, t])
  useEffect(() => {
    if (!backgroundConnectionEnabled || fixture) return
    void updateNativeBackgroundConnectionStatus(backgroundStatus)
  }, [fixture, backgroundConnectionEnabled, backgroundStatus])
  useEffect(() => {
    if (fixture) return
    let disposed = false
    let unsubscribe = () => undefined
    void subscribeNativeBackgroundConnectionStopped(() => {
      setBackgroundConnectionEnabled(false)
    }).then((remove) => {
      if (disposed) remove()
      else unsubscribe = remove
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [fixture])

  const handoffDesktops = useMemo(
    () =>
      desktops.flatMap(({ pairing, connection }) =>
        pairing.hidden !== true && connection
          ? [
              {
                id: pairing.id,
                name: pairing.name,
                api: connection.api,
                online: connection.status === 'online',
              },
            ]
          : [],
      ),
    [desktops],
  )

  const onPaired = (pairing: StoredPairing) => {
    updateStore((current) => upsertPairing(current, pairing))
    navigate(desktopThreadsPath(pairing.id), { replace: true })
  }
  const pairScreen = (onCancel?: () => void) => (
    <PairScreen
      onPaired={onPaired}
      onCancel={onCancel}
      incomingLink={pairingUrl}
      onIncomingLinkConsumed={() => setPairingUrl(undefined)}
    />
  )

  return (
    <UpdateProvider dependencies={fixture?.updateDependencies}>
      <DesktopsContext.Provider value={desktopsValue}>
        <ExtensionProvider preview={Boolean(fixture)}>
          <ThreadActivityProvider>
            <HandoffProvider desktops={handoffDesktops}>
              <HerdrBridge desktops={handoffDesktops}>
                <Routes>
                  <Route path="share" element={<ShareScreen />} />
                  <Route
                    path="pair"
                    element={pairScreen(
                      // The first pairing has nowhere to go back to.
                      desktops.length
                        ? () => navigate('/settings', { replace: true })
                        : undefined,
                    )}
                  />
                  <Route element={<AppShell />}>
                    <Route index element={<ActiveRedirect />} />
                    <Route path="threads" element={<ActiveRedirect />} />
                    <Route path="inbox" element={<ActiveRedirect />} />
                    <Route path="settings" element={<SettingsScreen />} />
                    <Route
                      path="threads/:threadId"
                      element={<ActiveRedirect />}
                    />
                    <Route path="d/:desktopId" element={<DesktopScope />}>
                      <Route
                        index
                        element={<Navigate to="threads" replace />}
                      />
                      <Route path="threads" element={<ThreadsListRoute />} />
                      <Route path="gtd" element={<GtdListRoute />} />
                      <Route
                        path="gtd/:threadId"
                        element={
                          <Suspense fallback={<OpeningThread />}>
                            <ThreadScreen />
                          </Suspense>
                        }
                      />
                      <Route path="time-clues" element={<TimeCluesScreen />} />
                      <Route
                        path="screen"
                        element={
                          <Suspense fallback={<OpeningThread />}>
                            <RemoteScreen />
                          </Suspense>
                        }
                      />
                      <Route path="agents" element={<AgentsListRoute />} />
                      <Route
                        path="agents/:paneId"
                        element={<AgentPaneScreen />}
                      />
                      <Route path="crystals" element={<CrystalsScreen />} />
                      <Route path="references" element={<ReferencesScreen />} />
                      <Route
                        path="references/:referenceUri"
                        element={<ReferenceDetailScreen />}
                      />
                      <Route
                        path="crystals/:crystalId"
                        element={<CrystalDetailScreen />}
                      />
                      <Route
                        path="threads/:threadId"
                        element={
                          <Suspense fallback={<OpeningThread />}>
                            <ThreadScreen />
                          </Suspense>
                        }
                      />
                    </Route>
                    <Route path="*" element={<ActiveRedirect />} />
                  </Route>
                </Routes>
              </HerdrBridge>
            </HandoffProvider>
          </ThreadActivityProvider>
        </ExtensionProvider>
      </DesktopsContext.Provider>
    </UpdateProvider>
  )
}
