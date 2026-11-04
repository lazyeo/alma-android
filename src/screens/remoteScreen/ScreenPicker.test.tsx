// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScreenDisplay, ScreenStatus } from './protocol'
import { ScreenPicker } from './ScreenPicker'
import type { ScreenWindowList } from './useRemoteScreen'

vi.mock('../../components/BottomSheet', () => ({
  BottomSheet: ({
    title,
    children,
  }: {
    title: string
    children: ReactNode
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}))

vi.mock('../../i18n', () => ({ useT: () => (key: string) => key }))

afterEach(cleanup)

const display = (id: number, primary = false): ScreenDisplay => ({
  id,
  name: `Display ${id}`,
  width: 1920,
  height: 1080,
  scale: 1,
  primary,
})

const status = (extra: Partial<ScreenStatus> = {}): ScreenStatus => ({
  type: 'status',
  bound: true,
  displayId: 1,
  width: 1512,
  height: 982,
  scale: 2,
  mode: 'jpeg',
  ...extra,
})

const windowList: ScreenWindowList = {
  windows: [
    {
      id: 7,
      app: 'Safari',
      title: 'Docs',
      width: 800,
      height: 600,
      icon: 'data:image/png;base64,iVBORw0KGgo=',
    },
    { id: 8, bundleId: 'com.microsoft.VSCode', width: 900, height: 700 },
  ],
}

const renderPicker = (
  props: Partial<Parameters<typeof ScreenPicker>[0]> = {},
) => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <ScreenPicker
      status={status()}
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  )
  return { onSelect, onClose }
}

const section = (name: string) => screen.getByRole('region', { name })

describe('ScreenPicker', () => {
  it('shows a single Whole screen row, marked current, with one display', () => {
    renderPicker({ status: status({ displays: [display(1, true)] }) })
    const screenSection = section('screen.picker.screen')
    const rows = within(screenSection).getAllByRole('button')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('screen.picker.wholeScreen')
    expect(rows[0].getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.queryByRole('region', { name: 'screen.picker.displays' }),
    ).toBeNull()
  })

  it('lists displays, main first, only when there is more than one', () => {
    const { onSelect } = renderPicker({
      status: status({
        displayId: 3,
        displays: [display(3), display(1, true)],
      }),
    })
    const rows = within(section('screen.picker.displays')).getAllByRole(
      'button',
    )
    expect(rows.map((row) => row.textContent)).toEqual([
      'Display 1screen.picker.primary',
      'Display 3',
    ])
    expect(rows[0].getAttribute('aria-pressed')).toBe('false')
    expect(rows[1].getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('screen.picker.wholeScreen')).toBeNull()
    fireEvent.click(rows[0])
    expect(onSelect).toHaveBeenCalledWith({ kind: 'display', id: 1 })
  })

  it('hides the windows section when the desktop cannot stream windows', () => {
    renderPicker({ status: status({ windows: false }), windowList })
    expect(
      screen.queryByRole('region', { name: 'screen.picker.windows' }),
    ).toBeNull()
    expect(screen.queryByText('Safari')).toBeNull()
  })

  it('lists windows with their app and marks the streamed one', () => {
    const { onSelect } = renderPicker({
      status: status({ windows: true, window: { id: 8 } }),
      windowList,
    })
    const windows = section('screen.picker.windows')
    const rows = within(windows).getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual(['SafariDocs', 'VSCode'])
    expect(rows[0].getAttribute('aria-pressed')).toBe('false')
    expect(rows[1].getAttribute('aria-pressed')).toBe('true')
    expect(rows[0].querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    )
    // Streaming a window: the whole screen row is not current.
    expect(
      within(section('screen.picker.screen'))
        .getByRole('button')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    fireEvent.click(rows[0])
    expect(onSelect).toHaveBeenCalledWith({ kind: 'window', id: 7 })
  })

  it('shows loading, failure and empty states for windows', () => {
    renderPicker({ status: status({ windows: true }) })
    expect(screen.getByRole('status').textContent).toContain(
      'screen.picker.loading',
    )
    cleanup()
    renderPicker({
      status: status({ windows: true }),
      windowList: { windows: [], error: 'Window capture is only on macOS' },
    })
    expect(screen.getByRole('alert').textContent).toContain(
      'screen.picker.failed',
    )
    cleanup()
    renderPicker({
      status: status({ windows: true }),
      windowList: { windows: [] },
    })
    expect(screen.getByText('screen.picker.empty')).toBeTruthy()
  })
})
