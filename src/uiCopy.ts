import { t } from './i18n/runtime'
import type { DesktopStatus } from './relay'
import { relayFailureKindOf, relayFailureShort } from './relay/relayDiagnosis'

// Matching runs on raw transport errors, which stay English; only the
// returned summary is translated.
export function humanConnectionError(error?: string) {
  if (!error) return t('connection.status.offline')
  const kind = relayFailureKindOf(error)
  if (kind) return relayFailureShort(kind)
  const normalized = error.toLowerCase()
  if (
    normalized.includes('relay') ||
    normalized.includes('websocket') ||
    normalized.includes('network') ||
    normalized.includes('failed to fetch')
  )
    return t('connection.relayUnreachable')
  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('desktop')
  )
    return t('connection.desktopNotResponding')
  return t('connection.status.offline')
}

export function desktopRowSecondary(
  status: DesktopStatus,
  current: boolean,
  error?: string,
) {
  if (status === 'online')
    return current ? t('connection.currentDesktop') : undefined
  if (error) return humanConnectionError(error)
  if (status === 'connecting') return t('connection.status.connecting')
  return t('connection.status.offline')
}

export function formatLoopSchedule(interval: string, iterations: number) {
  return t('composer.loopSchedule', { interval, count: iterations })
}

export function formatDiffStats(
  additions: number,
  deletions: number,
  filesChanged: number,
) {
  return t('thread.diffStats', { additions, deletions, count: filesChanged })
}

export function humanErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const normalized = message.toLowerCase()
  if (
    normalized.includes('authentication') ||
    normalized.includes('unauthorized')
  )
    return t('connection.errors.rejected')
  if (
    normalized.includes('http') ||
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('relay')
  )
    return t('connection.errors.unreachable')
  if (normalized.includes('timeout') || normalized.includes('timed out'))
    return t('connection.errors.timeout')
  return t('connection.errors.generic')
}
