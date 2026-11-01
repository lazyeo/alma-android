import { stripAnsi } from './transcript'

export interface AgentStatusLine {
  text: string
  elapsedMs?: number
  live: boolean
}

const statusLinePattern =
  /^\s*[✻✶✽✢\u00b7•⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+(.+?)(?:…|\.\.\.)?\s+\((?:(\d+)m\s*)?(\d+)s(?:\s*[\u00b7|].*)?\)\s*$/

/** Extracts Claude Code's transient status line from the visible screen tail. */
export function agentStatusLine(screenText: string): AgentStatusLine {
  const lines = stripAnsi(screenText).split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = statusLinePattern.exec(lines[index])
    if (!match) continue
    const minutes = Number(match[2] ?? 0)
    const seconds = Number(match[3])
    return {
      text: match[1].trim().replace(/(?:…|\.\.\.)$/, ''),
      elapsedMs: (minutes * 60 + seconds) * 1_000,
      live: true,
    }
  }
  return { text: '', live: false }
}
