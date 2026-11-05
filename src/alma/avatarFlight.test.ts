// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  avatarBox,
  avatarClone,
  clearAvatarBoxes,
  correctionFrames,
  flightFrames,
  headerAvatarTarget,
  predictedHeaderAvatar,
  recordAvatarBox,
} from './avatarFlight'

// jsdom's import.meta.url is not a file URL.
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
const box = (left: number, top: number, size: number) => ({
  left,
  top,
  width: size,
  height: size,
})

afterEach(() => {
  clearAvatarBoxes()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('avatar boxes', () => {
  it('keeps the last box of each end and ignores empty ones', () => {
    recordAvatarBox('nav', box(180, 792, 48))
    recordAvatarBox('nav', box(0, 0, 0))
    expect(avatarBox('nav')).toEqual(box(180, 792, 48))
    expect(avatarBox('header')).toBeUndefined()
  })

  it('predicts the header avatar from the layout tokens until measured', () => {
    // 18px page padding + 12px header padding + 40px Back + 10px gap.
    expect(predictedHeaderAvatar()).toEqual(box(80, 12, 36))
    expect(predictedHeaderAvatar({ top: 40, left: 20 })).toEqual(
      box(88, 52, 36),
    )
    expect(css).toMatch(/\n\.detail-main \{[^}]*padding: 0 18px;/)
    expect(css).toMatch(/\n\.detail-header > button \{[^}]*width: 40px;/)
    vi.stubGlobal('__almaNativeInsets', { top: 30, left: 0 })
    expect(headerAvatarTarget()).toEqual(box(80, 42, 36))
    recordAvatarBox('header', box(60, 44, 36))
    expect(headerAvatarTarget()).toEqual(box(60, 44, 36))
  })
})

describe('flightFrames', () => {
  it('starts unscaled on the source and lands scaled on the target', () => {
    expect(flightFrames(box(176, 790, 48), box(66, 12, 36))).toEqual([
      { transform: 'translate(176px, 790px)' },
      { transform: 'translate(66px, 12px) scale(0.75)' },
    ])
    expect(flightFrames(box(0, 0, 0), box(0, 0, 36))).toBeUndefined()
  })

  it('nudges onto the measured landing in the scaled layer', () => {
    expect(correctionFrames(box(66, 12, 36), box(66.2, 12.3, 36), 1)).toBe(
      undefined,
    )
    expect(correctionFrames(box(66, 12, 36), box(60, 18, 36), 0.75)).toEqual([
      { transform: 'translate(0px, 0px)' },
      { transform: 'translate(-8px, 8px)' },
    ])
  })
})

describe('avatarClone', () => {
  it('copies the face, canvas pixels included, without the flight hooks', () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as RenderingContext)
    const source = document.createElement('span')
    source.className = 'alma-avatar alma-avatar-flight'
    source.setAttribute('data-alma-avatar', 'nav')
    const canvas = document.createElement('canvas')
    canvas.width = 144
    canvas.height = 144
    source.append(canvas)
    const { flight, face } = avatarClone(source, box(180, 792, 48))
    expect(flight.className).toBe('alma-avatar-clone')
    expect(flight.getAttribute('aria-hidden')).toBe('true')
    expect(flight.style.width).toBe('48px')
    const copy = face.firstElementChild!
    expect(copy.className).toBe('alma-avatar')
    expect(copy.hasAttribute('data-alma-avatar')).toBe(false)
    expect(copy.querySelector('canvas')!.width).toBe(144)
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0)
  })
})

describe('flight styles', () => {
  it('hides both real avatars while the clone flies, above every layer', () => {
    expect(css).toContain(
      'html[data-alma-avatar-flight] .alma-avatar-flight {\n  visibility: hidden;',
    )
    expect(css).toMatch(
      /\.alma-avatar-clone \{[^}]*position: fixed;[^}]*z-index: 5;[^}]*transform-origin: 0 0;/,
    )
  })

  it('names no Alma element for View Transitions any more', () => {
    expect(css).not.toContain('view-transition-name: alma-avatar')
    expect(css).not.toMatch(/view-transition-[a-z]+\(alma-expand/)
    expect(css).not.toContain("data-alma-expand='reveal'")
  })
})
