import WebSocket from 'ws'
import { webcrypto } from 'node:crypto'
import { AlmaApi } from '../src/relay/almaApi.ts'
import { RelayTunnel } from '../src/relay/tunnel.ts'

globalThis.crypto ??= webcrypto

const smokeTitle = 'alma-mobile smoke'
const results = []
const seen = new Set()
const deltaShapes = new Set()
let secret = ''

const redact = (value) =>
  String(value instanceof Error ? value.stack || value.message : value)
    .replaceAll(secret, '[REDACTED]')
    .replace(/alma:\/\/connect\?[^\s]+/g, '[REDACTED LINK]')

async function step(name, run) {
  try {
    await run()
    results.push([name, 'PASS'])
    console.log(`✓ ${name}`)
  } catch (error) {
    results.push([name, `FAIL ${redact(error).split('\n')[0]}`])
    throw error
  }
}

function waitFor(predicate, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const value = predicate()
      if (value) {
        clearInterval(timer)
        resolve(value)
      } else if (Date.now() - started > timeout) {
        clearInterval(timer)
        reject(new Error('Timed out waiting for realtime event'))
      }
    }, 100)
  })
}

function factory(url) {
  const socket = new WebSocket(url, {
    headers: { 'x-alma-client': 'alma-mobile-smoke/0.1.0' },
  })

  return {
    set binaryType(value) {
      socket.binaryType = value
    },
    get binaryType() {
      return socket.binaryType
    },
    get readyState() {
      return socket.readyState
    },
    send(data) {
      socket.send(data)
    },
    close(code, reason) {
      socket.close(code, reason)
    },
    addEventListener(type, listener, options) {
      socket.addEventListener(type, listener, options)
    },
  }
}

function recordDeltaShapes(event) {
  if (event.type !== 'message_delta' || !Array.isArray(event.data?.deltas)) {
    return
  }

  for (const delta of event.data.deltas) {
    if (!delta || typeof delta !== 'object') continue
    const type = typeof delta.type === 'string' ? delta.type : '(missing)'
    deltaShapes.add(`${type} [${Object.keys(delta).sort().join(', ')}]`)
  }
}

let tunnel
let api
let smokeId
const smokeIds = []
let threadSocket

try {
  const settings = await fetch('http://127.0.0.1:23001/api/settings').then(
    (response) => {
      if (!response.ok) throw new Error(`Settings HTTP ${response.status}`)
      return response.json()
    },
  )
  secret = settings?.mobileRelay?.connectCode || ''
  const relayUrl = settings?.mobileRelay?.serverUrl
  if (!secret || !relayUrl) {
    throw new Error('Desktop mobile relay is not configured')
  }

  tunnel = new RelayTunnel(
    { relayUrl, connectCode: secret, deviceName: 'Alma Desktop' },
    factory,
  )
  api = new AlmaApi(tunnel)

  await step('E2E handshake', () => tunnel.connect())

  let threads = []
  await step('GET /api/threads', async () => {
    threads = await api.listThreads()
    if (!Array.isArray(threads)) throw new Error('Expected thread array')
  })
  await step('Clean stale smoke threads', async () => {
    const stale = threads.filter((thread) => thread.title === smokeTitle)
    await Promise.all(stale.map((thread) => api.deleteThread(thread.id)))
  })
  await step('GET first messages', async () => {
    const first = threads.find((thread) => thread.title !== smokeTitle)
    if (!first?.id) throw new Error('No existing thread available')
    const response = await tunnel.fetch(
      `/api/threads/${encodeURIComponent(first.id)}/messages`,
    )
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
  })

  let snapshot = false
  let completed = false
  let stopped = false
  let generationError = ''
  let activeGenerating = false
  let smokeDeltaCount = 0
  threadSocket = api.threadsSocket((event) => {
    seen.add(event.type)
    recordDeltaShapes(event)
    const deltaThreadId =
      event.data?.threadId ?? event.data?.deltas?.[0]?.threadId
    if (event.type === 'message_delta' && deltaThreadId === smokeId) {
      smokeDeltaCount += 1
    }
    if (event.type === 'generating_snapshot') snapshot = true
    if (
      event.data?.threadId === smokeId &&
      event.type === 'thread_generating'
    ) {
      activeGenerating = Boolean(event.data.isGenerating)
    }
    if (
      event.data?.threadId === smokeId &&
      event.type === 'generation_completed'
    ) {
      completed = true
    }
    if (event.data?.threadId === smokeId && event.type === 'generation_error') {
      // Fail fast with the redacted desktop error instead of a 120 s timeout.
      generationError = redact(
        event.data?.error ?? event.data?.message ?? 'generation_error',
      ).slice(0, 300)
    }
    if (
      event.data?.threadId === smokeId &&
      event.type === 'generation_stopped'
    ) {
      stopped = true
    }
  })

  await step('WS generating_snapshot', async () => {
    await threadSocket.opened
    await waitFor(() => snapshot, 15000)
  })
  await step('Create smoke thread', async () => {
    const thread = await api.createThread(smokeTitle)
    smokeId = thread.id
    if (!smokeId) throw new Error('Create response missing id')
    smokeIds.push(smokeId)
    await api.updateThread(smokeId, { metadata: { almaMobileSmoke: true } })
  })
  await step('generate_response', async () => {
    threadSocket.generateResponse(
      smokeId,
      'Reply with exactly the single word: pong',
    )
    await waitFor(() => completed || generationError, 120000)
    if (generationError) throw new Error(`generation_error: ${generationError}`)
  })
  await step('stop_generation', async () => {
    const stopThread = await api.createThread(smokeTitle)
    smokeId = stopThread.id
    if (!smokeId) throw new Error('Create response missing id')
    smokeIds.push(smokeId)
    await api.updateThread(smokeId, { metadata: { almaMobileSmoke: true } })
    completed = false
    stopped = false
    activeGenerating = false
    smokeDeltaCount = 0
    threadSocket.generateResponse(
      smokeId,
      'Write a detailed 2,000-word explanation of how a mechanical clock works.',
    )
    await waitFor(
      () => completed || (activeGenerating && smokeDeltaCount > 0),
      15000,
    ).catch(() => false)
    if (!completed && activeGenerating) {
      threadSocket.stopGeneration(smokeId)
      await waitFor(() => stopped, 120000)
    }
  })
} catch (error) {
  if (!results.some(([, status]) => status.startsWith('FAIL'))) {
    results.push(['Unexpected error', `FAIL ${redact(error).split('\n')[0]}`])
  }
} finally {
  if (smokeIds.length && api) {
    try {
      await Promise.all(smokeIds.map((id) => api.deleteThread(id)))
      results.push(['Delete smoke threads', 'PASS'])
    } catch (error) {
      results.push([
        'Delete smoke threads',
        `FAIL ${redact(error).split('\n')[0]}`,
      ])
    }
  }

  threadSocket?.close()

  console.log('Alma Mobile relay smoke')
  for (const [name, status] of results) {
    console.log(
      `${status.startsWith('PASS') ? '✓' : '✗'} ${name.padEnd(25)} ${status}`,
    )
  }
  console.log(`events: ${[...seen].sort().join(', ')}`)
  console.log(
    `delta shapes: ${[...deltaShapes].sort().join('; ') || '(none observed)'}`,
  )
  process.exitCode = results.some(([, status]) => !status.startsWith('PASS'))
    ? 1
    : 0
  tunnel?.close()
}
