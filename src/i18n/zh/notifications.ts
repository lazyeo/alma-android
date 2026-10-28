import type { CatalogShape } from '../core'
import type { notifications as source } from '../en/notifications'

export const notifications: CatalogShape<typeof source> = {
  status: {
    approval: '需要你审批',
    question: '有问题要问你',
    queued: '排队消息已发送',
    finished: '回复已完成',
  },
  onDesktop: '{desktop}：{status}',
  channel: {
    name: 'Alma 前台提醒',
    description: '审批、提问和已完成的回复',
  },
}
