import { describe, expect, it, vi } from 'vitest'
import { E2ESession, type RelayWebSocket } from './e2eSession'
import {
  RelayConnectError,
  diagnoseRelayFailure,
  relayFailureKindOf,
} from './relayDiagnosis'

const probe = 'https://relay.example/c/abc/__alma_e2e__'
const respond = (status: number) =>
  vi.fn(async () => new Response('', { status })) as unknown as typeof fetch

describe('diagnoseRelayFailure', () => {
  it('reads 502 as an offline desktop or stale code', async () => {
    const error = await diagnoseRelayFailure(probe, { fetchImpl: respond(502) })
    expect(error.kind).toBe('desktop-offline')
  })

  it('reads any other answer as a blocked WebSocket', async () => {
    const error = await diagnoseRelayFailure(probe, { fetchImpl: respond(404) })
    expect(error.kind).toBe('blocked')
    expect(error.message).toContain('relay.example is reachable')
  })

  it('reads a network failure as an unreachable relay', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const error = await diagnoseRelayFailure(probe, { fetchImpl })
    expect(error.kind).toBe('unreachable')
    expect(error.message).toBe(
      "Can't reach relay.example. Check this phone's network or VPN.",
    )
  })

  it('flags a cleartext relay from an https page without probing', async () => {
    const fetchImpl = respond(502)
    const error = await diagnoseRelayFailure(
      'http://192.0.2.5:8080/c/abc/__alma_e2e__',
      { fetchImpl, pageProtocol: 'https:' },
    )
    expect(error.kind).toBe('insecure')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('still probes a loopback http relay', async () => {
    const error = await diagnoseRelayFailure(
      'http://localhost:8787/c/abc/__alma_e2e__',
      { fetchImpl: respond(502), pageProtocol: 'https:' },
    )
    expect(error.kind).toBe('desktop-offline')
  })

  it('recovers the kind from a stored message', () => {
    for (const kind of [
      'insecure',
      'unreachable',
      'desktop-offline',
      'blocked',
    ] as const)
      expect(
        relayFailureKindOf(
          new RelayConnectError(kind, 'relay.alma.now').message,
        ),
      ).toBe(kind)
    expect(relayFailureKindOf('Relay connection failed')).toBeUndefined()
  })
})

/** A socket whose upgrade fails: error, then close, like a browser. */
function failingSocket(): RelayWebSocket & { probeUrl?: string } {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const socket = {
    binaryType: 'blob',
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
      if (type === 'close')
        queueMicrotask(() => {
          for (const fn of listeners.get('error') ?? []) fn({})
          for (const fn of listeners.get('close') ?? []) fn({})
        })
    },
  }
  return socket
}

describe('E2ESession failed upgrade', () => {
  it('rejects with the diagnosis instead of a generic close', async () => {
    const diagnose = vi.fn(
      async () => new RelayConnectError('desktop-offline', 'relay.example'),
    )
    const session = new E2ESession(
      {
        relayUrl: 'https://relay.example',
        connectCode: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
      },
      failingSocket,
      diagnose,
    )
    await expect(session.connect()).rejects.toMatchObject({
      kind: 'desktop-offline',
    })
    expect(diagnose).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/relay\.example\/c\/[\w-]+\/__alma_e2e__$/,
      ),
    )
    expect(session.state).toBe('failed')
  })
})
