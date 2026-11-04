import { useCallback, useEffect, useRef, useState } from 'react'
import type { AlmaApi } from '../relay'
import type { PersonalAgentRowState } from './PersonalAgentRow'

/** Live counters change slowly; never poll the desktop faster than this. */
export const PERSONAL_AGENT_POLL_MS = 30_000

/**
 * The active desktop's personal agent row: loads on mount, on focus or when
 * the page becomes visible, every 30 s while
 * visible, and on demand (pull-to-refresh).
 */
export function usePersonalAgent(api: AlmaApi) {
  const [state, setState] = useState<PersonalAgentRowState>({
    status: 'loading',
  })
  const supported = useRef(true)
  const load = useCallback(async () => {
    if (!supported.current) return
    try {
      const [result, vitals] = await Promise.all([
        api.getPersonal(),
        // Mood is decoration: a vitals failure must not hide the row.
        api.getAlmaVitals().catch(() => undefined),
      ])
      if (result.status === 'unsupported') {
        supported.current = false
        setState({ status: 'unsupported' })
        return
      }
      const mood = vitals?.status === 'ok' ? vitals.vitals.mood : undefined
      setState({
        status: 'ready',
        personal: result.personal,
        ...(mood ? { mood } : {}),
      })
    } catch (error) {
      // 503 "not ready" or a dropped tunnel: keep the last good row; with
      // none yet, stay hidden and let the next refresh retry.
      console.warn('[personal-agent] load failed', error)
      setState((current) =>
        current.status === 'ready' ? current : { status: 'error' },
      )
    }
  }, [api])

  useEffect(() => {
    supported.current = true
    setState({ status: 'loading' })
    void load()
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = window.setInterval(refreshIfVisible, PERSONAL_AGENT_POLL_MS)
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [load])

  return { state, refresh: load }
}
