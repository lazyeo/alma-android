// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { MessagePart } from '../messages'
import type { MessageRow } from '../relay'
import { PersonaMessageView } from './PersonaMessageView'
import { personaLayout } from './personaLayout'

vi.mock('../screens/LoadingOrbCanvas', () => ({
  LoadingOrb: () => <i data-testid="orb" />,
}))

afterEach(cleanup)

const capabilities = {
  renderMarkdown: (text: string) => <p>{text}</p>,
}

const message = (
  id: string,
  role: string,
  parts: MessagePart[],
  metadata?: MessageRow['metadata'],
): MessageRow => ({
  id,
  threadId: 'main',
  message: { id, role, parts },
  ...(metadata ? { metadata } : {}),
})

function renderRows(rows: MessageRow[], generatingLast = false) {
  const layout = personaLayout(rows)
  return render(
    <LanguageProvider>
      {rows.map((row, index) => (
        <PersonaMessageView
          key={row.id}
          row={row}
          layout={layout[index]}
          generating={generatingLast && index === rows.length - 1}
          mood="happy"
          capabilities={capabilities}
        />
      ))}
    </LanguageProvider>,
  )
}

describe('PersonaMessageView', () => {
  it('shows her face only on the first bubble of a run, and none for the user', () => {
    const { container } = renderRows([
      message('u1', 'user', [{ type: 'text', text: 'Morning' }]),
      message('a1', 'assistant', [{ type: 'text', text: 'Hi!' }]),
      message('a2', 'assistant', [{ type: 'text', text: 'Coffee first?' }]),
    ])
    const articles = [...container.querySelectorAll('article')]
    expect(articles.map((node) => node.className)).toEqual([
      'persona-message user first last',
      'persona-message alma first',
      'persona-message alma last',
    ])
    expect(articles[0].querySelector('.persona-avatar-slot')).toBeNull()
    expect(articles[1].querySelector('svg.alma-face')).toBeTruthy()
    expect(articles[1].querySelector('svg')?.dataset.animated).toBe('false')
    expect(articles[2].querySelector('.persona-avatar-slot')).toBeTruthy()
    expect(articles[2].querySelector('svg.alma-face')).toBeNull()
    expect(
      screen.getByText('Coffee first?').closest('.persona-bubble'),
    ).toBeTruthy()
  })

  it('collapses tool and sub-agent work into one muted line', () => {
    const { container } = renderRows([
      message('a1', 'assistant', [
        { type: 'tool-Read', state: 'output-available', toolCallId: 'r' },
        { type: 'dynamic-tool', toolName: 'Task', state: 'output-available' },
        { type: 'text', text: 'All set.' },
      ]),
    ])
    expect(container.querySelectorAll('.persona-did')).toHaveLength(1)
    expect(screen.getByText('did: Read and Task')).toBeTruthy()
    expect(container.querySelector('.tool-group, .tool-children')).toBeNull()
  })

  it('keeps reasoning behind a tap', () => {
    renderRows([
      message('a1', 'assistant', [
        { type: 'reasoning', text: 'They asked for the weather.' },
        { type: 'text', text: 'Sunny.' },
      ]),
    ])
    expect(screen.queryByText('They asked for the weather.')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Show thinking' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('They asked for the weather.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide thinking' }))
    expect(screen.queryByText('They asked for the weather.')).toBeNull()
  })

  it('shows a typing bubble while an empty reply streams, and live tool work', () => {
    const empty = renderRows([message('a1', 'assistant', [])], true)
    expect(empty.container.querySelector('.persona-bubble.typing')).toBeTruthy()
    empty.unmount()
    renderRows(
      [
        message('a1', 'assistant', [
          { type: 'tool-Bash', state: 'input-available' },
        ]),
      ],
      true,
    )
    expect(screen.getByText('did: Bash')).toBeTruthy()
    expect(screen.getByTestId('orb')).toBeTruthy()
  })

  it('keeps the delivery status for unsent user messages', () => {
    renderRows([
      message('u1', 'user', [{ type: 'text', text: 'ping' }], {
        optimisticStatus: 'failed',
      }),
    ])
    expect(screen.getByText('Not sent')).toBeTruthy()
  })
})
