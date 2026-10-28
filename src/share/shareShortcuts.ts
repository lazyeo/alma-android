import { t } from '../i18n/runtime'
import { updateNativeShareShortcuts } from '../nativeBridge'
import type { Thread } from '../relay'
import { encodeNewChatShortcutId, encodeThreadShortcutId } from './shareLogic'

export interface ShareShortcutOptions {
  shortcuts: Array<{ id: string; label: string; desktopName: string }>
  activeDesktopIds: string[]
}

type Publisher = (options: ShareShortcutOptions) => Promise<void>

const signature = (options: ShareShortcutOptions) => JSON.stringify(options)

export function createShareShortcutPublisher(
  publish: Publisher = updateNativeShareShortcuts,
  delayMs = 60_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: ShareShortcutOptions | undefined
  let lastPublished = ''
  return (options: ShareShortcutOptions) => {
    if (signature(options) === lastPublished) return
    pending = options
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      const next = pending
      pending = undefined
      if (!next) return
      const nextSignature = signature(next)
      if (nextSignature === lastPublished) return
      void publish(next)
        .then(() => {
          lastPublished = nextSignature
        })
        .catch(() => undefined)
    }, delayMs)
  }
}

export const publishShareShortcuts = createShareShortcutPublisher()

export function desktopShareShortcuts(
  desktopId: string,
  desktopName: string,
  threads: Thread[],
  // Native removes shortcuts of desktops missing here, so pass every paired desktop.
  activeDesktopIds: string[] = [desktopId],
  limit = 6,
): ShareShortcutOptions {
  return {
    shortcuts: [
      ...threads.slice(0, limit).map((thread) => ({
        id: encodeThreadShortcutId(desktopId, thread.id),
        label: thread.title || t('common.untitledThread'),
        desktopName,
      })),
      {
        id: encodeNewChatShortcutId(desktopId),
        label: t('share.newChatShortcut', { desktop: desktopName }),
        desktopName,
      },
    ],
    activeDesktopIds,
  }
}
