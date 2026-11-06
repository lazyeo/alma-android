import type { CatalogShape } from '../core'
import type { browser as source } from '../en/browser'

export const browser: CatalogShape<typeof source> = {
  title: '电脑浏览器',
  open: '打开电脑上的浏览器',
  agentUsing: 'Alma 正在使用电脑上的浏览器',
  menu: '电脑浏览器',
  close: '关闭浏览器画面',
  address: '地址',
  addressPlaceholder: '搜索或输入网址',
  go: '前往',
  back: '后退',
  forward: '前进',
  reload: '刷新',
  tabs: {
    one: '{count} 个标签页',
    other: '{count} 个标签页',
  },
  tabsTitle: '电脑上的标签页',
  newTab: '新标签页',
  untitledTab: '新标签页',
  closeTab: '关闭 {title}',
  agentTab: '由 Alma 打开',
  connecting: '正在连接浏览器…',
  loading: '加载中…',
  closedTitle: '浏览器已关闭',
  closedBody: '在上方输入网址，就会在电脑上的这个标签页里打开。',
  unsupportedTitle: '这台电脑不支持浏览器画面',
  unsupportedBody: '更新那台电脑上的 Alma 后，即可在这里查看它的浏览器。',
  keyboard: '向页面输入',
  keyboardPlaceholder: '向页面输入文字',
  sendText: '发送',
}
