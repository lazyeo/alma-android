import type { CatalogShape } from '../core'
import type { gtd as source } from '../en/gtd'

export const gtd: CatalogShape<typeof source> = {
  status: {
    todo: '待办',
    in_progress: '进行中',
    inbox: '收件箱',
    done: '已完成',
    archived: '已归档',
  },
  statusTabs: 'GTD 状态',
  archivedCount: '已归档，{count}',
  favorites: '收藏',
  olderThanWeek: '7 天前',
  emptySegment: '“{status}”中没有内容。',
}
