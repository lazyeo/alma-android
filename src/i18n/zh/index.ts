// Simplified Chinese catalog. Same shape as `en` (enforced by CatalogShape and
// messages.test.ts).
//
// Glossary — keep terms consistent across namespaces:
//   thread → 对话            desktop → 桌面端 (product name "Alma Desktop" stays)
//   relay → 中继             pair / pairing → 配对
//   inbox → 收件箱           approval → 审批 (allow 允许 / deny 拒绝)
//   haptics → 振动反馈       crew → Crew（不译）  fast mode → Fast（不译）
//   Aligned with desktop Alma's zh wording where the context matches.
//   question → 提问          queue / queued → 排队
//   steer → 插话             generate / reply → 生成 / 回复
//   project → 项目           workspace → 工作区
//   goal → 目标              to-do → 待办
//   in progress → 进行中     done → 已完成       archived → 已归档
//   crystal → 结晶           reference → 引用关系  time clue → 时间线索
//   context (tokens) → 上下文  compact → 压缩     model → 模型
//   attachment → 附件        file → 文件         preview → 预览
//   notification → 通知      settings → 设置     appearance → 外观
//   quote (into composer) → 引用   mention → 提及   GTD stays GTD
// Style: concise, no trailing 。on labels/buttons; full sentences end in 。;
// use full-width ，：？！ and a half-width space between Chinese and Latin/digits
// only where it reads naturally (e.g. “3 个文件”).
import { common } from './common'
import { nav } from './nav'
import { settings } from './settings'
import { connection } from './connection'
import { notifications } from './notifications'
import { handoff } from './handoff'
import { threads } from './threads'
import { gtd } from './gtd'
import { thread } from './thread'
import { message } from './message'
import { composer } from './composer'
import { library } from './library'
import { files } from './files'
import { share } from './share'
import { agents } from './agents'
import { screen } from './screen'
import type { CatalogShape } from '../core'
import type { Messages } from '../en'

export const zh: CatalogShape<Messages> = {
  common,
  nav,
  settings,
  connection,
  notifications,
  handoff,
  threads,
  gtd,
  thread,
  message,
  composer,
  library,
  files,
  share,
  agents,
  screen,
}
