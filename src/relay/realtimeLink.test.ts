import { describe, expect, it } from 'vitest'
import type { DesktopStatus } from './connectionManager'
import { initialRealtimeLink, nextRealtimeLink } from './realtimeLink'

const walk = (statuses: DesktopStatus[]) => {
  let link = initialRealtimeLink(statuses[0])
  const seen = [link]
  for (const status of statuses.slice(1)) {
    const next = nextRealtimeLink(link, status)
    if (next !== link) seen.push(next)
    link = next
  }
  return { link, seen }
}

describe('realtime link', () => {
  it('stays closed until the desktop is online', () => {
    expect(initialRealtimeLink('connecting')).toEqual({
      online: false,
      epoch: 0,
    })
    expect(initialRealtimeLink('online')).toEqual({ online: true, epoch: 1 })
  })

  it('closes while offline and reopens once per return to online', () => {
    const { seen } = walk([
      'connecting',
      'online',
      'offline',
      'connecting',
      'error',
      'online',
    ])
    expect(seen).toEqual([
      { online: false, epoch: 0 },
      { online: true, epoch: 1 },
      { online: false, epoch: 1 },
      { online: true, epoch: 2 },
    ])
  })

  it('keeps the same link for repeated statuses so sockets are not churned', () => {
    const link = initialRealtimeLink('online')
    expect(nextRealtimeLink(link, 'online')).toBe(link)
    const closed = nextRealtimeLink(link, 'offline')
    expect(nextRealtimeLink(closed, 'connecting')).toBe(closed)
  })
})
