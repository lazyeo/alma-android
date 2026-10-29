// English is the source catalog: its shape defines every key, and its
// placeholders and plural forms define each key's typed parameters.
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
import type { KeyOf } from '../core'

export const en = {
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
} as const

export type Messages = typeof en
export type MessageKey = KeyOf<Messages>
