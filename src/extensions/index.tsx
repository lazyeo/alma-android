import { useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { installed } from '@alma/extensions-installed'
import { loadThreadQueueState, saveThreadQueue } from '../screens/threadQueue'
import type { NotificationProps, QueueBinding, QueueOptions } from './api'
export type { AppExtension } from './api'

export function ExtensionProvider({
  children,
  preview,
}: {
  children: ReactNode
  preview?: boolean
}) {
  const Provider = installed.Provider
  return Provider ? (
    <Provider preview={preview}>{children}</Provider>
  ) : (
    <>{children}</>
  )
}
export function ExtensionSettings() {
  const Settings = installed.Settings
  return Settings ? <Settings /> : null
}
export function ExtensionNotifications(props: NotificationProps) {
  const Notifications = installed.Notifications
  return Notifications ? <Notifications {...props} /> : null
}
const noCount = () => undefined
const noEvent = () => {}
const noSuppression = () => false
export const useThreadListAccessory = (desktopId: string) =>
  installed.useThreadListAccessory?.(desktopId) ?? noCount
export const useDesktopEventHook = (desktopId: string) =>
  installed.useDesktopEventHook?.(desktopId) ?? noEvent
export const useNotificationSuppression = () =>
  installed.useNotificationSuppression?.() ?? noSuppression
function useLocalQueue(desktopId: string, threadId: string): QueueBinding {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const [queue, setQueue] = useState(() =>
    loadThreadQueueState(window.localStorage, desktopId, threadId),
  )
  return {
    queue,
    mode: 'local',
    accessory: failed ? (
      <p role="status" className="settings-error">
        {t('thread.errors.saveQueue')}
      </p>
    ) : null,
    busy: false,
    controller: {
      async update(next) {
        try {
          saveThreadQueue(
            window.localStorage,
            desktopId,
            threadId,
            next.messages,
            next.autoSendWhenIdle,
          )
          setFailed(false)
          setQueue(next)
          return true
        } catch {
          setFailed(true)
          return false
        }
      },
      async action() {
        return false
      },
    },
  }
}
export const useThreadQueue = (
  desktopId: string,
  threadId: string,
  options: QueueOptions,
): QueueBinding =>
  (installed.useThreadQueue ?? useLocalQueue)(desktopId, threadId, options)
