// The term list is the biggest accuracy lever in the Phase 0 bench (it cut
// the mixed error rate to about a third), so every engine receives it.

/** Generic developer vocabulary; no personal or project-private names. */
export const DEFAULT_TERMS: readonly string[] = [
  'Alma',
  'Herdr',
  'Claude',
  'Codex',
  'OneDrive',
  'APK',
  'WebSocket',
  'npm',
  'cron',
  'main',
  'GitHub',
  'TypeScript',
  'React',
  'Android',
  'vitest',
  'commit',
  'rebase',
  'worktree',
  'PR',
  'API',
]

/** Keeps the request small; Whisper-style prompts are cut at ~224 tokens. */
export const MAX_TERMS = 100
const MAX_PROMPT_TERM_CHARS = 600

/** One term per line or comma; trimmed, de-duplicated case-insensitively. */
export function parseTerms(text: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of text.split(/[\n,，、]/)) {
    const term = raw.trim().replace(/\s+/g, ' ')
    if (!term || seen.has(term.toLowerCase())) continue
    seen.add(term.toLowerCase())
    terms.push(term)
    if (terms.length === MAX_TERMS) break
  }
  return terms
}

export function formatTerms(terms: readonly string[]): string {
  return terms.join('\n')
}

/** Prompt for OpenAI-compatible batch engines. */
export function buildTermsPrompt(terms: readonly string[]): string {
  const base = 'Mixed Chinese and English dev talk.'
  const picked: string[] = []
  let length = 0
  for (const term of terms) {
    if (length + term.length > MAX_PROMPT_TERM_CHARS) break
    picked.push(term)
    length += term.length + 2
  }
  return picked.length ? `${base} Terms: ${picked.join(', ')}.` : base
}
