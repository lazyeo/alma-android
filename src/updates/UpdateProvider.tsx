import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchLatestRelease, UpdateCheckError } from './updateCheck'
import {
  cancelNativeUpdate,
  downloadNativeUpdate,
  installNativeUpdate,
  loadAppRuntime,
  UpdateInstallError,
  type AppRuntime,
  type InstallStatus,
} from './nativeUpdater'
import {
  isNewerRelease,
  loadUpdatePrefs,
  saveUpdatePrefs,
  shouldAutoCheck,
  showUpdateBadge,
  updateEligibility,
  type AvailableRelease,
  type UpdateEligibility,
  type UpdateErrorKind,
  type UpdatePrefs,
} from './updateModel'

export type UpdateStatus =
  'idle' | 'checking' | 'current' | 'available' | 'error'
export type DownloadStatus = 'idle' | 'downloading' | 'ready' | 'error'

export type UpdateDependencies = {
  loadRuntime: typeof loadAppRuntime
  fetchLatest: typeof fetchLatestRelease
  download: typeof downloadNativeUpdate
  cancel: typeof cancelNativeUpdate
  install: typeof installNativeUpdate
  openUrl(url: string): void
  now(): number
}

const defaultDependencies: UpdateDependencies = {
  loadRuntime: loadAppRuntime,
  fetchLatest: fetchLatestRelease,
  download: downloadNativeUpdate,
  cancel: cancelNativeUpdate,
  install: installNativeUpdate,
  openUrl: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
  now: Date.now,
}

type UpdateContextValue = {
  ready: boolean
  runtime?: AppRuntime
  eligibility: UpdateEligibility
  autoCheck: boolean
  badge: boolean
  status: UpdateStatus
  error?: UpdateErrorKind
  release?: AvailableRelease
  downloadStatus: DownloadStatus
  installError?: UpdateInstallError['kind']
  progress: number
  check(): Promise<void>
  setAutoCheck(enabled: boolean): void
  skip(): void
  downloadAndInstall(): Promise<void>
  cancelDownload(): Promise<void>
  openRelease(): void
  openDownload(): void
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined)

export function UpdateProvider({
  children,
  dependencies = defaultDependencies,
}: {
  children: ReactNode
  dependencies?: UpdateDependencies
}) {
  const [runtime, setRuntime] = useState<AppRuntime>()
  const [prefs, setPrefs] = useState<UpdatePrefs>(() =>
    loadUpdatePrefs(localStorage),
  )
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [error, setError] = useState<UpdateErrorKind>()
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle')
  const [installError, setInstallError] = useState<UpdateInstallError['kind']>()
  const [progress, setProgress] = useState(0)
  const eligibility = runtime ? updateEligibility(runtime) : 'hidden'
  const currentVersion = runtime?.versionName ?? ''

  const persist = useCallback((next: UpdatePrefs) => {
    setPrefs(next)
    saveUpdatePrefs(localStorage, next)
  }, [])

  const check = useCallback(async () => {
    if (!runtime || updateEligibility(runtime) === 'hidden') return
    setStatus('checking')
    setError(undefined)
    try {
      const latest = await dependencies.fetchLatest()
      const next = {
        ...prefs,
        lastCheckedAt: dependencies.now(),
        ...(latest ? { latest } : {}),
      }
      persist(next)
      setStatus(
        isNewerRelease(latest, runtime.versionName) ? 'available' : 'current',
      )
    } catch (failure) {
      setStatus('error')
      setError(failure instanceof UpdateCheckError ? failure.kind : 'general')
    }
  }, [dependencies, persist, prefs, runtime])

  useEffect(() => {
    let current = true
    void dependencies.loadRuntime().then((next) => {
      if (current) setRuntime(next)
    })
    return () => {
      current = false
    }
  }, [dependencies])

  useEffect(() => {
    if (!runtime) return
    if (shouldAutoCheck(updateEligibility(runtime), prefs, dependencies.now()))
      void check()
    else if (isNewerRelease(prefs.latest, runtime.versionName))
      setStatus('available')
  }, [runtime]) // Startup only after runtime resolves.

  const release = isNewerRelease(prefs.latest, currentVersion)
    ? prefs.latest
    : undefined

  const value = useMemo<UpdateContextValue>(
    () => ({
      ready: Boolean(runtime),
      runtime,
      eligibility,
      autoCheck: prefs.autoCheck,
      badge: showUpdateBadge(eligibility, prefs, currentVersion),
      status,
      error,
      release,
      downloadStatus,
      installError,
      progress,
      check,
      setAutoCheck(enabled) {
        persist({ ...prefs, autoCheck: enabled })
      },
      skip() {
        if (!release) return
        persist({ ...prefs, skippedVersion: release.version })
      },
      async downloadAndInstall() {
        if (!release?.apk || eligibility !== 'native') return
        setDownloadStatus('downloading')
        setInstallError(undefined)
        setProgress(0)
        try {
          await dependencies.download(release.version, release.apk, setProgress)
          setDownloadStatus('ready')
          await dependencies.install(release.version)
        } catch (failure) {
          if (
            failure instanceof UpdateInstallError &&
            failure.kind === 'cancelled'
          ) {
            setDownloadStatus('idle')
            setProgress(0)
            return
          }
          setDownloadStatus('error')
          setInstallError(
            failure instanceof UpdateInstallError ? failure.kind : 'download',
          )
        }
      },
      async cancelDownload() {
        await dependencies.cancel()
        setDownloadStatus('idle')
        setProgress(0)
      },
      openRelease() {
        if (release) dependencies.openUrl(release.pageUrl)
      },
      openDownload() {
        if (release?.apk) dependencies.openUrl(release.apk.url)
        else if (release) dependencies.openUrl(release.pageUrl)
      },
    }),
    [
      runtime,
      eligibility,
      prefs,
      currentVersion,
      status,
      error,
      release,
      downloadStatus,
      installError,
      progress,
      check,
      persist,
      dependencies,
    ],
  )

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  )
}

export function useUpdates() {
  const value = useContext(UpdateContext)
  if (!value) throw new Error('useUpdates must be used inside UpdateProvider')
  return value
}
