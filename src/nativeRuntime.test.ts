import { describe, expect, it } from 'vitest'
import {
  notificationDestination,
  notificationId,
  shouldRegisterServiceWorker,
} from './nativeRuntime'

describe('native runtime selection', () => {
  it('registers the PWA service worker only on the web target', () => {
    expect(shouldRegisterServiceWorker(false)).toBe(true)
    expect(shouldRegisterServiceWorker(true)).toBe(false)
  })

  it('uses a stable positive Android notification id for each dedupe tag', () => {
    const first = notificationId('question:request-123')
    expect(first).toBe(notificationId('question:request-123'))
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThanOrEqual(2_147_483_647)
    expect(first).not.toBe(notificationId('question:request-456'))
  })

  it('routes notification taps to a desktop-scoped thread or the thread list', () => {
    expect(notificationDestination('/d/home/threads/thread-123')).toBe(
      '/d/home/threads/thread-123',
    )
    expect(notificationDestination('/inbox')).toBe('/threads')
    expect(notificationDestination('https://example.com')).toBe('/threads')
    expect(notificationDestination('/settings')).toBe('/threads')
  })
})
