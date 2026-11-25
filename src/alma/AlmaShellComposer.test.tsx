// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlmaShell } from './AlmaShell'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

beforeEach(() => {
  // A phone: the single-pane layout.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})
afterEach(cleanup)

// The stand-in draws the thread composer at rest, folded. Its arrow points
// the way the real composer's does: down while folded, turned up by the
// shared rule only once a composer is open.
describe('AlmaShell composer arrow', () => {
  it('points down while folded, as the real composer does', () => {
    render(
      <MemoryRouter>
        <AlmaShell desktopId="d1" backPath="/" />
      </MemoryRouter>,
    )
    const composer = document.querySelector('.composer')
    expect(composer?.getAttribute('data-open')).toBe('false')
    const more = document.querySelector('.composer-more')
    expect(more?.querySelector('.lucide-chevron-down')).not.toBeNull()
    expect(more?.querySelector('.lucide-chevron-up')).toBeNull()
    // Not marked open, so the turn-up rule below leaves it pointing down.
    expect(more?.getAttribute('aria-expanded')).not.toBe('true')
  })

  it('turns the arrow up only when the composer is open', () => {
    expect(styles).toMatch(
      /\.composer-more\[aria-expanded='true'\] svg \{[^}]*transform: rotate\(180deg\);/s,
    )
    expect(styles).not.toMatch(/\.composer-more svg \{[^}]*transform: rotate/s)
  })
})
