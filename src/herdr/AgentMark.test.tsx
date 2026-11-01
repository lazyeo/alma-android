// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentMark } from './AgentMark'

afterEach(cleanup)

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

  it.each(['codex', 'unknown'])(
    'uses a monochrome fallback for %s',
    (agent) => {
      const { container } = render(<AgentMark agent={agent} muted />)

      expect(container.querySelector('svg')).toBeTruthy()
      expect(
        container.querySelector('[data-agent-mark="fallback"]'),
      ).toBeTruthy()
      expect(container.querySelectorAll('path')).not.toHaveLength(0)
    },
  )

  it('uses current color when muted', () => {
    const { container } = render(<AgentMark agent="claude" muted />)

    expect(container.querySelector('path')?.getAttribute('fill')).toBe(
      'currentColor',
    )
  })
})
