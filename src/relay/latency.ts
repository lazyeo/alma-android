import type { ActiveTransport } from './tunnel'

export const LATENCY_WINDOW_SIZE = 8
export const LATENCY_STALE_AFTER_MS = 90_000

export interface TransportLatency {
  transport: ActiveTransport
  ms: number | null
  sampledAt: number
}

export const median = (samples: readonly number[]): number | null => {
  if (!samples.length) return null
  const sorted = [...samples].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

export class LatencyTracker {
  private samples: Record<ActiveTransport, number[]> = {
    relay: [],
    direct: [],
  }
  private sampledAt: Record<ActiveTransport, number> = {
    relay: 0,
    direct: 0,
  }

  record(
    transport: ActiveTransport,
    ms: number,
    sampledAt: number,
  ): TransportLatency {
    const samples = this.samples[transport]
    samples.push(ms)
    if (samples.length > LATENCY_WINDOW_SIZE) samples.shift()
    this.sampledAt[transport] = sampledAt
    return this.current(transport)
  }

  current(transport: ActiveTransport): TransportLatency {
    return {
      transport,
      ms: median(this.samples[transport]),
      sampledAt: this.sampledAt[transport],
    }
  }
}

export const isLatencyStale = (
  latency: TransportLatency,
  now = Date.now(),
): boolean =>
  latency.ms !== null && now - latency.sampledAt > LATENCY_STALE_AFTER_MS
