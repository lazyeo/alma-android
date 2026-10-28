/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] }

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

const sw = self as unknown as ServiceWorkerGlobalScope

clientsClaim()
sw.skipWaiting()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

sw.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    event.notification.data?.url || '/inbox',
    sw.location.origin,
  )
  event.waitUntil(
    sw.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windows) => {
        for (const client of windows) {
          await client.focus()
          client.postMessage({
            type: 'notification-click',
            url: `${target.pathname}${target.search}${target.hash}`,
          })
          return
        }
        await sw.clients.openWindow(target.href)
      }),
  )
})
