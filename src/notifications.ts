import { LocalNotifications } from '@capacitor/local-notifications'
import { t } from './i18n/runtime'
import {
  isNativePlatform,
  notificationDestination,
  notificationId,
} from './nativeRuntime'

export type AppNotificationPermission =
  NotificationPermission | 'prompt' | 'unsupported'

export type NotificationSettings = {
  approvals: boolean
  questions: boolean
  generationComplete: boolean
}

export type ForegroundNotificationType =
  'approval' | 'question' | 'generation-complete'

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  approvals: true,
  questions: true,
  generationComplete: true,
}

const STORAGE_KEY = 'alma-mobile-notifications-v1'

export function scopedNotificationTag(desktopId: string, tag: string) {
  return `${desktopId}:${tag}`
}

export function mergeNotificationSettings(
  value: unknown,
): NotificationSettings {
  const source =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  return {
    approvals:
      typeof source.approvals === 'boolean'
        ? source.approvals
        : DEFAULT_NOTIFICATION_SETTINGS.approvals,
    questions:
      typeof source.questions === 'boolean'
        ? source.questions
        : DEFAULT_NOTIFICATION_SETTINGS.questions,
    generationComplete:
      typeof source.generationComplete === 'boolean'
        ? source.generationComplete
        : DEFAULT_NOTIFICATION_SETTINGS.generationComplete,
  }
}

export function loadNotificationSettings(): NotificationSettings {
  try {
    return mergeNotificationSettings(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'),
    )
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function notificationTypeEnabled(
  settings: NotificationSettings,
  type: ForegroundNotificationType,
) {
  if (type === 'approval') return settings.approvals
  if (type === 'question') return settings.questions
  return settings.generationComplete
}

/** True when `pathname` is this desktop's thread, opened from Threads or GTD. */
export function isViewingThread(
  pathname: string,
  desktopId: string,
  threadId: string,
) {
  const desktop = encodeURIComponent(desktopId)
  const thread = encodeURIComponent(threadId)
  return ['threads', 'gtd'].some((list) => {
    const path = `/d/${desktop}/${list}/${thread}`
    return pathname === path || pathname.startsWith(`${path}/`)
  })
}

// Same shape as remote push and native approval/question notifications.
// The title names the thread; the body says what happened and where.
export function notificationCopy(input: {
  type: ForegroundNotificationType
  threadTitle?: string
  desktopName?: string
  queued?: boolean
}) {
  const status = t(
    input.type === 'approval'
      ? 'notifications.status.approval'
      : input.type === 'question'
        ? 'notifications.status.question'
        : input.queued
          ? 'notifications.status.queued'
          : 'notifications.status.finished',
  )
  return {
    title: input.threadTitle?.trim() || t('common.untitledThread'),
    body: input.desktopName
      ? t('notifications.onDesktop', { status, desktop: input.desktopName })
      : status,
  }
}

export async function setApplicationBadge(count: number) {
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (value?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  try {
    if (count > 0) await badgeNavigator.setAppBadge?.(count)
    else await badgeNavigator.clearAppBadge?.()
  } catch {
    // Badge support and permission vary by browser/installation mode.
  }
}

export async function currentNotificationPermission(): Promise<AppNotificationPermission> {
  if (isNativePlatform()) {
    const status = await LocalNotifications.checkPermissions()
    return status.display === 'prompt-with-rationale'
      ? 'default'
      : status.display
  }
  return typeof Notification === 'undefined'
    ? 'unsupported'
    : Notification.permission
}

export async function requestAppNotificationPermission(): Promise<AppNotificationPermission> {
  if (isNativePlatform()) {
    const status = await LocalNotifications.requestPermissions()
    return status.display === 'prompt-with-rationale'
      ? 'default'
      : status.display
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

export async function showForegroundNotification(input: {
  type: ForegroundNotificationType
  tag: string
  url: string
  threadTitle?: string
  queued?: boolean
  desktopName?: string
}) {
  if (isNativePlatform()) {
    const permission = await currentNotificationPermission()
    if (permission !== 'granted') return false
    const copy = notificationCopy(input)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId(input.tag),
          title: copy.title,
          body: copy.body,
          extra: { url: notificationDestination(input.url) },
          channelId: 'alma-foreground',
        },
      ],
    })
    return true
  }

  if (
    document.visibilityState !== 'hidden' ||
    Notification.permission !== 'granted' ||
    !('serviceWorker' in navigator)
  ) {
    return false
  }

  // `serviceWorker.ready` never settles when no worker is registered.
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return false
  const copy = notificationCopy(input)
  await registration.showNotification(copy.title, {
    body: copy.body,
    icon: '/icon-192.png',
    // Badges are drawn as an alpha mask, like the Android status-bar icon.
    badge: '/badge-96.png',
    tag: input.tag,
    renotify: false,
    vibrate: [180, 80, 180],
    data: { url: input.url },
  } as NotificationOptions)
  return true
}
