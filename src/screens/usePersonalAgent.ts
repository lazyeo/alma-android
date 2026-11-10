import { useCallback, useEffect, useRef, useState } from 'react'
import type { AlmaApi } from '../relay'
import type { PersonalAgentState } from './personalAgent'

/** Live counters change slowly; never poll the desktop faster than this. */
export const PERSONAL_AGENT_POLL_MS = 30_000

/**
 * The active desktop's personal agent: loads on mount, on focus or when the
 * page becomes visible, every 30 s while visible, and on demand
 * (pull-to-refresh, opening Alma). Without a connection it stays loading.
 */
export function usePersonalAgent(api: AlmaApi | undefined) {
  const [state, setState] = useState<PersonalAgentState>({
    status: 'loading',
  })
  const supported = useRef(true)
  // The provider outlives desktop switches, so a reply from the previous
  // desktop can land after the switch; it must not become this desktop's Alma.
  const currentApi = useRef(api)
  const load = useCallback(async () => {
    if (!api || !supported.current) return
    try {
      const [result, vitals] = await Promise.all([
        api.getPersonal(),
        // Mood is decoration: a vitals failure must not hide Alma.
        api.getAlmaVitals().catch(() => undefined),
      ])
      if (currentApi.current !== api) return
      if (result.status === 'unsupported') {
        supported.current = false
        setState({ status: 'unsupported' })
        return
      }
      setState({
        status: 'ready',
        personal: result.personal,
        ...(vitals?.status === 'ok' ? { vitals: vitals.vitals } : {}),
      })
    } catch (error) {
      // 503 "not ready" or a dropped tunnel: keep the last good state; with
      // none yet, stay hidden and let the next refresh retry.
      console.warn('[personal-agent] load failed', error)
      if (currentApi.current !== api) return
      setState((current) =>
        current.status === 'ready' ? current : { status: 'error' },
      )
    }
  }, [api])

  useEffect(() => {
    currentApi.current = api
    supported.current = true
    setState({ status: 'loading' })
    if (!api) return
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
  }, [api, load])

  return { state, refresh: load }
}
