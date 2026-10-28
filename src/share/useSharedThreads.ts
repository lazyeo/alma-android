import { useEffect, useMemo, useRef, useState } from 'react'
import { useDesktops } from '../desktops/DesktopContext'
import { t } from '../i18n/runtime'
import { humanConnectionError } from '../uiCopy'
import { initialThreadListState, type Thread } from '../relay'
import { mergeSharedThreads, type SharedThreadSource } from './shareLogic'

export function useSharedThreads() {
  const { desktops: allDesktops } = useDesktops()
  const desktops = allDesktops.filter(({ pairing }) => !pairing.hidden)
  const [sources, setSources] = useState<SharedThreadSource[]>(() =>
    desktops.map(({ pairing, status, connection }) => ({
      desktopId: pairing.id,
      desktopName: pairing.name,
      status,
      note: connection?.error,
      threads: initialThreadListState(pairing.id, window.localStorage).threads,
    })),
  )
  const [loading, setLoading] = useState(true)
  const desktopSignature = desktops
    .map(({ pairing, status, connection }) =>
      [pairing.id, pairing.name, status, connection?.error || ''].join('|'),
    )
    .join('\n')
  const desktopsRef = useRef(desktops)
  desktopsRef.current = desktops

  useEffect(() => {
    const currentDesktops = desktopsRef.current
    let active = true
    setLoading(true)
    void Promise.all(
      currentDesktops.map(async ({ pairing, status, connection }) => {
        const cached = initialThreadListState(
          pairing.id,
          window.localStorage,
        ).threads
        if (!connection || status !== 'online')
          return {
            desktopId: pairing.id,
            desktopName: pairing.name,
            status,
            note:
              status === 'error'
                ? humanConnectionError(connection?.error)
                : t('share.desktopOffline'),
            threads: cached,
          } satisfies SharedThreadSource
        try {
          const threads = await connection.api.listThreads()
          return {
            desktopId: pairing.id,
            desktopName: pairing.name,
            status,
            threads,
          } satisfies SharedThreadSource
        } catch {
          return {
            desktopId: pairing.id,
            desktopName: pairing.name,
            status: 'error' as const,
            note: t('share.loadFailed'),
            threads: cached,
          } satisfies SharedThreadSource
        }
      }),
    ).then((next) => {
      if (!active) return
      setSources(next)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [desktopSignature])

  return {
    sources,
    rows: useMemo(() => mergeSharedThreads(sources), [sources]),
    loading,
  }
}

export function recentThreadsByDesktop(
  sources: SharedThreadSource[],
  limit = 6,
): Array<{ desktopId: string; desktopName: string; thread: Thread }> {
  return mergeSharedThreads(sources)
    .filter((row) => row.status === 'online')
    .slice(0, limit)
    .map((row) => ({
      desktopId: row.desktopId,
      desktopName: row.desktopName,
      thread: { id: row.threadId, title: row.title, updatedAt: row.updatedAt },
    }))
}
