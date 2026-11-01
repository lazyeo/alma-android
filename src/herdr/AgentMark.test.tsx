// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentMark } from './AgentMark'

afterEach(cleanup)

describe('AgentMark', () => {
  it('renders the Claude starburst in its brand color', () => {
    const { container } = render(<AgentMark agent="claude" />)
    const path = container.querySelector('path')

    expect(path?.getAttribute('fill')).toBe('#D97757')
    expect(path?.getAttribute('d')).toMatch(/^M4\.709 15\.955l/)
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
