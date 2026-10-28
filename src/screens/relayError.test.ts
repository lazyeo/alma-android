import { describe, expect, it } from 'vitest'
import { AlmaHttpError } from '../relay/almaApi'
import { mapRelayError } from './relayError'

describe('relay error presentation', () => {
  it('recognizes a missing thread', () => {
    expect(mapRelayError(new AlmaHttpError('raw json', 404), 'thread')).toEqual(
      {
        kind: 'thread-missing',
        title: 'This conversation was deleted',
        detail: 'It is no longer available on this desktop.',
      },
    )
  })

  it('maps auth, offline, timeout, and generic errors without raw bodies', () => {
    expect(mapRelayError(new AlmaHttpError('raw', 401)).title).toBe(
      'Reconnect this desktop',
    )
    expect(mapRelayError(new AlmaHttpError('raw', 502)).title).toBe(
      'Desktop is offline',
    )
    expect(
      mapRelayError(new Error('Request timed out after raw json')).title,
    ).toBe('Request timed out')
    expect(mapRelayError(new AlmaHttpError('raw', 401))).toEqual({
      kind: 'auth',
      title: 'Reconnect this desktop',
      detail: 'Pair it again if the problem continues.',
    })
    expect(
      mapRelayError(new Error('GET /api/x failed (500): {"secret":1}')),
    ).toEqual({
      kind: 'generic',
      title: 'Something went wrong',
      detail: 'Try again.',
    })
  })
})
