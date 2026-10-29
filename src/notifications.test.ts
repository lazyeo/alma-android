import { describe, expect, it } from 'vitest'
import { setLanguage } from './i18n/runtime'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationSettings,
  notificationCopy,
  notificationTypeEnabled,
  isViewingThread,
  scopedNotificationTag,
} from './notifications'

describe('notification settings', () => {
  it('defaults each foreground notification type to enabled', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS).toEqual({
      approvals: true,
      questions: true,
      generationComplete: true,
      agentNeedsYou: true,
    })
  })

  it('merges persisted partial values without trusting non-booleans', () => {
    expect(
      mergeNotificationSettings({ approvals: false, questions: 'no' }),
    ).toEqual({
      approvals: false,
      questions: true,
      generationComplete: true,
      agentNeedsYou: true,
    })
  })

  it('scopes notification tags by desktop', () => {
    expect(scopedNotificationTag('home', 'request-1')).toBe('home:request-1')
    expect(scopedNotificationTag('home', 'request-1')).not.toBe(
      scopedNotificationTag('mini', 'request-1'),
    )
  })

  it('maps event types to toggles and concise copy', () => {
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      questions: false,
    }
    expect(notificationTypeEnabled(settings, 'question')).toBe(false)
    expect(
      notificationCopy({
        type: 'generation-complete',
        threadTitle: 'Protocol capture',
      }),
    ).toEqual({ title: 'Protocol capture', body: 'Reply finished' })
  })

  it('matches remote extension push copy with a natural desktop phrase', () => {
    expect(
      notificationCopy({
        type: 'generation-complete',
        threadTitle: '备份原版固件',
        desktopName: 'Alma@MBA',
      }),
    ).toEqual({ title: '备份原版固件', body: 'Reply finished on Alma@MBA' })
    expect(
      notificationCopy({
        type: 'generation-complete',
        queued: true,
        desktopName: 'Mac mini',
      }),
    ).toEqual({
      title: 'Untitled thread',
      body: 'Queued message sent on Mac mini',
    })
    expect(
      notificationCopy({
        type: 'approval',
        threadTitle: 'T',
        desktopName: 'Mac mini',
      }),
    ).toEqual({ title: 'T', body: 'Needs your approval on Mac mini' })
    expect(notificationCopy({ type: 'question', threadTitle: 'T' })).toEqual({
      title: 'T',
      body: 'Has a question for you',
    })
  })
})

describe('notification copy in Chinese', () => {
  it('uses the runtime language at notify time', () => {
    setLanguage('zh')
    try {
      expect(
        notificationCopy({ type: 'approval', desktopName: 'Mac mini' }),
      ).toEqual({ title: '未命名对话', body: 'Mac mini：需要你审批' })
    } finally {
      setLanguage('en')
    }
  })
})

describe('isViewingThread', () => {
  it('matches the open thread under Threads or GTD', () => {
    expect(
      isViewingThread('/d/mac%20book/threads/t%201', 'mac book', 't 1'),
    ).toBe(true)
    expect(isViewingThread('/d/mac%20book/gtd/t%201', 'mac book', 't 1')).toBe(
      true,
    )
    expect(
      isViewingThread('/d/mac%20book/threads/t%201/', 'mac book', 't 1'),
    ).toBe(true)
  })

  it('does not match lists, other threads, or other desktops', () => {
    expect(isViewingThread('/d/a/threads', 'a', 't1')).toBe(false)
    expect(isViewingThread('/d/a/threads/t10', 'a', 't1')).toBe(false)
    expect(isViewingThread('/d/b/threads/t1', 'a', 't1')).toBe(false)
    expect(isViewingThread('/d/a/crystals/t1', 'a', 't1')).toBe(false)
  })
})
