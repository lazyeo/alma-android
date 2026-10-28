// Runtime/core only: the relay layer stays free of React.
import { LANGUAGES, type Translator } from '../i18n/core'
import type { Messages } from '../i18n/en'
import { t, translatorFor } from '../i18n/runtime'

// A WebSocket `error` event carries no reason, so after a failed upgrade we
// ask the same relay path over plain HTTP. The relay answers an unknown or
// offline route with 502; an online route is forwarded to the desktop, which
// answers a GET with 404. Neither has side effects.

export type RelayFailureKind =
  'insecure' | 'unreachable' | 'desktop-offline' | 'blocked'

// Copy is translated when the error is created; connection errors are stored
// as strings, so relayFailureKindOf recognises messages in every language.
function relayFailureMessage(
  translate: Translator<Messages>,
  kind: RelayFailureKind,
  host: string,
) {
  switch (kind) {
    case 'insecure':
      return translate('connection.relayFailure.insecure')
    case 'unreachable':
      return translate('connection.relayFailure.unreachable', { host })
    case 'desktop-offline':
      return translate('connection.relayFailure.desktopOffline')
    case 'blocked':
      return translate('connection.relayFailure.blocked', { host })
  }
}

/** Short status-line copy for a failure kind, in the current language. */
export function relayFailureShort(kind: RelayFailureKind) {
  switch (kind) {
    case 'insecure':
      return t('connection.relayFailure.insecureShort')
    case 'unreachable':
      return t('connection.relayUnreachable')
    case 'desktop-offline':
      return t('connection.status.offline')
    case 'blocked':
      return t('connection.relayFailure.blockedShort')
  }
}

export class RelayConnectError extends Error {
  constructor(
    readonly kind: RelayFailureKind,
    host: string,
  ) {
    super(relayFailureMessage(t, kind, host))
    this.name = 'RelayConnectError'
  }
}

const PROBE_TIMEOUT_MS = 6_000
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/

export async function diagnoseRelayFailure(
  probeUrl: string,
  options: {
    fetchImpl?: typeof fetch
    pageProtocol?: string
  } = {},
): Promise<RelayConnectError> {
  const url = new URL(probeUrl)
  const host = url.host
  const pageProtocol = options.pageProtocol ?? globalThis.location?.protocol
  // Android blocks cleartext and https pages block mixed content; loopback
  // stays allowed for local development.
  if (
    url.protocol === 'http:' &&
    pageProtocol === 'https:' &&
    !LOOPBACK.test(url.hostname)
  )
    return new RelayConnectError('insecure', host)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url.toString(), {
      cache: 'no-store',
      signal: controller.signal,
    })
    return new RelayConnectError(
      response.status === 502 ? 'desktop-offline' : 'blocked',
      host,
    )
  } catch {
    return new RelayConnectError('unreachable', host)
  } finally {
    clearTimeout(timer)
  }
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const FAILURE_KINDS: readonly RelayFailureKind[] = [
  'insecure',
  'unreachable',
  'desktop-offline',
  'blocked',
]

// Built on first use: the catalogs are static, so one pass covers every
// language a stored message could have been written in.
let copyPatterns: { kind: RelayFailureKind; pattern: RegExp }[] | undefined
function failurePatterns() {
  copyPatterns ??= LANGUAGES.flatMap((language) =>
    FAILURE_KINDS.map((kind) => ({
      kind,
      pattern: new RegExp(
        `^${relayFailureMessage(translatorFor(language), kind, '\0')
          .split('\0')
          .map(escapeRegExp)
          .join('.+')}$`,
      ),
    })),
  )
  return copyPatterns
}

/** Recovers the kind from a stored message (connection errors are strings). */
export function relayFailureKindOf(
  message: string,
): RelayFailureKind | undefined {
  return failurePatterns().find(({ pattern }) => pattern.test(message))?.kind
}
