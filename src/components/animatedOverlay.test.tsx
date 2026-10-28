// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeTopOverlay,
  overlayCount,
  resetOverlayStackForTests,
} from '../overlayStack'
import { AnchoredMenu } from './AnchoredMenu'
import { BottomSheet } from './BottomSheet'
import { useAnimatedOverlay } from './useAnimatedOverlay'

function SheetHarness({
  onClosed = () => undefined,
}: {
  onClosed?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open sheet</button>
      {open ? (
        <BottomSheet
          title="Test sheet"
          onClose={() => {
            setOpen(false)
            onClosed()
          }}
        >
          Sheet content
        </BottomSheet>
      ) : null}
    </>
  )
}

function EditorHarness({
  onClosed = () => undefined,
}: {
  onClosed?: () => void
}) {
  const [open, setOpen] = useState(false)
  const overlay = useAnimatedOverlay(open, () => {
    setOpen(false)
    onClosed()
  })
  return (
    <>
      <button onClick={() => setOpen(true)}>Open editor</button>
      {overlay.rendered ? (
        <div
          role="dialog"
          aria-label="Message editor"
          className={overlay.closing ? 'closing' : ''}
          onAnimationEnd={overlay.finishClose}
        >
          <button onClick={overlay.requestClose}>Minimize editor</button>
        </div>
      ) : null}
    </>
  )
}

function MenuHarness({
  onClosed = () => undefined,
}: {
  onClosed?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <AnchoredMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onClosed()
      }}
      trigger={<button>Open menu</button>}
      label="Test menu"
      items={[{ key: 'one', label: 'One', onSelect: () => undefined }]}
    />
  )
}

beforeEach(resetOverlayStackForTests)

afterEach(() => {
  cleanup()
  resetOverlayStackForTests()
  vi.useRealTimers()
})

describe('animated overlays', () => {
  it('unwinds an editor overlay after its reverse animation so the next back press is free', () => {
    vi.useFakeTimers()
    const onClosed = vi.fn()
    render(<EditorHarness onClosed={onClosed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }))
    expect(overlayCount()).toBe(1)

    act(() => expect(closeTopOverlay()).toBe(true))
    const dialog = screen.getByRole('dialog', { name: 'Message editor' })
    expect(dialog.classList.contains('closing')).toBe(true)
    expect(overlayCount()).toBe(1)

    fireEvent.animationEnd(dialog)
    act(() => vi.advanceTimersByTime(320))
    expect(onClosed).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Message editor' })).toBeNull()
    expect(overlayCount()).toBe(0)
    expect(closeTopOverlay()).toBe(false)
  })

  it('mounts a bottom sheet on open and retains it through the exit animation', () => {
    vi.useFakeTimers()
    const onClosed = vi.fn()
    render(<SheetHarness onClosed={onClosed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
    const dialog = screen.getByRole('dialog', { name: 'Test sheet' })
    const backdrop = dialog.parentElement!
    expect(backdrop.classList.contains('closing')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog', { name: 'Test sheet' })).toBeTruthy()
    expect(backdrop.classList.contains('closing')).toBe(true)

    fireEvent.animationEnd(dialog)
    expect(screen.getByRole('dialog', { name: 'Test sheet' })).toBeTruthy()
    expect(onClosed).not.toHaveBeenCalled()

    vi.useFakeTimers()
    act(() => vi.advanceTimersByTime(320))
    expect(onClosed).toHaveBeenCalledOnce()
  })

  it('mounts and positions an anchored menu, then retains it until its own closing animation ends', () => {
    vi.useFakeTimers()
    const onClosed = vi.fn()
    render(<MenuHarness onClosed={onClosed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getByRole('menu', {
      name: 'Test menu',
      hidden: true,
    })
    const backdrop = menu.parentElement!
    expect(menu.style.visibility).toBe('visible')

    fireEvent.pointerDown(backdrop)
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy()
    expect(backdrop.classList.contains('closing')).toBe(true)

    fireEvent.animationEnd(menu)
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy()
    expect(onClosed).not.toHaveBeenCalled()

    vi.useFakeTimers()
    act(() => vi.advanceTimersByTime(320))
    expect(onClosed).toHaveBeenCalledOnce()
  })
})
