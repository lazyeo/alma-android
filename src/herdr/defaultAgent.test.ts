import { describe, expect, it } from 'vitest'
import { desktopDefaultAgent } from './manage'

const providers = [
  { id: 'codex-acp', type: 'acp', acpCommand: 'codex-acp', acpArgs: [] },
  {
    id: 'pi-npx',
    type: 'acp',
    acpCommand: '/usr/local/bin/npx',
    acpArgs: ['@acme/pi-acp@1.2.0'],
  },
  {
    id: 'win-claude',
    type: 'acp',
    acpCommand: 'C:\\tools\\claude-agent-acp.cmd',
  },
  { id: 'gemini-acp', type: 'acp', acpCommand: 'gemini', acpArgs: ['--acp'] },
  { id: 'anthropic', type: 'anthropic' },
]

describe('desktopDefaultAgent', () => {
  it('maps built-in choices and gaps to Claude Code like the desktop', () => {
    for (const id of [
      undefined,
      '',
      '__auto__',
      '__claude_code__',
      '__builtin__',
    ])
      expect(desktopDefaultAgent(id, providers)).toBe('claude')
    expect(desktopDefaultAgent('anthropic', providers)).toBe('claude')
    expect(desktopDefaultAgent('removed', providers)).toBe('claude')
    expect(desktopDefaultAgent('gemini-acp', providers)).toBe('claude')
  })

  it('maps ACP providers by their command', () => {
    expect(desktopDefaultAgent('codex-acp', providers)).toBe('codex')
    expect(desktopDefaultAgent('pi-npx', providers)).toBe('pi')
    expect(desktopDefaultAgent('win-claude', providers)).toBe('claude')
  })
})
