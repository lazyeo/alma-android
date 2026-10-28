import { t } from '../i18n/runtime'
import { AlmaHttpError } from '../relay/almaApi'

export type RelayErrorPresentation = {
  kind: 'thread-missing' | 'auth' | 'offline' | 'timeout' | 'generic'
  title: string
  detail?: string
}

export function mapRelayError(
  error: unknown,
  context?: 'thread',
): RelayErrorPresentation {
  const status = error instanceof AlmaHttpError ? error.status : undefined
  if (context === 'thread' && status === 404)
    return {
      kind: 'thread-missing',
      title: t('connection.relayError.threadMissing'),
      detail: t('connection.relayError.threadMissingDetail'),
    }
  if (status === 401 || status === 403)
    return {
      kind: 'auth',
      title: t('connection.relayError.auth'),
      detail: t('connection.relayError.authDetail'),
    }
  if (status === 502)
    return {
      kind: 'offline',
      title: t('connection.relayError.offline'),
      detail: t('connection.relayError.offlineDetail'),
    }
  const message = error instanceof Error ? error.message : String(error)
  if (/timed? out|timeout/i.test(message))
    return {
      kind: 'timeout',
      title: t('connection.relayError.timeout'),
      detail: t('connection.relayError.timeoutDetail'),
    }
  return {
    kind: 'generic',
    title: t('connection.relayError.generic'),
    detail: t('connection.relayError.genericDetail'),
  }
}
