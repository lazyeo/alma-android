import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useHerdr } from './HerdrProvider'
import { herdrSetupAction, herdrSetupBusy, type HerdrSetupState } from './setup'

const SETUP_POLL_MS = 2_000

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
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const shown = running ? (live ?? setup) : setup
  const action = running ? 'busy' : herdrSetupAction(shown)
  if (action === 'none' && !failure) return null

  const run = async (kind: 'install' | 'start') => {
    const api = apiFor(desktopId)
    if (!api || running) return
    setRunning(kind)
    setFailure(undefined)
    setLive(undefined)
    let polling = true
    const pollUntil = async (done: () => boolean) => {
      while (polling && mounted.current && !done()) {
        await new Promise((resolve) => setTimeout(resolve, SETUP_POLL_MS))
        try {
          const next = await api.getHerdrSetup()
          if (next && mounted.current) setLive(next)
          if (next && !herdrSetupBusy(next.phase)) return next
        } catch {
          /* keep showing the last phase; the next poll retries */
        }
      }
      return undefined
    }
    let settled = false
    void pollUntil(() => settled)
    const failed = (next?: HerdrSetupState) =>
      next?.error ??
      (kind === 'install'
        ? t('agents.setup.installFailed')
        : next?.phase === 'missing'
          ? t('agents.setup.notInstalled')
          : t('agents.setup.startFailed'))
    try {
      const result = await api.runHerdrSetup(kind)
      settled = true
      if (result.status === 'pending') {
        // The proxy stopped waiting; the install carries on over there.
        settled = false
        const next = await pollUntil(() => false)
        if (next && !next.online && mounted.current) setFailure(failed(next))
      } else if (result.status === 'failed') {
        if (mounted.current) setFailure(failed(result.setup))
      } else if (result.status === 'unsupported') {
        if (mounted.current) setFailure(t('agents.setup.unsupported'))
      }
    } catch (reason) {
      if (mounted.current)
        setFailure(reason instanceof Error ? reason.message : String(reason))
    } finally {
      settled = true
      polling = false
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
