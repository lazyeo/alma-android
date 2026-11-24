// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'

vi.mock('../haptics', () => ({ haptic: vi.fn(async () => undefined) }))

type Props = ComponentProps<typeof Composer>

function renderComposer(props: Partial<Props> = {}) {
  const onSend = vi.fn()
  const all: Props = {
    value: '',
    onChange: vi.fn(),
    onSend,
    placeholder: 'Message',
    model: '',
    models: [],
    onModelChange: vi.fn(),
    effort: 'off',
    onEffortChange: vi.fn(),
    attachmentControl: <button type="button">Attach</button>,
    disabled: true,
    collapsible: true,
    ...props,
  }
  const view = render(<Composer {...all} />)
  return {
    onSend,
    rerender: (next: Partial<Props>) =>
      view.rerender(<Composer {...all} {...next} />),
  }
}

const more = () => screen.getByRole('button', { name: 'More options' })
const attach = () => screen.queryByRole('button', { name: 'Attach' })
const send = () => screen.queryByRole('button', { name: 'Send message' })
const box = () => screen.getByPlaceholderText('Message')

afterEach(cleanup)

describe('the collapsible composer', () => {
  it('starts as one capsule, its options folded away', () => {
    renderComposer()
    expect(more().getAttribute('aria-expanded')).toBe('false')
    expect(attach()).toBeNull()
    expect(document.querySelector('.composer')?.getAttribute('data-open')).toBe(
      'false',
    )
  })

  it('opens the attachment, model and effort row from the arrow', () => {
    renderComposer()
    fireEvent.click(more())
    expect(
      screen
        .getByRole('button', { name: 'Fewer options' })
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(attach()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fewer options' }))
    expect(attach()).toBeNull()
  })

  it('opens downward into the usual layout: text first, options and Send below', () => {
    renderComposer({ value: 'hi', disabled: false })
    fireEvent.click(more())
    const capsule = document.querySelector('.composer-entry')!
    const row = document.querySelector('.composer-controls')!
    expect(
      capsule.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(row.contains(send())).toBe(true)
    expect(capsule.contains(send())).toBe(false)
  })

  it('opens by itself once the box is focused for typing', () => {
    renderComposer()
    fireEvent.focus(box())
    expect(attach()).not.toBeNull()
  })

  it('shows Send only when there is something to send', () => {
    const { rerender } = renderComposer()
    expect(send()).toBeNull()
    rerender({ value: 'hi', disabled: false })
    expect(send()).not.toBeNull()
  })

  it('folds back into the capsule once a message is sent', () => {
    const { onSend } = renderComposer({ value: 'hi', disabled: false })
    fireEvent.focus(box())
    fireEvent.click(send()!)
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(attach()).toBeNull()
  })

  it('keeps its options open where it does not fold (a new thread)', () => {
    renderComposer({ collapsible: false })
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull()
    expect(attach()).not.toBeNull()
  })

  it('fills the capsule while a long press charges', () => {
    const voice = {
      textHold: {} as never,
      hint: 'Hold to talk, tap to type',
      view: null,
      charging: true,
    }
    renderComposer({ voice })
    const capsule = document.querySelector('[data-hold-area]')
    expect(capsule?.getAttribute('data-charging')).toBe('true')
    expect(
      document.querySelector('textarea')?.getAttribute('placeholder'),
    ).toBe('Hold to talk, tap to type')
  })
})
