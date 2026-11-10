// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownContent } from '../screens/MarkdownContent'
import { toMessageRows, type HerdrChatItem } from '../herdr/toMessageParts'
import { MessageView, type MessageRowView } from './MessageView'

const sharedFixture: HerdrChatItem[] = [
  {
    id: 'user',
    kind: 'user',
    text: '**Edit requests**\n\n① Move the button\n\n<system-reminder>\nalma-image-edit:{"r":[{"i":1,"c":"#ef4444","l":"Move the button"}],"n":"Keep it compact."}\nApply the requests.\n</system-reminder>',
  },
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
  it('renders teammate messages as compact collapsible markdown cards', () => {
    const [row] = toMessageRows([
      {
        id: 'teammate',
        kind: 'teammate',
        from: 'reviewer',
        summary: '**Review complete**',
        text: 'The implementation is ready.\n\n- Tests pass\n- Layout checked',
      },
    ])
    const view = render(<MessageView row={row} capabilities={capabilities} />)

    const card = view.container.querySelector('.teammate-message-card')
    expect(card).toBeTruthy()
    expect(card?.textContent).toContain('Message from @reviewer')
    expect(card?.textContent).toContain('Review complete')
    expect(card?.textContent).not.toContain('Tests pass')

    fireEvent.click(view.getByRole('button', { name: 'Show full message' }))
    expect(card?.textContent).toContain('Tests pass')
    expect(card?.querySelectorAll('.markdown-content')).toHaveLength(2)
  })

  it('collapses long teammate messages without a summary', () => {
    const longText = Array.from(
      { length: 12 },
      (_, index) =>
        `Detailed review point ${index + 1} explains the implementation.`,
    ).join(' ')
    const [row] = toMessageRows([
      {
        id: 'teammate-long',
        kind: 'teammate',
        text: longText,
      },
    ])
    const view = render(<MessageView row={row} capabilities={capabilities} />)

    expect(view.container.textContent).not.toContain('Detailed review point 1')
    expect(view.getByRole('button', { name: 'Show full message' })).toBeTruthy()
  })

  it('uses the teammate fallback label and expands short messages', () => {
    const [row] = toMessageRows([
      {
        id: 'teammate-fallback',
        kind: 'teammate',
        text: 'A short teammate note.',
      },
    ])
    const view = render(<MessageView row={row} capabilities={capabilities} />)

    expect(view.container.textContent).toContain('Teammate message')
    expect(view.container.textContent).toContain('A short teammate note.')
    expect(view.queryByRole('button')).toBeNull()
  })

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
    expect(herdr.querySelector('.image-edit-card')).toBeTruthy()
    expect(herdr.textContent).not.toContain('system-reminder')
    expect(thread.querySelector('.message-actions-button')).toBeTruthy()
    expect(thread.querySelector('.version-switcher')).toBeTruthy()
    expect(thread.querySelector('.usage-footer')).toBeTruthy()
    expect(herdr.querySelector('.message-actions-button')).toBeNull()
    expect(herdr.querySelector('.version-switcher')).toBeNull()
    expect(herdr.querySelector('.usage-footer')).toBeNull()
  })
  it('renders user text without math and assistant text with it', () => {
    const renderMarkdown = vi.fn((text: string) => <p>{text}</p>)
    for (const role of ['user', 'assistant'])
      render(
        <MessageView
          row={{
            id: role,
            message: { role, parts: [{ type: 'text', text: `${role} $$x$$` }] },
          }}
          capabilities={{ renderMarkdown }}
        />,
      )
    expect(renderMarkdown).toHaveBeenCalledWith(
      'user $$x$$',
      expect.objectContaining({ math: false }),
    )
    expect(renderMarkdown).toHaveBeenCalledWith(
      'assistant $$x$$',
      expect.objectContaining({ math: true }),
    )
  })
})
