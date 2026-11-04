// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { playDetachedExit } from './detachedExit'
import { OVERLAY_EXIT_FALLBACK_MS } from './useAnimatedOverlay'

const flush = () => act(() => Promise.resolve())
const ghosts = () => document.querySelectorAll('.sheet-backdrop.closing')

function surface() {
  const parent = document.createElement('div')
  const node = document.createElement('div')
  node.className = 'sheet-backdrop'
  const input = document.createElement('input')
  input.value = 'typed'
  node.append(input)
  parent.append(node)
  document.body.append(parent)
  return { parent, node }
}

beforeEach(() => {
  // jsdom loads no stylesheet; give the backdrop its entrance keyframes.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element) =>
      ({
        animationName: element.classList.contains('sheet-backdrop')
          ? 'overlay-backdrop-in'
          : 'none',
      }) as CSSStyleDeclaration,
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-nav-motion')
})

describe('playDetachedExit', () => {
  it('plays an inert copy of the last frame where the surface was', async () => {
    const { parent, node } = surface()
    playDetachedExit(node, { fallbackMs: 300 })
    node.remove()
    await flush()
    const ghost = parent.querySelector<HTMLElement>('.sheet-backdrop')!
    expect(ghost.classList.contains('closing')).toBe(true)
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(ghost.hasAttribute('inert')).toBe(true)
    expect(ghost.querySelector('input')!.value).toBe('typed')
    ghost
      .querySelector('input')!
      .dispatchEvent(new Event('animationend', { bubbles: true }))
    expect(ghost.isConnected).toBe(true)
    ghost.dispatchEvent(new Event('animationend'))
    expect(ghost.isConnected).toBe(false)
  })

  it('removes the copy after the fallback if no animation ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { parent, node } = surface()
    playDetachedExit(node, { fallbackMs: 300 })
    node.remove()
    await flush()
    expect(parent.children).toHaveLength(1)
    vi.advanceTimersByTime(300)
    expect(parent.children).toHaveLength(0)
  })

  it('does nothing when the surface stays attached (a StrictMode replay)', async () => {
    const { parent, node } = surface()
    playDetachedExit(node, { fallbackMs: 300 })
    await flush()
    expect(parent.children).toHaveLength(1)
    expect(node.classList.contains('closing')).toBe(false)
  })

  it('leaves the frame to a route transition', async () => {
    document.documentElement.dataset.navMotion = 'push'
    const { parent, node } = surface()
    playDetachedExit(node, { fallbackMs: 300 })
    node.remove()
    await flush()
    expect(parent.children).toHaveLength(0)
  })

  it('skips surfaces without motion', async () => {
    vi.mocked(window.getComputedStyle).mockImplementation(
      () => ({ animationName: 'none' }) as CSSStyleDeclaration,
    )
    const { parent, node } = surface()
    playDetachedExit(node, { fallbackMs: 300 })
    node.remove()
    await flush()
    expect(parent.children).toHaveLength(0)
  })
})

function Picker() {
  const [open, setOpen] = useState(true)
  return open ? (
    <BottomSheet title="Model" onClose={() => setOpen(false)}>
      <button onClick={() => setOpen(false)}>Pick</button>
    </BottomSheet>
  ) : null
}

describe('BottomSheet exits', () => {
  it('plays its exit when the owner unmounts it from a picked row', async () => {
    render(
      <StrictMode>
        <Picker />
      </StrictMode>,
    )
    await flush()
    // The StrictMode effect replay on mount plays nothing.
    expect(ghosts()).toHaveLength(0)
    fireEvent.click(screen.getByText('Pick'))
    await flush()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(ghosts()).toHaveLength(1)
  })

  it('does not play a second exit after closing itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<Picker />)
    fireEvent.click(screen.getByLabelText('Close'))
    // jsdom fires no animationend; the fallback finishes the close.
    await act(async () => {
      vi.advanceTimersByTime(OVERLAY_EXIT_FALLBACK_MS)
    })
    await flush()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelectorAll('.sheet-backdrop')).toHaveLength(0)
  })
})
