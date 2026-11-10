import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useHerdr } from './HerdrProvider'
import { herdrSetupAction, herdrSetupBusy, type HerdrSetupState } from './setup'

const SETUP_POLL_MS = 2_000
/** The desktop's install limit (5 min) plus its start and online waits. */
const SETUP_WAIT_MS = 6 * 60_000
/** Consecutive failed reads before the page stops waiting. */
const SETUP_POLL_ERRORS = 5

/**
 * Install or start Herdr Core from the offline Herdr page. The desktop's
 * POST only answers once Herdr is up or the attempt failed (an install can
 * take minutes; through another computer it gives up after 60 s), so the
 * phase is polled meanwhile to show progress.
 */
export function HerdrSetupActions({
  desktopId,
  setup,
}: {
  desktopId: string
  setup?: HerdrSetupState
}) {
  const t = useT()
  const { apiFor, retry } = useHerdr()
  const [running, setRunning] = useState<'install' | 'start'>()
  const [live, setLive] = useState<HerdrSetupState>()
  const [failure, setFailure] = useState<string>()
  const mounted = useRef(false)
  // Set on mount, not at creation: StrictMode's dev remount runs the
  // cleanup once and would otherwise leave the flag false for good.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const shown = running ? (live ?? setup) : setup
  const action = running ? 'busy' : herdrSetupAction(shown)
  if (action === 'none' && !failure) return null

  const run = async (kind: 'install' | 'start') => {
    const api = apiFor(desktopId)
    if (!api || running) return
    setRunning(kind)
    setFailure(undefined)
    setLive(undefined)
    // One poller for the whole attempt, so progress shows while the POST
    // waits and after a proxy timeout; it stops when the POST settles, the
    // phase leaves installing/starting, or after the install's own limit.
    let requestDone = false
    let errors = 0
    const deadline = Date.now() + SETUP_WAIT_MS
    const poll = async (): Promise<HerdrSetupState | 'gave-up' | undefined> => {
      while (mounted.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, SETUP_POLL_MS))
        if (!mounted.current || requestDone) return undefined
        try {
          const next = await api.getHerdrSetup()
          errors = 0
          if (next && mounted.current) setLive(next)
          if (next && !herdrSetupBusy(next.phase)) return next
        } catch {
          if (++errors >= SETUP_POLL_ERRORS) return 'gave-up'
        }
      }
      return 'gave-up'
    }
    const failed = (next?: HerdrSetupState) =>
      next?.error ??
      (kind === 'install'
        ? t('agents.setup.installFailed')
        : next?.phase === 'missing'
          ? t('agents.setup.notInstalled')
          : t('agents.setup.startFailed'))
    const polling = poll()
    try {
      const result = await api.runHerdrSetup(kind)
      if (result.status === 'pending') {
        // The proxy stopped waiting; the install carries on over there.
        const next = await polling
        if (!mounted.current) return
        if (next === 'gave-up') setFailure(t('agents.setup.stillRunning'))
        else if (next && !next.online) setFailure(failed(next))
      } else if (result.status === 'failed') {
        if (mounted.current) setFailure(failed(result.setup))
      } else if (result.status === 'unsupported') {
        if (mounted.current) setFailure(t('agents.setup.unsupported'))
      }
    } catch (reason) {
      if (mounted.current)
        setFailure(reason instanceof Error ? reason.message : String(reason))
    } finally {
      requestDone = true
      if (mounted.current) setRunning(undefined)
      // Re-read Herdr: online shows the board, offline the fresh phase.
      retry(desktopId)
    }
  }

  const error = failure ?? (running ? undefined : shown?.error)
  return (
    <div className="herdr-setup">
      {action === 'busy' ? (
        <p className="herdr-setup-progress" role="status" aria-live="polite">
          <LoaderCircle className="spinner" size={16} />
          {shown?.phase === 'installing' ||
          (running === 'install' && shown?.phase !== 'starting')
            ? t('agents.setup.installing')
            : t('agents.setup.starting')}
        </p>
      ) : action === 'install' ? (
        <button className="primary" onClick={() => void run('install')}>
          {t('agents.setup.install')}
        </button>
      ) : action === 'start' ? (
        <button className="primary" onClick={() => void run('start')}>
          {t('agents.setup.start')}
        </button>
      ) : null}
      {error ? (
        <p className="herdr-setup-error error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
