// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../i18n/runtime'
import { PersonalAgentRow } from './PersonalAgentRow'

const personal = (threadId: string | null) => ({
  threadId,
  running: 2,
  pendingApprovals: 1,
  today: { spentUsd: 0.4, budgetUsd: 2, over: false },
})

afterEach(() => {
  cleanup()
  setLanguage('en')
})

describe('PersonalAgentRow', () => {
  it('renders nothing on desktops without the personal agent', () => {
    const { container } = render(
      <PersonalAgentRow state={{ status: 'unsupported' }} onOpen={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing before the first load', () => {
    const { container } = render(
      <PersonalAgentRow state={{ status: 'loading' }} onOpen={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('explains setup and is not tappable without a main thread', () => {
    render(
      <PersonalAgentRow
        state={{ status: 'ready', personal: personal(null) }}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Alma')).toBeTruthy()
    expect(
      screen.getByText(
        'Not set up — start it from Alma on your phone or desktop Settings → Personal agent',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uses the exact Chinese setup copy', () => {
    setLanguage('zh')
    render(
      <PersonalAgentRow
        state={{ status: 'ready', personal: personal(null) }}
        onOpen={vi.fn()}
      />,
    )
    expect(
      screen.getByText('未启用：在桌面 设置 → Personal agent 中开启'),
    ).toBeTruthy()
  })

  it('shows counts and opens the main thread when set', () => {
    const onOpen = vi.fn()
    render(
      <PersonalAgentRow
        state={{
          status: 'ready',
          personal: personal('thread-main'),
          vitals: { mood: 'happy' },
        }}
        onOpen={onOpen}
      />,
    )
    const row = screen.getByRole('button')
    expect(row.textContent).toContain('Alma')
    expect(row.textContent).toContain(
      'Happy, 2 running, 1 approval, $0.40 / $2.00',
    )
    expect(row.textContent).not.toContain('·')
    expect(screen.getByText('1 approval').tagName).toBe('STRONG')
    expect(row.querySelector('img')?.getAttribute('src')).toBe(
      '/alma-glasses-192.png',
    )
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith('thread-main')
  })
})
