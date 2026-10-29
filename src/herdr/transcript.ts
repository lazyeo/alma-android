// Parsing helpers for Herdr pane transcripts and terminal screens. Item shapes
// come from the desktop bridge (/api/herdr/chat), which normalizes Claude Code
// and Codex sessions into {kind, text} and {kind:'tool', tool:{name, input,
// result, is_error}} items. Pure functions so they can be unit tested.

import { TERMINAL_COLORS } from '../terminal/terminal'

export { TERMINAL_COLORS }

export interface AnsiStyle {
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  fg?: string
  bg?: string
}
export interface AnsiSegment {
  text: string
  style: AnsiStyle
}

// xterm default 16-colour palette, readable on the fixed dark terminal surface.
const BASE_COLORS = [
  '#1e1f24',
  '#e06c75',
  '#98c379',
  '#e5c07b',
  '#61afef',
  '#c678dd',
  '#56b6c2',
  '#c8ccd4',
  '#5c6370',
  '#ef8891',
  '#b5e09b',
  '#f2d49b',
  '#8cc8ff',
  '#dda5ef',
  '#7fd4de',
  '#ffffff',
]

function color256(n: number) {
  if (n < 16) return BASE_COLORS[n]
  if (n < 232) {
    const i = n - 16
    const step = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return rgb(
      step(Math.floor(i / 36)),
      step(Math.floor(i / 6) % 6),
      step(i % 6),
    )
  }
  const g = 8 + (n - 232) * 10
  return rgb(g, g, g)
}
const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`

function applySgr(style: AnsiStyle, params: number[]) {
  const next = { ...style }
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    if (p === 0) {
      for (const key of Object.keys(next)) delete next[key as keyof AnsiStyle]
    } else if (p === 1) next.bold = true
    else if (p === 2) next.dim = true
    else if (p === 3) next.italic = true
    else if (p === 4) next.underline = true
    else if (p === 7) next.inverse = true
    else if (p === 22) {
      delete next.bold
      delete next.dim
    } else if (p === 23) delete next.italic
    else if (p === 24) delete next.underline
    else if (p === 27) delete next.inverse
    else if (p >= 30 && p <= 37) next.fg = BASE_COLORS[p - 30]
    else if (p >= 90 && p <= 97) next.fg = BASE_COLORS[p - 90 + 8]
    else if (p >= 40 && p <= 47) next.bg = BASE_COLORS[p - 40]
    else if (p >= 100 && p <= 107) next.bg = BASE_COLORS[p - 100 + 8]
    else if (p === 39) delete next.fg
    else if (p === 49) delete next.bg
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'fg' : 'bg'
      if (params[i + 1] === 5 && params[i + 2] !== undefined) {
        next[key] = color256(params[i + 2])
        i += 2
      } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
        next[key] = rgb(params[i + 2], params[i + 3], params[i + 4])
        i += 4
      }
    }
  }
  return next
}

// CSI (ESC [ … final), OSC (ESC ] … BEL/ST) and two-byte escapes.
const ESCAPE =
  // eslint-disable-next-line no-control-regex
  /\u001b(?:\[([0-9;:?]*)([@-~])|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  let style: AnsiStyle = {}
  let last = 0
  const push = (text: string) => {
    if (!text) return
    const prev = segments.at(-1)
    if (prev && sameStyle(prev.style, style)) prev.text += text
    else segments.push({ text, style })
  }
  for (const match of input.matchAll(ESCAPE)) {
    push(input.slice(last, match.index))
    last = match.index + match[0].length
    if (match[2] === 'm') {
      const params = (match[1] || '0')
        .split(/[;:]/)
        .map((value) => (value === '' ? 0 : Number(value)))
      style = applySgr(style, params)
    }
  }
  push(input.slice(last))
  return segments
}

function sameStyle(a: AnsiStyle, b: AnsiStyle) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys)
    if (a[key as keyof AnsiStyle] !== b[key as keyof AnsiStyle]) return false
  return true
}

export function stripAnsi(input: string) {
  return input.replace(ESCAPE, '')
}

// Codex appends memory provenance blocks to replies; they are metadata.
const CITATION = /<oai-mem-citation>[\s\S]*?(?:<\/oai-mem-citation>|$)/g

export function cleanAgentText(text: string) {
  return text.replace(CITATION, '').replace(/\s+$/, '')
}

export interface AgentQuestion {
  question: string
  options: Array<{ label: string; description?: string }>
}
export interface ToolView {
  name: string
  detail?: string
  result?: string
  error?: boolean
  questions?: AgentQuestion[]
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

function questionsOf(input: Record<string, unknown>): AgentQuestion[] {
  const raw = Array.isArray(input.questions) ? input.questions : []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const q = entry as Record<string, unknown>
    const question =
      str(q.question) ?? str(q.title) ?? str(q.header) ?? str(q.prompt) ?? ''
    const options = (Array.isArray(q.options) ? q.options : []).flatMap(
      (option) => {
        if (typeof option === 'string') return [{ label: option }]
        if (option && typeof option === 'object') {
          const o = option as Record<string, unknown>
          const label = str(o.label) ?? str(o.title) ?? str(o.value)
          return label ? [{ label, description: str(o.description) }] : []
        }
        return []
      },
    )
    return question || options.length ? [{ question, options }] : []
  })
}

function execCommand(input: string) {
  const cmd = /\bcmd\s*:\s*("(?:[^"\\]|\\.)*")/.exec(input)
  if (cmd) {
    try {
      return JSON.parse(cmd[1]) as string
    } catch {
      return cmd[1].slice(1, -1)
    }
  }
  return input.trim().split('\n')[0]
}

const firstLine = (value: string | undefined, max = 160) => {
  if (!value) return undefined
  const line = value.trim().split('\n')[0]
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export function toolView(tool: {
  name?: string
  summary?: string
  input?: unknown
  result?: unknown
  is_error?: boolean
}): ToolView {
  const name = tool.name || 'tool'
  const input =
    tool.input && typeof tool.input === 'object'
      ? (tool.input as Record<string, unknown>)
      : {}
  const result =
    typeof tool.result === 'string'
      ? tool.result
      : tool.result == null
        ? undefined
        : JSON.stringify(tool.result, null, 2)
  const view: ToolView = { name, result, error: tool.is_error === true }
  const questions = questionsOf(input)
  if (questions.length) {
    view.questions = questions
    return view
  }
  view.detail = firstLine(
    tool.summary ??
      str(input.command) ??
      str(input.file_path) ??
      (str(input.input) ? execCommand(str(input.input)!) : undefined) ??
      str(input.description) ??
      str(input.message) ??
      str(input.target) ??
      str(input.pattern) ??
      str(input.url),
  )
  return view
}
