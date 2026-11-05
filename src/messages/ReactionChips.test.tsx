// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { MessageReaction } from '../screens/messageReactions'
import { QuickReactions, ReactionChips } from './ReactionChips'

afterEach(cleanup)

const eyes: MessageReaction = { emoji: '👀', reactedAt: '', by: 'assistant' }
const thumbs: MessageReaction = { emoji: '👍', reactedAt: '', by: 'user' }

function chips(reactions: MessageReaction[], onToggle?: () => void) {
  return (
    <LanguageProvider>
      <ReactionChips reactions={reactions} onToggle={onToggle} />
    </LanguageProvider>
  )
}

describe('ReactionChips', () => {
  it('renders nothing without reactions', () => {
    const { container } = render(chips([]))
    expect(container.querySelector('.message-reactions')).toBeNull()
  })

  it('shows Alma’s reaction as a label and the user’s own as a toggle', () => {
    const onToggle = vi.fn()
    render(chips([eyes, thumbs], onToggle))
    expect(screen.getByRole('img', { name: 'Alma reacted 👀' })).toBeTruthy()
    const own = screen.getByRole('button', {
      name: 'Remove your 👍 reaction',
    })
    expect(own.className).toContain('own')
    fireEvent.click(own)
    expect(onToggle).toHaveBeenCalledWith('👍')
  })

  it('keeps own chips read-only when the desktop cannot take reactions', () => {
    render(chips([thumbs]))
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: 'You reacted 👍' })).toBeTruthy()
  })

  it('animates only chips that arrive after the row mounted', () => {
    const { container, rerender } = render(chips([eyes]))
    rerender(chips([eyes, thumbs]))
    const classes = [...container.querySelectorAll('.reaction-chip')].map(
      (node) => node.className,
    )
    expect(classes).toEqual(['reaction-chip', 'reaction-chip own entering'])
  })
})

describe('QuickReactions', () => {
  it('marks the user’s reactions pressed and toggles on tap', () => {
    const onToggle = vi.fn()
    render(
      <LanguageProvider>
        <QuickReactions reactions={[thumbs, eyes]} onToggle={onToggle} />
      </LanguageProvider>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([
      '👍',
      '❤️',
      '😂',
      '👀',
      '🎉',
      '🙏',
    ])
    // Alma's 👀 is hers, not the user's: it stays unpressed.
    expect(
      buttons.map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['true', 'false', 'false', 'false', 'false', 'false'])
    fireEvent.click(screen.getByRole('button', { name: 'React with 🎉' }))
    expect(onToggle).toHaveBeenCalledWith('🎉')
  })
})
