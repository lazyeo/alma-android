import { describe, expect, it } from 'vitest'
import {
  createKeyPair,
  deriveSessionKeys,
  makeCounterIv,
  openFrame,
  routingId,
  sealFrame,
} from './crypto'

describe('relay crypto', () => {
  it('derives the documented routing id deterministically', async () => {
    expect(await routingId('test-code')).toBe(await routingId('test-code'))
    expect(await routingId('test-code')).not.toBe(await routingId('other-code'))
  })

  it('derives identical directional and confirmation keys on both sides', async () => {
    const initiator = await createKeyPair()
    const responder = await createKeyPair()
    const initiatorNonce = crypto.getRandomValues(new Uint8Array(16))
    const responderNonce = crypto.getRandomValues(new Uint8Array(16))
    const a = await deriveSessionKeys({
      connectCode: 'shared',
      myPrivateKey: initiator.privateKey,
      initiatorPublic: initiator.publicKey,
      responderPublic: responder.publicKey,
      initiatorNonce,
      responderNonce,
      peerPublic: responder.publicKey,
    })
    const b = await deriveSessionKeys({
      connectCode: 'shared',
      myPrivateKey: responder.privateKey,
      initiatorPublic: initiator.publicKey,
      responderPublic: responder.publicKey,
      initiatorNonce,
      responderNonce,
      peerPublic: initiator.publicKey,
    })
    expect(Array.from(a.confirmResponder)).toEqual(
      Array.from(b.confirmResponder),
    )
    expect(Array.from(a.confirmInitiator)).toEqual(
      Array.from(b.confirmInitiator),
    )
    const payload = { t: 'hreq', id: '1', method: 'GET', path: '/api/threads' }
    const sealed = await sealFrame(a.c2s, 0n, payload)
    expect(await openFrame(b.c2s, sealed)).toEqual(payload)
  })

  it('seals and opens frames with counter IVs', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ])
    const value = { t: 'wmsg', id: 'socket', s: 'hello' }
    const sealed = await sealFrame(key, 42n, value)
    expect(Array.from(sealed.slice(0, 12))).toEqual(
      Array.from(makeCounterIv(42n)),
    )
    expect(await openFrame(key, sealed)).toEqual(value)
  })
})
