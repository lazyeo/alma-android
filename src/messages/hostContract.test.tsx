// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownContent } from '../screens/MarkdownContent'
import { toMessageRows, type HerdrChatItem } from '../herdr/toMessageParts'
import { MessageView, type MessageRowView } from './MessageView'

const sharedFixture: HerdrChatItem[] = [
  { id: 'user', kind: 'user', text: 'Run the checks.' },
  { id: 'assistant', kind: 'assistant', text: '**Checks complete.**' },
  {
    id: 'success',
    kind: 'tool',
    tool: {
      name: 'Bash',
      input: { command: 'npm test' },
      result: 'passed',
      done: true,
    },
  },
  {
    id: 'error',
    kind: 'tool',
    tool: {
      name: 'Read',
      input: { file_path: '/missing.ts' },
      result: 'not found',
      is_error: true,
    },
  },
  {
    id: 'unknown',
    kind: 'tool',
    tool: {
      name: 'custom_lookup',
      input: { key: 'alpha' },
      result: { value: 42 },
      done: true,
    },
  },
]

const capabilities = {
  renderMarkdown: (text: string) => <MarkdownContent text={text} />,
}

function SharedFixtureHost({ host }: { host: 'thread' | 'herdr' }) {
  const rows = toMessageRows(sharedFixture)
  return (
    <section data-host={host}>
      {rows.map((row, index) => {
        const threadRow: MessageRowView =
          host === 'thread' && index === 1
            ? {
                ...row,
                metadata: { versionIndex: 0, versionCount: 2 },
              }
            : row
        return (
          <MessageView
            key={row.id}
            row={threadRow}
            capabilities={capabilities}
            usage={
              host === 'thread' && index === 1 ? { tokens: 10 } : undefined
            }
            renderUsage={
              host === 'thread'
                ? () => <span className="usage-footer">10 tokens</span>
                : undefined
            }
            onActions={host === 'thread' ? () => undefined : undefined}
            onSwitchVersion={host === 'thread' ? () => undefined : undefined}
          />
        )
      })}
    </section>
  )
}

function sharedClassStructure(host: Element) {
  return Array.from(host.querySelectorAll('.message')).map((message) => ({
    message: message.className,
    markdown: Array.from(message.querySelectorAll('.markdown-content')).map(
      (node) => node.className,
    ),
    tools: Array.from(message.querySelectorAll('.tool-card')).map((tool) => ({
      card: tool.className,
      summary: tool.querySelector('.tool-summary')?.className,
      input: tool.querySelector('.tool-input')?.className,
    })),
  }))
}

afterEach(cleanup)

describe('shared message host contract', () => {
  it('keeps shared DOM classes identical and omits thread controls in Herdr', () => {
    const view = render(
      <>
        <SharedFixtureHost host="thread" />
        <SharedFixtureHost host="herdr" />
      </>,
    )
    const thread = view.container.querySelector('[data-host="thread"]')!
    const herdr = view.container.querySelector('[data-host="herdr"]')!

    expect(sharedClassStructure(herdr)).toEqual(sharedClassStructure(thread))
    expect(herdr.querySelectorAll('.message')).toHaveLength(2)
    expect(herdr.querySelectorAll('.tool-card')).toHaveLength(3)
    expect(herdr.querySelector('.tool-card.error')).toBeTruthy()
    expect(herdr.textContent).toContain('custom_lookup')
    expect(thread.querySelector('.message-actions-button')).toBeTruthy()
    expect(thread.querySelector('.version-switcher')).toBeTruthy()
    expect(thread.querySelector('.usage-footer')).toBeTruthy()
    expect(herdr.querySelector('.message-actions-button')).toBeNull()
    expect(herdr.querySelector('.version-switcher')).toBeNull()
    expect(herdr.querySelector('.usage-footer')).toBeNull()
  })
})
