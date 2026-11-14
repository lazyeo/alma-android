// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installed } from '@alma/extensions-installed'
import { AgentMark } from './AgentMark'

vi.mock('@alma/extensions-installed', () => ({ installed: {} }))
afterEach(() => {
  cleanup()
  delete installed.agentMarks
})

describe('AgentMark', () => {
  it('renders the Claude Code robot in its brand color', () => {
    const { container } = render(<AgentMark agent="claude" />)
    const path = container.querySelector('path')

    expect(path?.getAttribute('fill')).toBe('#D97757')
    expect(path?.getAttribute('d')).toBe(
      'M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z',
    )
  })

  it('renders the three-color pi mark', () => {
    const { container } = render(<AgentMark agent="pi" />)

    expect(
      [...container.querySelectorAll('path')].map((path) =>
        path.getAttribute('fill'),
      ),
    ).toEqual(['#F09082', '#4D9ABF', '#F1BE58'])
  })

  it('renders the Codex cloud with its brand gradient', () => {
    const { container } = render(<AgentMark agent="codex" />)
    const gradient = container.querySelector('linearGradient')
    const cloud = container.querySelector('[data-codex-cloud]')

    expect(gradient?.querySelectorAll('stop')).toHaveLength(2)
    expect(
      gradient?.querySelector('stop:first-child')?.getAttribute('stop-color'),
    ).toBe('#A78BFA')
    expect(
      gradient?.querySelector('stop:last-child')?.getAttribute('stop-color'),
    ).toBe('#3B82F6')
    expect(cloud?.getAttribute('fill')).toBe(
      `url(#${gradient?.getAttribute('id')})`,
    )
    expect(cloud?.getAttribute('d')).toBeTruthy()
    expect(container.querySelector('mask')).toBeTruthy()
    expect(container.querySelector('[data-agent-mark="fallback"]')).toBeNull()
  })

  it('renders the muted Codex cloud in current color without a gradient', () => {
    const { container } = render(<AgentMark agent="codex" muted />)

    expect(container.querySelector('linearGradient')).toBeNull()
    expect(
      container.querySelector('[data-codex-cloud]')?.getAttribute('fill'),
    ).toBe('currentColor')
    expect(container.querySelector('mask')).toBeTruthy()
  })

  it('uses the Bot fallback for unknown agents', () => {
    const { container } = render(<AgentMark agent="unknown" muted />)

    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('[data-agent-mark="fallback"]')).toBeTruthy()
    expect(container.querySelectorAll('path')).not.toHaveLength(0)
  })

  it('uses current color when muted', () => {
    const { container } = render(<AgentMark agent="claude" muted />)

    expect(container.querySelector('path')?.getAttribute('fill')).toBe(
      'currentColor',
    )
  })

  it('renders an extension mark for its kind with the box size and muted state', () => {
    installed.agentMarks = {
      agy: ({ size, muted }) => (
        <svg data-extension-mark={muted ? 'muted' : 'colored'} width={size} />
      ),
    }
    const { container, rerender } = render(<AgentMark agent="AGY" small />)
    const wrapper = container.querySelector('[data-agent-mark="agy"]')

    expect(wrapper?.className).toBe('agent-mark')
    expect(wrapper?.getAttribute('style')).toContain('width: 14px')
    expect(
      container.querySelector('[data-extension-mark]')?.getAttribute('width'),
    ).toBe('14')
    expect(
      container
        .querySelector('[data-extension-mark]')
        ?.getAttribute('data-extension-mark'),
    ).toBe('colored')
    expect(container.querySelector('[data-agent-mark="fallback"]')).toBeNull()

    rerender(<AgentMark agent="agy" muted />)
    expect(container.querySelector('[data-agent-mark="agy"]')?.className).toBe(
      'agent-mark muted',
    )
    expect(
      container.querySelector('[data-extension-mark]')?.getAttribute('width'),
    ).toBe('18')
    expect(
      container
        .querySelector('[data-extension-mark]')
        ?.getAttribute('data-extension-mark'),
    ).toBe('muted')
  })

  it('lets an extension mark take precedence over a built-in mark', () => {
    installed.agentMarks = {
      claude: () => <svg data-extension-mark="claude" />,
    }
    const { container } = render(<AgentMark agent="claude" />)

    expect(
      container.querySelector('[data-extension-mark="claude"]'),
    ).toBeTruthy()
    expect(container.querySelector('path')).toBeNull()
  })

  it('keeps the Bot fallback for kinds no extension supplies', () => {
    installed.agentMarks = { agy: () => <svg data-extension-mark="agy" /> }
    const { container } = render(<AgentMark agent="gemini" />)

    expect(container.querySelector('[data-agent-mark="gemini"]')).toBeTruthy()
    expect(container.querySelector('[data-agent-mark="fallback"]')).toBeTruthy()
    expect(container.querySelector('[data-extension-mark]')).toBeNull()
  })

  it('ignores inherited keys when looking up an extension mark', () => {
    installed.agentMarks = { agy: () => <svg data-extension-mark="agy" /> }
    const { container } = render(<AgentMark agent="constructor" />)

    expect(container.querySelector('[data-agent-mark="fallback"]')).toBeTruthy()
  })
})
