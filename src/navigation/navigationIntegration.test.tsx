// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { parentRoute } from './parentRoute'

function NavigationHarness() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">
        {location.pathname}|{location.key}|{window.history.length}
      </output>
      <NavLink to="/d/desk/agents/pane" replace>
        Herdr pane
      </NavLink>
      <button
        onClick={() => {
          const parent = parentRoute(location.pathname, 'split')
          if (parent) navigate(parent, { replace: true })
        }}
      >
        Back
      </button>
    </>
  )
}

describe('hierarchical navigation integration', () => {
  it('replaces a tab switch and returns a split Herdr pane to Chat root', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/d/desk/threads/previous-thread',
          '/d/desk/gtd',
        ]}
        initialIndex={1}
      >
        <NavigationHarness />
      </MemoryRouter>,
    )
    const before = screen.getByTestId('location').textContent
    const beforeLength = Number(before?.split('|')[2])

    fireEvent.click(screen.getByRole('link', { name: 'Herdr pane' }))
    expect(screen.getByTestId('location').textContent).toContain(
      '/d/desk/agents/pane|',
    )
    expect(Number(screen.getByTestId('location').textContent?.split('|')[2])).toBe(
      beforeLength,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('location').textContent).toContain(
      '/d/desk/threads|',
    )
    expect(screen.getByTestId('location').textContent).not.toContain(
      'previous-thread',
    )
  })
})
