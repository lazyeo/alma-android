import type { CatalogShape } from '../core'
import type { handoff as source } from '../en/handoff'

export const handoff: CatalogShape<typeof source> = {
  toolApproval: '工具审批',
  toolRequest: '工具请求',
  request: '请求内容',
  denialReason: '拒绝理由',
  submitDenial: '提交拒绝',
  allowOnce: '允许一次',
  allowAlways: '始终允许',
  deny: '拒绝',
  denyWithReason: '拒绝并说明理由',
  question: '提问',
  customAnswer: '自定义回答',
  addAnswer: '补充其他回答…',
  previous: '上一个',
  next: '下一个',
  page: '{page} / {total}',
  submitAnswer: '提交回答',
  decline: '拒绝回答',
  onDesktop: '（{desktop}）',
  untitled: '未命名',
  loadThreadsFailed: '无法加载对话',
  respondFailed: '无法发送回复',
  respondUnsupported: '{desktop} 不支持从手机端回复。',
}
