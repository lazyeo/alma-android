export type HerdrAgentStatus =
  'working' | 'blocked' | 'done' | 'idle' | 'unknown' | string

export interface HerdrWorkspace {
  workspace_id: string
  label?: string
  [key: string]: unknown
}

export interface HerdrTab {
  tab_id: string
  workspace_id: string
  label?: string
  [key: string]: unknown
}

export interface HerdrPane {
  pane_id: string
  workspace_id: string
  tab_id?: string
  agent?: string | null
  agent_status?: HerdrAgentStatus
  agent_session?: unknown
  terminal_title_stripped?: string
  title?: string
  [key: string]: unknown
}

export interface HerdrSnapshot {
  version?: string
  protocol?: number
  workspaces?: HerdrWorkspace[]
  tabs?: HerdrTab[]
  panes?: HerdrPane[]
  [key: string]: unknown
}

export interface AgentPaneModel {
  id: string
  workspaceId: string
  tabId?: string
  agent: string
  status: HerdrAgentStatus
  title: string
  lastChangedAt?: number
}

export interface AgentWorkspaceModel {
  id: string
  label: string
  panes: AgentPaneModel[]
}

const paneLastChangedAt = (pane: HerdrPane) => {
  for (const key of [
    'last_changed_at',
    'last_change_at',
    'updated_at',
    'changed_at',
  ]) {
    const value = pane[key]
    if (typeof value === 'number' && Number.isFinite(value))
      return value < 10_000_000_000 ? value * 1_000 : value
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

const statusRank = (status: HerdrAgentStatus) => {
  if (status === 'blocked') return 0
  if (status === 'working') return 1
  if (status === 'done') return 2
  if (status === 'idle') return 3
  return 4
}

export function agentListFromSnapshot(
  snapshot: HerdrSnapshot | null | undefined,
): AgentWorkspaceModel[] {
  const workspaces = new Map(
    (snapshot?.workspaces ?? []).map((workspace) => [
      workspace.workspace_id,
      workspace.label?.trim() || workspace.workspace_id,
    ]),
  )
  const tabs = new Map(
    (snapshot?.tabs ?? []).map((tab) => [tab.tab_id, tab.label?.trim() || '']),
  )
  const grouped = new Map<string, AgentPaneModel[]>()
  for (const pane of snapshot?.panes ?? []) {
    if (!pane.agent) continue
    const panes = grouped.get(pane.workspace_id) ?? []
    panes.push({
      id: pane.pane_id,
      workspaceId: pane.workspace_id,
      tabId: pane.tab_id,
      agent: pane.agent,
      status: pane.agent_status ?? 'unknown',
      title:
        pane.terminal_title_stripped?.trim() ||
        pane.title?.trim() ||
        (pane.tab_id ? tabs.get(pane.tab_id) : '') ||
        pane.agent,
      lastChangedAt: paneLastChangedAt(pane),
    })
    grouped.set(pane.workspace_id, panes)
  }
  return [...grouped].map(([id, panes]) => ({
    id,
    label: workspaces.get(id) ?? id,
    panes: panes.sort((a, b) => statusRank(a.status) - statusRank(b.status)),
  }))
}

export interface HerdrChatItem {
  id: string
  kind: string
  [key: string]: unknown
}

export function mergeChatItems<T extends HerdrChatItem>(
  current: T[],
  incoming: T[],
  direction: 'append' | 'prepend',
) {
  const ordered =
    direction === 'prepend'
      ? [...incoming, ...current]
      : [...current, ...incoming]
  const latest = new Map(incoming.map((item) => [item.id, item]))
  const seen = new Set<string>()
  return ordered.flatMap((item) => {
    if (seen.has(item.id)) return []
    seen.add(item.id)
    return [latest.get(item.id) ?? item]
  })
}

export interface BlockedPromptOption {
  number: number
  label: string
}
export interface BlockedPrompt {
  question: string
  options: BlockedPromptOption[]
  selectedIndex?: number
  /** Compatibility fields for older callers. */
  allow?: { key: string; label: string }
  deny?: { key: string; label: string }
}

const cursorMarkers = '[❯>›▶→]'
const menuLine = new RegExp(`^\\s*(${cursorMarkers})?\\s*(\\d+)\\.\\s+(.*)$`)
const cleanMenuLine = (line: string) =>
  line.replace(/^\s*│\s?/, '').replace(/\s*│\s*$/, '')

/** Parses the visible tail of a numbered cursor menu without exceeding 1.5KB. */
export function parseBlockedPrompt(text: string): BlockedPrompt | null {
  const tail = text.slice(-1500)
  const lines = tail.split(/\r?\n/).map(cleanMenuLine)
  const options: BlockedPromptOption[] = []
  let selectedIndex: number | undefined
  let firstOptionLine = -1

  for (let index = 0; index < lines.length; index += 1) {
    const match = menuLine.exec(lines[index])
    if (match) {
      if (firstOptionLine < 0) firstOptionLine = index
      options.push({ number: Number(match[2]), label: match[3].trim() })
      if (match[1]) selectedIndex = options.length - 1
      continue
    }
    if (options.length && lines[index].trim()) {
      options[options.length - 1].label += ` ${lines[index].trim()}`
    }
  }

  if (options.length < 2 || firstOptionLine < 1) return null
  const question = [...lines.slice(0, firstOptionLine)]
    .reverse()
    .find((line) => line.trim())
    ?.trim()
  if (!question) return null
  const allow = options.find((option) => option.label.startsWith('Yes'))
  const deny = [...options]
    .reverse()
    .find((option) => option.label.startsWith('No'))
  return {
    question,
    options,
    selectedIndex,
    ...(allow
      ? { allow: { key: String(allow.number), label: allow.label } }
      : {}),
    ...(deny ? { deny: { key: String(deny.number), label: deny.label } } : {}),
  }
}

export function shouldNotifyAgentStatus(input: {
  workspaceId: string
  from?: HerdrAgentStatus
  to?: HerdrAgentStatus
  muted: boolean
  viewingPane: boolean
}) {
  if (input.muted || input.viewingPane) return false
  return (
    input.to === 'blocked' || (input.from === 'working' && input.to === 'done')
  )
}
