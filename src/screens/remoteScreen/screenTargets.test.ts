import { describe, expect, it } from 'vitest'
import type { ScreenDisplay, ScreenStatus, ScreenWindow } from './protocol'
import {
  canPickTarget,
  currentSelection,
  pickerDisplays,
  pickerWindows,
  sameSelection,
  screenPath,
  targetForSelection,
  windowAppName,
} from './screenTargets'

const display = (
  id: number,
  primary = false,
  name = `Display ${id}`,
): ScreenDisplay => ({ id, name, width: 1920, height: 1080, scale: 1, primary })

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

const window = (extra: Partial<ScreenWindow> = {}): ScreenWindow => ({
  id: 7,
  app: 'Safari',
  title: 'Docs',
  width: 800,
  height: 600,
  ...extra,
})

describe('screenPath', () => {
  it('stays plain for the default display', () => {
    expect(screenPath({})).toBe('/ws/screen')
  })

  it('adds the display and the window', () => {
    expect(screenPath({ displayId: 2 })).toBe('/ws/screen?display=2')
    expect(screenPath({ windowId: 42 })).toBe('/ws/screen?window=42')
    expect(screenPath({ displayId: 0, windowId: 42 })).toBe(
      '/ws/screen?display=0&window=42',
    )
  })

  it('drops ids that are not usable', () => {
    expect(screenPath({ displayId: -1, windowId: 0 })).toBe('/ws/screen')
    expect(screenPath({ displayId: 1.5, windowId: Number.NaN })).toBe(
      '/ws/screen',
    )
  })
})

describe('canPickTarget', () => {
  it('needs a bound stream with windows or a second display', () => {
    expect(canPickTarget(undefined)).toBe(false)
    expect(canPickTarget(status())).toBe(false)
    expect(canPickTarget(status({ displays: [display(1)] }))).toBe(false)
    expect(canPickTarget(status({ windows: true }))).toBe(true)
    expect(canPickTarget(status({ displays: [display(1), display(2)] }))).toBe(
      true,
    )
    expect(canPickTarget(status({ bound: false, windows: true }))).toBe(false)
  })
})

describe('currentSelection', () => {
  it('prefers the streamed window, else the display', () => {
    expect(currentSelection(undefined)).toEqual({ kind: 'display', id: 0 })
    expect(currentSelection(status({ displayId: 3 }))).toEqual({
      kind: 'display',
      id: 3,
    })
    expect(currentSelection(status({ window: { id: 9 } }))).toEqual({
      kind: 'window',
      id: 9,
    })
  })
})

describe('pickerDisplays', () => {
  it('lists nothing for a single display', () => {
    expect(pickerDisplays(undefined)).toEqual([])
    expect(pickerDisplays(status({ displays: [display(1, true)] }))).toEqual([])
  })

  it('puts the main display first and keeps the rest in order', () => {
    const ids = pickerDisplays(
      status({ displays: [display(4), display(2, true), display(3)] }),
    ).map((item) => item.id)
    expect(ids).toEqual([2, 4, 3])
  })
})

describe('pickerWindows', () => {
  it('drops untitled and tiny windows', () => {
    const kept = pickerWindows([
      window({ id: 1 }),
      window({ id: 2, app: undefined, title: undefined }),
      window({ id: 3, width: 1 }),
      window({ id: 4, height: 0 }),
      window({ id: 5, app: undefined, title: 'Untitled app' }),
      window({
        id: 6,
        app: undefined,
        title: undefined,
        bundleId: 'com.microsoft.VSCode',
      }),
    ]).map((item) => item.id)
    expect(kept).toEqual([1, 5, 6])
  })
})

describe('windowAppName', () => {
  it('uses the app name, then the bundle id tail', () => {
    expect(windowAppName({ app: 'Safari', bundleId: 'com.apple.Safari' })).toBe(
      'Safari',
    )
    expect(windowAppName({ bundleId: 'com.microsoft.VSCode' })).toBe('VSCode')
    expect(windowAppName({})).toBe('')
  })
})

describe('targetForSelection', () => {
  it('targets a window by id', () => {
    expect(targetForSelection({ kind: 'window', id: 7 }, status())).toEqual({
      windowId: 7,
    })
  })

  it('names the display only when there is more than one', () => {
    expect(targetForSelection({ kind: 'display', id: 1 }, status())).toEqual({})
    expect(
      targetForSelection(
        { kind: 'display', id: 2 },
        status({ displays: [display(1), display(2)] }),
      ),
    ).toEqual({ displayId: 2 })
  })
})

describe('sameSelection', () => {
  it('compares kind and id', () => {
    expect(
      sameSelection({ kind: 'window', id: 1 }, { kind: 'window', id: 1 }),
    ).toBe(true)
    expect(
      sameSelection({ kind: 'window', id: 1 }, { kind: 'display', id: 1 }),
    ).toBe(false)
    expect(
      sameSelection({ kind: 'display', id: 1 }, { kind: 'display', id: 2 }),
    ).toBe(false)
  })
})
