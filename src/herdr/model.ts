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
}

export interface AgentWorkspaceModel {
  id: string
  label: string
  panes: AgentPaneModel[]
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
  key: string
  label: string
}
export interface BlockedPrompt {
  question: string
  allow: BlockedPromptOption
  deny: BlockedPromptOption
}

const cleanMenuLine = (line: string) =>
  line.replace(/^\s*│/, '').split('│')[0].trim()
const menuLine = /^(?:❯\s*)?(\d+)\.\s+(.*)$/

/** Mirrors Alma desktop's numbered Yes/No detector for blocked terminals. */
export function parseBlockedPrompt(text: string): BlockedPrompt | null {
  const lines = text.split(/\r?\n/).map(cleanMenuLine)
  for (let index = 0; index < lines.length; index += 1) {
    const allow = menuLine.exec(lines[index])
    if (!allow || allow[1] !== '1' || !allow[2].startsWith('Yes')) continue
    for (let denyIndex = index + 1; denyIndex < lines.length; denyIndex += 1) {
      const deny = menuLine.exec(lines[denyIndex])
      if (!deny || !deny[2].startsWith('No')) continue
      const question = [...lines.slice(0, index)]
        .reverse()
        .find((line) => line && !menuLine.test(line))
      if (!question) return null
      return {
        question: question.slice(0, 1500),
        allow: { key: allow[1], label: allow[2] },
        deny: { key: deny[1], label: deny[2] },
      }
    }
  }
  return null
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
