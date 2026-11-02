import type { HerdrCommand } from './commands'

type BuiltinEntry = readonly [
  name: string,
  description: string,
  options?: { hint?: string; interactive?: boolean },
]

const builtins = (entries: ReadonlyArray<BuiltinEntry>): HerdrCommand[] =>
  entries.map(([name, description, options]) => ({
    name,
    description,
    ...options,
    source: 'builtin',
  }))

export const BUILTIN_HERDR_COMMANDS: Record<
  'claude' | 'codex' | 'pi',
  HerdrCommand[]
> = {
  claude: builtins([
    ['help', 'Show available commands and help'],
    ['clear', 'Clear the conversation history'],
    ['compact', 'Compact the conversation context'],
    [
      'model',
      'Choose the active model',
      { hint: '<model>', interactive: true },
    ],
    ['cost', 'Show token usage and cost'],
    ['review', 'Review the current changes'],
    ['init', 'Initialize project instructions'],
    ['memory', 'Edit project memory', { interactive: true }],
    ['config', 'Open configuration', { interactive: true }],
    ['doctor', 'Check the installation and configuration'],
    ['status', 'Show session and account status'],
    [
      'resume',
      'Resume a previous conversation',
      { hint: '<name>', interactive: true },
    ],
    ['plan', 'Enter planning mode'],
    ['rename', 'Rename the current conversation', { hint: '<name>' }],
    ['add-dir', 'Add a working directory', { hint: '<path>' }],
    ['permissions', 'Manage tool permissions', { interactive: true }],
    ['export', 'Export the conversation'],
    ['mcp', 'Manage MCP servers', { interactive: true }],
    ['agents', 'Manage agents', { interactive: true }],
    ['hooks', 'Manage hooks', { interactive: true }],
    ['context', 'Show context usage'],
    ['usage', 'Show plan usage limits'],
    ['bug', 'Report a bug'],
    ['login', 'Sign in'],
    ['logout', 'Sign out'],
  ]),
  codex: builtins([
    [
      'model',
      'Choose what model and reasoning effort to use',
      { interactive: true },
    ],
    [
      'permissions',
      'Choose what Codex is allowed to do',
      { interactive: true },
    ],
    ['review', 'Review any changes and find issues'],
    ['new', 'Start a new chat during a conversation'],
    ['resume', 'Resume a saved chat', { interactive: true }],
    ['fork', 'Fork the current chat', { interactive: true }],
    ['init', 'Create an AGENTS.md file with instructions for Codex'],
    [
      'compact',
      'Summarize the conversation to prevent hitting the context limit',
    ],
    ['diff', 'Show git diff (including untracked files)'],
    ['mention', 'Mention a file', { interactive: true }],
    ['status', 'Show current session configuration and token usage'],
    ['mcp', 'List configured MCP tools', { interactive: true }],
    ['quit', 'Exit Codex'],
  ]),
  pi: builtins([
    ['model', 'Select model', { hint: '<provider/model>', interactive: true }],
    ['thinking', 'Set thinking level', { hint: '<level>', interactive: true }],
    ['new', ''],
    ['resume', '', { interactive: true }],
    ['compact', ''],
    ['tree', 'Navigate the session tree', { interactive: true }],
    ['fork', '', { interactive: true }],
    ['clone', ''],
    ['session', 'Show session info and stats'],
    ['name', 'Set session display name'],
    ['settings', 'Open settings menu', { interactive: true }],
    ['scoped-models', '', { interactive: true }],
    ['export', '', { interactive: true }],
    ['copy', ''],
    ['reload', ''],
    ['hotkeys', '', { interactive: true }],
    ['quit', ''],
  ]),
}
