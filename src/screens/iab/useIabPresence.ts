import { useEffect, useState } from 'react'
import { threadBrowserOpen } from './protocol'

interface IabStatusApi {
  getIabStatus(): Promise<
    { supported: false } | { supported: true; status: unknown }
  >
}

/** While Alma replies, how often to look for the browser it may open. */
export const IAB_POLL_MS = 10_000

// Desktops found without the browser view this session (an older Alma whose
// socket stays silent). A restart asks again, so an update is picked up.
const unsupportedDesktops = new Set<string>()

export function markIabUnsupported(desktopId: string) {
  unsupportedDesktops.add(desktopId)
}

export function resetIabPresenceForTests() {
  unsupportedDesktops.clear()
}

type Presence =
  | { kind: 'unknown' }
  | { kind: 'unsupported' }
  | { kind: 'supported'; status: unknown }

/**
 * Whether the conversation can offer the computer browser (`supported`), and
 * whether Alma has a browser open for this thread's workspace (`active`).
 * Nothing shows until the desktop answers, so an older desktop never
 * flashes an entry it cannot serve.
 */
export function useIabPresence(
  api: IabStatusApi,
  desktopId: string,
  workspaceKey: string | undefined,
  generating: boolean,
) {
  const [presence, setPresence] = useState<Presence>({ kind: 'unknown' })

  useEffect(() => {
    setPresence({ kind: 'unknown' })
  }, [api, desktopId])

  useEffect(() => {
    if (unsupportedDesktops.has(desktopId)) {
      setPresence({ kind: 'unsupported' })
      return
    }
    let current = true
    const check = () => {
      if (document.visibilityState !== 'visible') return
      api.getIabStatus().then(
        (result) => {
          if (!current) return
          if (!result.supported) {
            markIabUnsupported(desktopId)
            setPresence({ kind: 'unsupported' })
          } else setPresence({ kind: 'supported', status: result.status })
        },
        () => {
          // A failed check (offline, relay hiccup) keeps the last answer;
          // the next check or a reconnect corrects it. Nothing to report.
        },
      )
    }
    // Runs on open and whenever a reply starts or ends: a reply that just
    // ended may have opened or closed the browser.
    check()
    const timer = generating ? setInterval(check, IAB_POLL_MS) : undefined
    document.addEventListener('visibilitychange', check)
    return () => {
      current = false
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [api, desktopId, generating])

  const supported =
    presence.kind === 'supported' && !unsupportedDesktops.has(desktopId)
  return {
    supported,
    active:
      supported &&
      threadBrowserOpen(
        presence.kind === 'supported' ? presence.status : undefined,
        workspaceKey,
      ),
  }
}
