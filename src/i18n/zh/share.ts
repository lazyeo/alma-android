import type { CatalogShape } from '../core'
import type { share as source } from '../en/share'

export const share: CatalogShape<typeof source> = {
  title: '分享到',
  close: '关闭分享',
  searchPlaceholder: '搜索对话',
  recent: '最近的对话',
  loading: '正在加载对话…',
  desktopOffline: '桌面端离线',
  loadFailed: '无法加载对话',
  noMatches: '没有符合搜索条件的对话。',
  questionPlaceholder: '添加一个问题',
  sending: '正在发送…',
  newConversationOn: '在 {desktop} 上新建对话',
  desktopFallback: '桌面端',
  chooseDesktop: '选择桌面端',
  chooseOnline: '请选择一个在线的桌面端以继续。',
  failed: '无法分享。你的问题已保留。',
  nothingWaiting: '没有等待分享的内容。',
  backToThreads: '返回对话列表',
  newChatShortcut: '新对话：{desktop}',
  sharedFiles: '分享了 {names}',
  fileNameSeparator: '、',
}
