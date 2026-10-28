import type { CatalogShape } from '../core'
import type { connection as source } from '../en/connection'

export const connection: CatalogShape<typeof source> = {
  connectingTo: '正在连接 {name}…',
  connectingDesktop: '正在连接桌面端…',
  status: {
    online: '在线',
    connecting: '连接中',
    offline: '离线',
    error: '连接错误',
  },
  currentDesktop: '当前桌面端',
  relayUnreachable: '无法连接中继',
  desktopNotResponding: '桌面端无响应',
  switcher: {
    label: '切换桌面端',
    trigger: '桌面端：{name}。切换桌面端',
    hint: '轻点选择桌面端，或上下滑动切换',
    item: '{name}，{status}',
    add: '添加桌面端',
  },
  relayFailure: {
    insecure: '此中继使用 http://，应用会拦截这类连接。请使用 https 中继。',
    insecureShort: '中继未使用 https',
    unreachable: '无法连接 {host}。请检查这台手机的网络或 VPN。',
    desktopOffline:
      '桌面端已离线，或配对码已更换。请确认那台电脑上的 Alma 正在运行，然后扫描当前的配对码。',
    blocked:
      '{host} 可以访问，但拒绝了连接。可能是代理或 VPN 拦截了 WebSocket。',
    blockedShort: '连接被拦截',
  },
  errors: {
    rejected: '中继拒绝了连接。如果问题持续，请重新配对。',
    unreachable: '无法访问服务，请重试。',
    timeout: '桌面端没有响应，请重试。',
    generic: '出了点问题，请重试。',
  },
  relayError: {
    threadMissing: '此对话已被删除',
    threadMissingDetail: '它在这台桌面端上已不可用。',
    auth: '请重新连接此桌面端',
    authDetail: '如果问题持续，请重新配对。',
    offline: '桌面端离线',
    offlineDetail: '请在它重新连接后重试。',
    timeout: '请求超时',
    timeoutDetail: '请稍后重试。',
    generic: '出了点问题',
    genericDetail: '请重试。',
  },
  pair: {
    lede: '随身带上你的桌面端智能体，而无需把桌面端搬上云。',
    linkLabel: '配对链接',
    connecting: '连接中…',
    connect: '安全连接',
    scan: '扫描二维码',
    cancelScan: '取消扫描',
    encrypted: '端到端加密',
    relayNeverSees: '你的配对码永远不会经过中继。',
    cameraUnavailable: '无法使用相机',
    connectFailed: '无法连接',
    linkRequired: '请粘贴 alma://connect 配对链接',
    linkInvalid: '这不是有效的端到端加密配对链接',
    relayUrlUnsupported: '不支持的中继地址',
    codeInvalid: '连接码无效',
  },
}
