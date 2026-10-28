import type { ComponentType, ReactNode } from 'react'
import type { RealtimeEvent } from '../relay'
import type { NotificationSettings } from '../notifications'
import type { ThreadQueueState } from '../screens/threadQueue'

export type QueueOptions = {
  model?: string
  reasoningEffort?: string
  fastMode?: boolean
}
export type QueueBinding = {
  queue: ThreadQueueState
  mode: 'local' | 'remote' | 'unavailable'
  busy: boolean
  accessory?: ReactNode
  controller: {
    update(queue: ThreadQueueState, options?: QueueOptions): Promise<boolean>
    action(itemId?: string): Promise<boolean>
  }
}
export type NotificationProps = {
  preferences: NotificationSettings
  onPermissionGranted(): void
}
/** Installed once at build time; hook implementations stay fixed for an app lifetime. */
export interface AppExtension {
  Provider?: ComponentType<{ children: ReactNode; preview?: boolean }>
  Settings?: ComponentType
  Notifications?: ComponentType<NotificationProps>
  useThreadListAccessory?(
    desktopId: string,
  ): (threadId: string) => number | undefined
  useThreadQueue?(
    desktopId: string,
    threadId: string,
    options: QueueOptions,
  ): QueueBinding
  useDesktopEventHook?(desktopId: string): (event: RealtimeEvent) => void
  useNotificationSuppression?(): (desktopId: string) => boolean
}
