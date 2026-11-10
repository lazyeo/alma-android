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
    expect(container.querySelector('.persona-did')).toBeNull()
    expect(screen.queryByText(/did:/)).toBeNull()
    expect(screen.getByText('All set.')).toBeTruthy()
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

  it('shows a typing bubble while an empty reply streams or tools run', () => {
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
    expect(screen.queryByText(/did:/)).toBeNull()
    expect(document.querySelector('.persona-bubble.typing')).toBeTruthy()
  })

  it('keeps the delivery status for unsent user messages', () => {
    renderRows([
      message('u1', 'user', [{ type: 'text', text: 'ping' }], {
        optimisticStatus: 'failed',
      }),
    ])
    expect(screen.getByText('Not sent')).toBeTruthy()
  })

  it('shows reactions under the bubble, Alma’s included, and toggles the user’s', () => {
    const row = message('u1', 'user', [{ type: 'text', text: 'ship it' }], {
      reactions: [
        { emoji: '👀', reactedAt: '', by: 'assistant' },
        { emoji: '👍', reactedAt: '' },
      ],
    })
    const onToggleReaction = vi.fn()
    const { container } = render(
      <LanguageProvider>
        <PersonaMessageView
          row={row}
          layout={personaLayout([row])[0]}
          mood="happy"
          capabilities={capabilities}
          onToggleReaction={onToggleReaction}
        />
      </LanguageProvider>,
    )
    const chips = container.querySelector('.persona-stack .message-reactions')
    expect(chips?.previousElementSibling?.className).toBe('persona-bubble')
    expect(screen.getByRole('img', { name: 'Alma reacted 👀' })).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove your 👍 reaction' }),
    )
    expect(onToggleReaction).toHaveBeenCalledWith(row, '👍')
  })

  it('gives a voice reply with no text a bubble with the player', () => {
    const row = message('voice', 'assistant', [], {
      voice: { url: '/api/gallery/cache/a.m4a', durationMs: 3000 },
    })
    const view = render(
      <PersonaMessageView
        row={row}
        layout={personaLayout([row])[0]}
        mood="happy"
        capabilities={{
          ...capabilities,
          renderVoice: (voice) => <span>player {voice.path}</span>,
        }}
      />,
    )
    const bubble = view.container.querySelector('.persona-bubble')
    expect(bubble?.textContent).toBe('player /api/gallery/cache/a.m4a')
  })

  it('shows the voice and its spoken text together', () => {
    renderRows([
      message('voice', 'user', [{ type: 'text', text: 'call mom later' }], {
        voice: { url: '/api/gallery/cache/a.m4a' },
      }),
    ])
    expect(screen.getByText("Voice message (can't be played)")).toBeTruthy()
    expect(screen.getByText('call mom later')).toBeTruthy()
  })

  it('renders the user side without math and Alma with it', () => {
    const renderMarkdown = vi.fn((text: string) => <p>{text}</p>)
    const rows = [
      message('u', 'user', [{ type: 'text', text: 'user $$x$$' }]),
      message('a', 'assistant', [{ type: 'text', text: 'alma $$x$$' }]),
    ]
    const layout = personaLayout(rows)
    render(
      <LanguageProvider>
        {rows.map((row, index) => (
          <PersonaMessageView
            key={row.id}
            row={row}
            layout={layout[index]}
            mood="happy"
            capabilities={{ renderMarkdown }}
          />
        ))}
      </LanguageProvider>,
    )
    expect(renderMarkdown).toHaveBeenCalledWith(
      'user $$x$$',
      expect.objectContaining({ math: false }),
    )
    expect(renderMarkdown).toHaveBeenCalledWith(
      'alma $$x$$',
      expect.objectContaining({ math: true }),
    )
  })
})
