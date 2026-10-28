import type { CatalogShape } from '../core'
import type { nav as source } from '../en/nav'

export const nav: CatalogShape<typeof source> = {
  main: '主导航',
  threads: '对话',
  gtd: 'GTD',
  settings: '设置',
  crystals: '结晶',
  references: '引用关系',
  timeClues: '时间线索',
  unseenTimeClues: '有未读的时间线索',
  showThreadList: '显示对话列表',
  hideThreadList: '隐藏对话列表',
}
