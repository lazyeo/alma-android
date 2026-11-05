// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DUR_FAST_MS, FADE_EXIT_MS } from '../motionTokens'
import { AnchoredMenu, anchorBesideLift, pointAnchor } from './AnchoredMenu'
import { BottomSheet } from './BottomSheet'
import {
  armLongPressLift,
  buildLongPressLift,
  mountLongPressLift,
  placeLongPressPreview,
  PREVIEW_HINT_PX,
  takeLongPressLiftSource,
} from './longPressLift'
import { isPointerContextMenu, useLongPress } from './useLongPress'

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

function MenuHarness({ onDelete = () => undefined }) {
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const press = useLongPress((point) => setMenu(point))
  return (
    <div className="thread-list" data-density="compact">
      <div data-testid="row" id="row-1" className="thread-row" {...press}>
        <span>Thread title</span>
      </div>
      <AnchoredMenu
        open={Boolean(menu)}
        onOpenChange={(open) => !open && setMenu(undefined)}
        anchorRect={menu ? pointAnchor(menu.x, menu.y) : undefined}
        label="Thread actions"
        items={[
          { key: 'rename', label: 'Rename', onSelect: () => undefined },
          {
            key: 'delete',
            label: 'Delete',
            destructive: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}

function SheetHarness() {
  const [open, setOpen] = useState(false)
  const press = useLongPress(() => setOpen(true))
  return (
    <>
      <div data-testid="row" {...press}>
        Message body
      </div>
      {open ? (
        <BottomSheet title="Message actions" onClose={() => setOpen(false)}>
          <button onClick={() => setOpen(false)}>Copy</button>
        </BottomSheet>
      ) : null}
    </>
  )
}

function longPress(row: HTMLElement) {
  fireEvent.pointerDown(row, { button: 0, clientX: 40, clientY: 20 })
  act(() => {
    vi.advanceTimersByTime(500)
  })
}

/** Releases run in a microtask after the overlay's cleanup. */
const flush = () => act(async () => undefined)

const layer = () =>
  document.querySelector<HTMLElement>('.long-press-lift-layer')

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  vi.useFakeTimers()
  mockReducedMotion(false)
})

afterEach(async () => {
  cleanup()
  await Promise.resolve()
  vi.useRealTimers()
  takeLongPressLiftSource()
  document
    .querySelectorAll('.long-press-lift-layer')
    .forEach((node) => node.remove())
})

describe('long-press lift with an anchored menu', () => {
  it('lifts a copy above the backdrop and below the menu, hiding the row', () => {
    render(<MenuHarness />)
    const row = screen.getByTestId('row')
    longPress(row)

    const backdrop = document.querySelector('.anchored-menu-backdrop')!
    const lift = layer()!
    expect(lift.parentElement).toBe(backdrop)
    expect(backdrop.firstElementChild).toBe(lift)
    expect(lift.nextElementSibling).toBe(screen.getByRole('menu'))
    expect(lift.dataset.state).toBe('lifted')
    expect(lift.getAttribute('aria-hidden')).toBe('true')
    expect(lift.hasAttribute('inert')).toBe(true)
    expect(lift.querySelector('.long-press-lift-scrim')).not.toBeNull()
    const clone = lift.querySelector<HTMLElement>('.long-press-lift-clone')!
    expect(clone.textContent).toBe('Thread title')
    expect(clone.id).toBe('')
    expect(clone.dataset.testid).toBeUndefined()
    // Ancestor classes are reproduced without their boxes.
    const wrapper = clone.parentElement!
    expect(wrapper.className).toBe('thread-list')
    expect(wrapper.dataset.density).toBe('compact')
    expect(wrapper.style.display).toBe('contents')
    expect(row.style.visibility).toBe('hidden')
  })

  it('settles on close, then removes the copy and shows the row together', async () => {
    render(<MenuHarness />)
    const row = screen.getByTestId('row')
    longPress(row)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(layer()!.dataset.state).toBe('settling')
    expect(row.style.visibility).toBe('hidden')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    await flush()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(layer()).toBeNull()
    expect(row.style.visibility).toBe('')
  })

  it('fades the copy and shows the row at once when the action removes it', async () => {
    const onDelete = vi.fn()
    render(<MenuHarness onDelete={onDelete} />)
    const row = screen.getByTestId('row')
    longPress(row)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalled()
    expect(layer()!.dataset.state).toBe('fading')
    expect(row.style.visibility).toBe('')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    await flush()
    expect(layer()).toBeNull()
  })

  it('keeps the lift through a StrictMode effect remount', async () => {
    render(
      <StrictMode>
        <MenuHarness />
      </StrictMode>,
    )
    const row = screen.getByTestId('row')
    longPress(row)
    await flush()
    expect(document.querySelectorAll('.long-press-lift-layer')).toHaveLength(1)
    expect(layer()!.parentElement?.className).toContain(
      'anchored-menu-backdrop',
    )
    expect(layer()!.dataset.state).toBe('lifted')
    expect(row.style.visibility).toBe('hidden')
  })

  it('keeps the highlight but not the scale under reduced motion', () => {
    mockReducedMotion(true)
    render(<MenuHarness />)
    longPress(screen.getByTestId('row'))
    expect(layer()!.dataset.reduced).toBe('true')
    expect(css).toMatch(
      /\.long-press-lift-layer\[data-reduced='true'\] \.long-press-lift \{\s*transform: none;/,
    )
  })

  it('lifts for a touch context menu but not for a keyboard one', async () => {
    render(<MenuHarness />)
    const row = screen.getByTestId('row')
    fireEvent.contextMenu(row, { clientX: 0, clientY: 0 })
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(layer()).toBeNull()
    expect(row.style.visibility).toBe('')
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    await flush()

    fireEvent.contextMenu(row, { clientX: 60, clientY: 30 })
    expect(layer()).not.toBeNull()
  })

  it('anchors the menu beside the lifted row instead of on it', () => {
    const anchor = anchorBesideLift(pointAnchor(120, 40), {
      left: 0,
      right: 400,
      top: 20,
      bottom: 80,
    })
    expect(anchor).toEqual({ left: 120, right: 120, top: 14, bottom: 86 })
  })
})

describe('long-press lift with a bottom sheet', () => {
  it('hides the row only once the copy has faded in with the backdrop', () => {
    render(<SheetHarness />)
    const row = screen.getByTestId('row')
    longPress(row)
    const lift = layer()!
    expect(lift.parentElement?.classList.contains('sheet-backdrop')).toBe(true)
    expect(lift.querySelector('.long-press-lift-scrim')).toBeNull()
    expect(row.style.visibility).toBe('')
    act(() => {
      vi.advanceTimersByTime(DUR_FAST_MS)
    })
    expect(row.style.visibility).toBe('hidden')
  })

  it('settles on a body layer when the owner unmounts the sheet', async () => {
    render(<SheetHarness />)
    const row = screen.getByTestId('row')
    longPress(row)
    act(() => {
      vi.advanceTimersByTime(DUR_FAST_MS)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await flush()
    const released = layer()!
    expect(released.parentElement).toBe(document.body)
    expect(released.classList.contains('released')).toBe(true)
    expect(released.dataset.state).toBe('settling')
    expect(row.style.visibility).toBe('hidden')
    act(() => {
      vi.advanceTimersByTime(FADE_EXIT_MS)
    })
    expect(layer()).toBeNull()
    expect(row.style.visibility).toBe('')
  })
})

describe('lift building', () => {
  it('replaces live media and canvases past the cap with blank boxes', () => {
    const source = document.createElement('div')
    source.innerHTML =
      '<iframe></iframe>' +
      '<canvas width="10" height="10"></canvas>'.repeat(10)
    document.body.append(source)
    const { layer: built } = buildLongPressLift(source)
    const clone = built.querySelector('.long-press-lift-clone')!
    expect(clone.querySelector('iframe')).toBeNull()
    expect(clone.querySelectorAll('canvas')).toHaveLength(8)
    expect(clone.querySelectorAll('.long-press-lift-blank')).toHaveLength(3)
    source.remove()
  })

  it('drops the copy outright when the row left with the overlay', () => {
    const source = document.createElement('div')
    const host = document.createElement('div')
    document.body.append(source, host)
    const lift = mountLongPressLift(source, host)
    source.remove()
    host.remove()
    lift.release()
    expect(lift.state).toBe('removed')
    expect(layer()).toBeNull()
  })

  it('forgets an armed source that no overlay took in time', () => {
    const source = document.createElement('div')
    document.body.append(source)
    armLongPressLift(source)
    vi.advanceTimersByTime(900)
    expect(takeLongPressLiftSource()).toBeUndefined()
    armLongPressLift(source)
    expect(takeLongPressLiftSource()).toBe(source)
    expect(takeLongPressLiftSource()).toBeUndefined()
    source.remove()
  })

  it('tells pointer context menus from keyboard ones', () => {
    expect(
      isPointerContextMenu({
        clientX: 5,
        clientY: 5,
        nativeEvent: { pointerType: '' } as unknown as Event,
      }),
    ).toBe(false)
    expect(
      isPointerContextMenu({
        clientX: 5,
        clientY: 5,
        nativeEvent: { pointerType: 'touch' } as unknown as Event,
      }),
    ).toBe(true)
    expect(isPointerContextMenu({ clientX: 0, clientY: 0 })).toBe(false)
  })

  it('animates only transform and opacity', () => {
    const rules = css.match(/\.long-press-lift[^{]*\{[^}]*\}/g) ?? []
    expect(rules.length).toBeGreaterThan(4)
    for (const rule of rules) {
      const transition = /transition:([^;]*);/.exec(rule)?.[1]
      if (!transition) continue
      for (const part of transition.split(','))
        expect(part.trim().split(/\s+/)[0]).toMatch(/^(transform|opacity)$/)
    }
  })
})

describe('summary preview card', () => {
  function reply({ tail = '3 4', skipped = '3' } = {}) {
    const article = document.createElement('article')
    article.className = 'message assistant'
    article.dataset.previewParts = tail
    article.dataset.previewSkipped = skipped
    article.innerHTML = `
      <div data-message-part="0"><p>Thinking it over</p></div>
      <details class="tool-group" data-message-part="1"><summary>Ran 2 actions</summary></details>
      <div data-message-part="3"><p>Summary first line</p></div>
      <div data-message-part="4"><table><tr><td>cell</td></tr></table></div>
      <footer class="message-footer" data-preview-omit=""><time>Worked for 3s</time></footer>`
    document.body.append(article)
    return article
  }

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(16, 200, 380, 120),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('copies only the summary parts, under a skipped-steps hint', () => {
    const source = reply()
    const preview = placeLongPressPreview(source)!
    expect(preview.summary?.skipped).toBe(3)
    expect(preview.card.pop).toBe(true)
    expect(preview.from.transform).toContain('scale(0.96)')
    const { lift } = buildLongPressLift(source, { preview })
    const clone = lift.querySelector('.long-press-lift-clone')!
    expect(
      [...clone.querySelectorAll('[data-message-part]')].map(
        (node) => (node as HTMLElement).dataset.messagePart,
      ),
    ).toEqual(['3', '4'])
    expect(clone.querySelector('footer, details')).toBeNull()
    expect(clone.querySelector('table')).not.toBeNull()
    const hint = lift.querySelector<HTMLElement>('.long-press-preview-hint')!
    expect(hint.textContent).toBe('3 steps')
    expect(hint.querySelector('svg')).not.toBeNull()
    // The copy sits under the hint row; the original message is untouched.
    expect(
      Number.parseFloat(
        lift.querySelector<HTMLElement>('.long-press-preview-content')!.style
          .top,
      ),
    ).toBeCloseTo(preview.card.leadTop + PREVIEW_HINT_PX)
    expect(source.querySelectorAll('[data-message-part]')).toHaveLength(4)
    expect(document.querySelector('.long-press-preview-probe')).toBeNull()
  })

  it('shows no hint and grows out of the message when nothing came before', () => {
    const source = reply({ tail: '0', skipped: '0' })
    const preview = placeLongPressPreview(source)!
    expect(preview.card.pop).toBe(false)
    expect(preview.from.opacity).toBe(1)
    const { lift } = buildLongPressLift(source, { preview })
    expect(lift.querySelector('.long-press-preview-hint')).toBeNull()
  })

  it('copies the whole message without a tail', () => {
    const source = reply()
    delete source.dataset.previewParts
    const preview = placeLongPressPreview(source)!
    expect(preview.summary).toBeUndefined()
    const { lift } = buildLongPressLift(source, { preview })
    expect(lift.querySelectorAll('[data-message-part]')).toHaveLength(4)
    expect(lift.querySelector('footer')).not.toBeNull()
  })
})
