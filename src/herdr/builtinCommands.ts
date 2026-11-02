import type { HerdrCommand } from './commands'

const builtins = (
  entries: ReadonlyArray<readonly [name: string, description: string]>,
): HerdrCommand[] =>
  entries.map(([name, description]) => ({
    name,
    description,
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
    ['model', 'Choose the active model'],
    ['cost', 'Show token usage and cost'],
    ['review', 'Review the current changes'],
    ['init', 'Initialize project instructions'],
    ['memory', 'Edit project memory'],
    ['config', 'Open configuration'],
    ['doctor', 'Check the installation and configuration'],
    ['status', 'Show session and account status'],
    ['resume', 'Resume a previous conversation'],
    ['plan', 'Enter planning mode'],
    ['rename', 'Rename the current conversation'],
    ['add-dir', 'Add a working directory'],
    ['permissions', 'Manage tool permissions'],
    ['export', 'Export the conversation'],
    ['mcp', 'Manage MCP servers'],
    ['agents', 'Manage agents'],
    ['hooks', 'Manage hooks'],
    ['context', 'Show context usage'],
    ['usage', 'Show plan usage limits'],
    ['bug', 'Report a bug'],
    ['login', 'Sign in'],
    ['logout', 'Sign out'],
  ]),
  codex: builtins([
    ['models', 'Choose the active model'],
    ['skills', 'List available skills'],
    ['review', 'Review the current changes'],
    ['compact', 'Compact the conversation context'],
    ['new', 'Start a new conversation'],
    ['status', 'Show session and account status'],
    ['diff', 'Show the current changes'],
    ['mention', 'Mention a file'],
    ['init', 'Initialize project instructions'],
    ['approvals', 'Manage command approvals'],
    ['resume', 'Resume a previous conversation'],
    ['quit', 'Exit Codex'],
  ]),
  pi: [],
}
