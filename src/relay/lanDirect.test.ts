import { describe, expect, it, vi } from 'vitest'
import { lanCandidateUrls, raceLanProbes } from './lanDirect'

describe('lan candidate ordering', () => {
  it('preserves desktop preference while rejecting invalid and duplicate hosts', () => {
    expect(
      lanCandidateUrls({
        port: 23019,
        hosts: [
          'desk.local',
          '192.168.1.4',
          'desk.local',
          '8.8.8.8',
          '172.31.2.3',
          '172.32.2.3',
        ],
      }),
    ).toEqual([
      'ws://desk.local:23019/__alma_e2e__',
      'ws://192.168.1.4:23019/__alma_e2e__',
      'ws://172.31.2.3:23019/__alma_e2e__',
    ])
  })

  it('rejects invalid ports and host shapes', () => {
    expect(lanCandidateUrls({ port: 80, hosts: ['desk.local'] })).toEqual([])
    expect(
      lanCandidateUrls({ port: 23019, hosts: ['sub.desk.local', 'localhost'] }),
    ).toEqual([])
  })
})

describe('LAN probe race', () => {
  it('returns the first authenticated probe and closes the losers', async () => {
    const closed: string[] = []
    const resolvers = new Map<string, (value: string) => void>()
    const probe = vi.fn(
      (url: string) =>
        new Promise<string>((resolve) => resolvers.set(url, resolve)),
    )
    const racing = raceLanProbes(['a', 'b', 'c'], probe, (value) =>
      closed.push(value),
    )
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(3))
    resolvers.get('b')?.('session-b')

    await expect(racing).resolves.toBe('session-b')
    resolvers.get('a')?.('session-a')
    resolvers.get('c')?.('session-c')
    await vi.waitFor(() =>
      expect(closed.sort()).toEqual(['session-a', 'session-c']),
    )
  })

  it('returns undefined when every probe fails', async () => {
    await expect(
      raceLanProbes(
        ['a', 'b'],
        async () => {
          throw new Error('unreachable')
        },
        vi.fn(),
      ),
    ).resolves.toBeUndefined()
  })
})
