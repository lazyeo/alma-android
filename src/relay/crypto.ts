const encoder = new TextEncoder()
const decoder = new TextDecoder()
const source = (bytes: Uint8Array): BufferSource =>
  bytes as unknown as BufferSource
export const E2E_LABEL = 'alma-relay-e2e/v1'

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  return encoded.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromBase64url(value: string): Uint8Array {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - (value.length % 4)) % 4)
  const binary =
    typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary')
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  return difference === 0
}

async function hkdf(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  length: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    base,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function routingId(connectCode: string): Promise<string> {
  return base64url(
    await hkdf(
      encoder.encode(connectCode),
      encoder.encode(`${E2E_LABEL}/routing`),
      new Uint8Array(),
      16,
    ),
  )
}

export interface EphemeralKeyPair {
  privateKey: CryptoKey
  publicKey: Uint8Array
}

export async function createKeyPair(): Promise<EphemeralKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  return {
    privateKey: pair.privateKey,
    publicKey: new Uint8Array(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    ),
  }
}

async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    source(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
}

export interface DeriveSessionKeysInput {
  connectCode: string
  myPrivateKey: CryptoKey
  peerPublic: Uint8Array
  initiatorPublic: Uint8Array
  responderPublic: Uint8Array
  initiatorNonce: Uint8Array
  responderNonce: Uint8Array
}

export interface SessionKeys {
  c2s: CryptoKey
  s2c: CryptoKey
  confirmResponder: Uint8Array
  confirmInitiator: Uint8Array
}

export async function deriveSessionKeys(
  input: DeriveSessionKeysInput,
): Promise<SessionKeys> {
  const peer = await importPublicKey(input.peerPublic)
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peer },
    input.myPrivateKey,
    256,
  )
  const transcript = concatBytes(
    encoder.encode(E2E_LABEL),
    input.initiatorPublic,
    input.responderPublic,
    input.initiatorNonce,
    input.responderNonce,
  )
  const transcriptHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', source(transcript)),
  )
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveBits',
  ])
  const derive = async (label: string) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: source(encoder.encode(input.connectCode)),
          info: source(concatBytes(encoder.encode(label), transcriptHash)),
        },
        base,
        256,
      ),
    )
  const [c2sRaw, s2cRaw, confirmResponder, confirmInitiator] =
    await Promise.all([
      derive('c2s|'),
      derive('s2c|'),
      derive('confirm-r|'),
      derive('confirm-i|'),
    ])
  const [c2s, s2c] = await Promise.all([
    crypto.subtle.importKey('raw', source(c2sRaw), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]),
    crypto.subtle.importKey('raw', source(s2cRaw), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]),
  ])
  return { c2s, s2c, confirmResponder, confirmInitiator }
}

export function makeCounterIv(counter: bigint): Uint8Array {
  const iv = new Uint8Array(12)
  new DataView(iv.buffer).setBigUint64(4, counter, false)
  return iv
}

type InnerFrame = Record<string, unknown>

const frameBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

export function encodeInnerFrame(
  frame: InnerFrame,
  binary: boolean,
): Uint8Array {
  const bytes = frameBytes(frame.b)
  if (binary) {
    const field = bytes
      ? 'b'
      : frame.t === 'wmsg' && typeof frame.s === 'string'
        ? 's'
        : undefined
    const payload =
      field === 'b'
        ? bytes
        : field === 's'
          ? encoder.encode(frame.s as string)
          : null
    if (field && payload) {
      const header: InnerFrame = { ...frame, $: field }
      delete header[field]
      const head = encoder.encode(JSON.stringify(header))
      const output = new Uint8Array(5 + head.length + payload.length)
      new DataView(output.buffer).setUint32(1, head.length, false)
      output.set(head, 5)
      output.set(payload, 5 + head.length)
      return output
    }
  }
  if (bytes)
    return encoder.encode(JSON.stringify({ ...frame, b: base64url(bytes) }))
  return encoder.encode(JSON.stringify(frame))
}

export function decodeInnerFrame(plaintext: Uint8Array): InnerFrame {
  if (plaintext.length > 0 && plaintext[0] === 0) {
    if (plaintext.length < 5) throw new Error('E2E frame header truncated')
    const headLength = new DataView(
      plaintext.buffer,
      plaintext.byteOffset,
      plaintext.byteLength,
    ).getUint32(1, false)
    if (5 + headLength > plaintext.length)
      throw new Error('E2E frame header truncated')
    const frame = JSON.parse(
      decoder.decode(plaintext.subarray(5, 5 + headLength)),
    ) as InnerFrame
    const field = frame.$
    delete frame.$
    const payload = plaintext.slice(5 + headLength)
    if (field === 's') frame.s = decoder.decode(payload)
    else frame.b = payload
    return frame
  }
  const frame = JSON.parse(decoder.decode(plaintext)) as InnerFrame
  if (typeof frame.b === 'string') frame.b = fromBase64url(frame.b)
  return frame
}

export async function sealBytes(
  key: CryptoKey,
  counter: bigint,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const iv = makeCounterIv(counter)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: source(iv) },
    key,
    source(plaintext),
  )
  return concatBytes(iv, new Uint8Array(encrypted))
}

export async function openBytes(
  key: CryptoKey,
  wire: Uint8Array,
): Promise<Uint8Array> {
  if (wire.length < 29) throw new Error('Encrypted relay frame is too short')
  const iv = wire.slice(0, 12)
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: source(iv) },
      key,
      source(wire.slice(12)),
    ),
  )
}

export function sealFrame(
  key: CryptoKey,
  counter: bigint,
  frame: unknown,
): Promise<Uint8Array> {
  return sealBytes(key, counter, encoder.encode(JSON.stringify(frame)))
}

export async function openFrame<T = unknown>(
  key: CryptoKey,
  wire: Uint8Array,
): Promise<T> {
  return JSON.parse(decoder.decode(await openBytes(key, wire))) as T
}

export const utf8 = encoder
