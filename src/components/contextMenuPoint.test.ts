import { describe, expect, it } from 'vitest'
import { contextMenuPoint } from './useLongPress'

const row = {
  getBoundingClientRect: () => ({
    left: 60,
    right: 340,
    top: 300,
    bottom: 360,
    height: 60,
  }),
} as unknown as Element

describe('contextMenuPoint', () => {
  it('uses the contextmenu event coordinates', () => {
    expect(
      contextMenuPoint(
        { clientX: 120, clientY: 410, currentTarget: row },
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 120, y: 410 })
  })
  it('falls back to the recorded pointerdown point', () => {
    expect(
      contextMenuPoint(
        { clientX: 0, clientY: 0, currentTarget: row },
        { x: 90, y: 320 },
      ),
    ).toEqual({ x: 90, y: 320 })
  })
  it('never anchors at the viewport origin', () => {
    expect(
      contextMenuPoint(
        { clientX: 0, clientY: 0, currentTarget: row },
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 324, y: 330 })
  })
})
