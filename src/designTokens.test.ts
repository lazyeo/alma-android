import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_EASING,
  COLLAPSE_MS,
  EXPAND_EASING,
  EXPAND_MS,
} from './alma/expandMotion'
import {
  DUR_FAST_MS,
  DUR_HANDOFF_MS,
  DUR_PANEL_MS,
  DUR_PRESS_MS,
  EASE_OUT,
} from './motionTokens'
import { mapBase46ToCSS } from './theme'
import { themes } from './themes'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const remoteScreenCss = readFileSync(
  new URL('./screens/remoteScreen/remoteScreen.css', import.meta.url),
  'utf8',
)

function declarations(property: string, source = css) {
  const pattern = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;}]+)`, 'g')
  return [...source.matchAll(pattern)].map((match) => match[1].trim())
}

function rules(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
  return [
    ...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*{[^}]*}`, 'gs')),
  ].map((match) => match[0])
}

function hexToRgb(value: string) {
  const hex = value.replace('#', '')
  const expanded =
    hex.length === 3
      ? [...hex].map((character) => character + character).join('')
      : hex.slice(0, 6)
  return [0, 2, 4].map((index) =>
    Number.parseInt(expanded.slice(index, index + 2), 16),
  )
}

function luminance(value: string) {
  const channels = hexToRgb(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort(
    (left, right) => right - left,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

describe('theme color scales', () => {
  it('emits complete Radix-style scales for every Base46 theme', () => {
    expect(themes).toHaveLength(74)
    for (const theme of themes) {
      const variables = mapBase46ToCSS(theme)
      for (const scale of ['gray', 'accent', 'red', 'amber', 'green']) {
        for (let step = 1; step <= 12; step += 1)
          expect(variables[`--${scale}-${step}`], theme.name).toMatch(
            /^#[0-9a-f]{6}$/i,
          )
      }
      expect(variables['--gray-1']).toBe(
        theme.type === 'light' ? theme.base_30.black : theme.base_30.one_bg,
      )
      expect(variables['--gray-12']).toBe(theme.base_30.white)
      expect(variables['--accent-9']).toBe(theme.base_30.blue)
      expect(variables['--red-9']).toBe(theme.base_30.red)
    }
  })

  it('guarantees readable text and emits binary solid-fill contrast tokens', () => {
    for (const theme of themes) {
      const variables = mapBase46ToCSS(theme)
      expect(
        contrast(variables['--gray-11'], variables['--gray-2']),
        `${theme.name}: gray-11 on gray-2`,
      ).toBeGreaterThanOrEqual(4.5)
      const originalForegroundContrast = contrast(
        theme.base_30.white,
        variables['--gray-2'],
      )
      expect(
        contrast(variables['--gray-12'], variables['--gray-2']),
        `${theme.name}: gray-12 on gray-2`,
      ).toBeGreaterThanOrEqual(originalForegroundContrast >= 7 ? 7 : 4.5)
      expect(
        contrast(variables['--accent-11'], variables['--gray-1']),
        `${theme.name}: accent-11 on gray-1`,
      ).toBeGreaterThanOrEqual(4.5)
      for (const scale of ['red', 'amber', 'green']) {
        expect(
          contrast(variables[`--${scale}-11`], variables['--gray-2']),
          `${theme.name}: ${scale} text`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          ['#000000', '#ffffff'],
          `${theme.name}: ${scale} fill`,
        ).toContain(variables[`--${scale}-contrast`])
      }
      expect(
        ['#000000', '#ffffff'],
        `${theme.name}: accent contrast`,
      ).toContain(variables['--accent-contrast'])
    }
  })
})

describe('stylesheet token enforcement', () => {
  it('makes project card sheet primary footers full width and 48px tall', () => {
    const selector = [
      '.project-card-draft-sheet .sheet-footer > button.primary',
      '.project-card-edit-sheet .sheet-footer > button.primary',
    ].join(',\n')
    const rule = rules(selector).join('\n')
    expect(rule).toContain('width: 100%;')
    expect(rule).toContain('min-height: 48px;')
    expect(rule).toContain('display: inline-flex;')
    expect(rule).toContain('align-items: center;')
    expect(rule).toContain('justify-content: center;')
    expect(rule).toContain('gap: 8px;')
  })

  it('uses only the four type sizes and three weights', () => {
    expect(
      declarations('font-size').filter(
        (value) => !/^var\(--text-(xs|sm|md|display)\)$/.test(value),
      ),
    ).toEqual([])
    expect(
      declarations('font-weight').filter(
        (value) =>
          !/^(400|500|600|var\(--weight-(regular|medium|semibold)\))$/.test(
            value,
          ),
      ),
    ).toEqual([])
  })

  it('prevents shorthand bypasses and keeps typography tokenized', () => {
    expect(declarations('font').filter((value) => value !== 'inherit')).toEqual(
      [],
    )
    expect(
      declarations('line-height').every((value) =>
        /^var\(--leading-(tight|normal|relaxed)\)$/.test(value),
      ),
    ).toBe(true)
    expect(
      declarations('letter-spacing').every(
        (value) => value === 'var(--tracking-normal)',
      ),
    ).toBe(true)
    for (const [name, value] of Object.entries({
      'text-xs': '12px',
      'text-sm': '14px',
      'text-md': '16px',
      'text-display': '24px',
      'weight-regular': '400',
      'weight-medium': '500',
      'weight-semibold': '600',
      'radius-sm': '6px',
      'radius-md': '10px',
      'radius-lg': '16px',
      'radius-full': '999px',
      'border-hairline': '0.5px',
      'leading-relaxed': '1.65',
      'dur-press': '100ms',
      'dur-fast': '160ms',
      'dur-panel': '250ms',
      'ease-out': 'cubic-bezier(0.2, 0.9, 0.3, 1)',
      'ease-loop-step': 'step-end',
      'ease-loop-linear': 'linear',
      'ease-loop-wave': 'ease-in-out',
      'dur-flight': '320ms',
      'ease-spring': 'cubic-bezier(0.34, 1.32, 0.64, 1)',
      'dur-expand': `${EXPAND_MS}ms`,
      'dur-collapse': `${COLLAPSE_MS}ms`,
      'dur-stagger': '40ms',
      'ease-collapse': COLLAPSE_EASING,
    }))
      expect(css).toContain(`--${name}: ${value};`)
    // Script timers and WAAPI motion read the same tokens from TS.
    for (const [name, value] of Object.entries({
      'dur-press': `${DUR_PRESS_MS}ms`,
      'dur-fast': `${DUR_FAST_MS}ms`,
      'dur-panel': `${DUR_PANEL_MS}ms`,
      'dur-handoff': `${DUR_HANDOFF_MS}ms`,
      'ease-out': EASE_OUT,
    }))
      expect(css).toContain(`--${name}: ${value};`)
    // The expand spring is generated in TS and mirrored as a token.
    const expand = /--ease-expand:\s*(linear\([^)]*\));/.exec(css)?.[1]
    expect(
      expand?.replace(/\s+/g, ' ').replace('( ', '(').replace(' )', ')'),
    ).toBe(EXPAND_EASING)
  })

  it('retains only documented functional keyframes and no decorative motion', () => {
    const allowed = [
      'overlay-backdrop-in',
      'overlay-backdrop-out',
      'sheet-enter',
      'sheet-exit',
      'thinking',
      'spin',
      'fullscreen-overlay-in',
      'fullscreen-overlay-out',
      'tsGap',
      'stop-ring-finish',
      'fullscreen-editor-in',
      'fullscreen-editor-out',
      'fullscreen-editor-chrome-in',
      'fullscreen-editor-chrome-out',
      'fullscreen-editor-reduced-in',
      'fullscreen-editor-reduced-out',
      'anchored-menu-in',
      'anchored-menu-out',
      'siblingCrossfade',
      'nav-old-push',
      'nav-new-push',
      'nav-old-pop',
      'nav-new-pop',
      'nav-fade-out',
      // Alma's presence: thinking glance/glint and the busy dot's pulse.
      'alma-glance',
      'alma-glint',
      'alma-busy-pulse',
      // Her face fading in over the logo in the rail's top slot.
      'alma-slot-in',
      // Her messages rising in once the /alma expand lands (the expand
      // itself is WAAPI: transform and opacity only, no keyframes here).
      'alma-persona-rise',
      // The activity status word rolling in its one-line slot.
      'status-roll-in',
      'status-roll-out',
      // A reaction chip arriving under a message already on screen.
      'reaction-chip-in',
    ]
    const defined = [...css.matchAll(/@keyframes ([\w-]+)/g)].map(
      (match) => match[1],
    )
    expect(defined.sort()).toEqual(allowed.sort())
    // Keyframes run on the compositor: no clip-path, filter, shadow,
    // radius or box-size animation, whatever the surface.
    for (const [, name, body] of css.matchAll(
      /@keyframes ([\w-]+)\s*{((?:[^{}]*{[^}]*})*)\s*}/g,
    ))
      for (const [, property] of body.matchAll(/([\w-]+)\s*:/g))
        expect(
          ['transform', 'translate', 'opacity', 'background-color'],
          `${name} animates ${property}`,
        ).toContain(property)
    for (const value of declarations('animation')) {
      const name = value.split(/\s+/)[0]
      expect(name === 'none' || allowed.includes(name), value).toBe(true)
    }
    expect(css).not.toMatch(
      /activity-shimmer|recipe-status-pulse|fast-on|project-push|tab-content-in|search-flash|latest-jump-in|@keyframes pulse/,
    )
    expect(css).toContain('animation-duration: var(--dur-reduced) !important;')
    expect(css).toContain('transition-duration: var(--dur-reduced) !important;')
    expect(css).toMatch(/::view-transition-old\(root\)/)
    expect(css).toMatch(/::view-transition-new\(root\)/)
    expect(css).toMatch(/::view-transition-group\(alma-composer\)/)
    // Persistent chrome must never ride along with a page transition.
    for (const [selector, name] of [
      ['.split-rail', 'alma-rail'],
      ['.tab-bar', 'alma-tabbar'],
      ['.split-sidebar', 'alma-sidebar'],
    ]) {
      expect(css).toContain(`${selector} {\n  view-transition-name: ${name};`)
      expect(css).toMatch(
        new RegExp(
          `::view-transition-old\\(${name}\\)[^{]*\\{[^}]*display: none;`,
          's',
        ),
      )
    }
  })

  it("draws Alma's tab entry as her face alone, sitting in the bar", () => {
    const [avatar] = rules('.alma-nav-avatar')
    expect(avatar).toContain('width: var(--alma-nav-box);')
    expect(avatar).toContain('height: var(--alma-nav-box);')
    expect(avatar).not.toMatch(/background|border:|margin/)
    // 60px face in a column as tall as the other tab items (48px), so the
    // floating pill keeps its height; the face rises at most 9px past the
    // pill's top.
    const [tab] = rules('.alma-nav-tab')
    expect(tab).toContain('--alma-face: 60px;')
    expect(tab).toContain('height: 48px;')
    expect(css).toMatch(/\n\.tab-bar > a \{[^}]*height: 48px;/)
    const [tabAvatar] = rules('.alma-nav-tab .alma-nav-avatar')
    expect(tabAvatar).toContain('left: calc(50% - var(--alma-nav-box) / 2);')
    // The 48px column is centred in the 64px pill.
    expect(css).toContain('--floating-nav-height: 64px;')
    const bottom = Number(tabAvatar.match(/bottom: ([\d.]+)px;/)?.[1])
    const columnTop = (64 - 48) / 2
    expect(60 + bottom - 48 - columnTop).toBeLessThanOrEqual(9)
    const pressed = css.match(
      /\.alma-nav-avatar\[data-pressed\]\s*{[^}]*}/,
    )?.[0]
    expect(pressed).toContain('transform: scale(0.92);')
    expect(pressed).not.toContain('background')
    expect(css).toMatch(/\n\.tab-bar \{[^}]*align-items: center;/)
    // Busy is a centred dot that animates only opacity and transform; no
    // ring outlines her face.
    expect(css).not.toContain('.alma-nav-ring')
    const [busy] = rules('.alma-nav-busy')
    expect(busy).toContain('left: calc(50% - 2px);')
    expect(busy).toContain('width: 4px;')
    const pulse = css.match(/@keyframes alma-busy-pulse\s*{[\s\S]*?\n}/)?.[0]
    const animated = [...(pulse ?? '').matchAll(/([a-z-]+):/g)].map(
      ([, property]) => property,
    )
    expect(new Set(animated)).toEqual(new Set(['opacity', 'transform']))
  })

  it('keeps nested rounded surfaces concentric', () => {
    expect(css).toMatch(
      /--radius-inner-composer:\s*max\(\s*calc\(var\(--radius-lg\) - var\(--composer-pad-x\)\),\s*4px\s*\);/,
    )
    for (const [label, selector, declaration] of [
      [
        'composer controls',
        '.composer-chip',
        'border-radius: var(--radius-inner-composer);',
      ],
      [
        'composer icon buttons',
        '.composer .attach',
        'border-radius: var(--radius-inner-composer);',
      ],
      [
        'attachment cards',
        '.attachment-chip',
        'border-radius: var(--radius-inner-composer);',
      ],
      [
        'attachment thumbnails',
        '.attachment-chip > span',
        'border-radius: max(calc(var(--radius-md) - 6px), 4px);',
      ],
      [
        'anchored menu surface',
        '.anchored-menu',
        'border-radius: var(--radius-lg);',
      ],
      [
        'anchored menu rows',
        '.anchored-menu-row',
        'border-radius: max(calc(var(--radius-lg) - 4px), 4px);',
      ],
      ['settings rows', '.settings-row', 'border-radius: 0;'],
      [
        'settings first row top corners',
        '.settings-row:first-child',
        'border-radius: var(--radius-md) var(--radius-md) 0 0;',
      ],
      [
        'settings last row bottom corners',
        '.settings-row:last-child',
        'border-radius: 0 0 var(--radius-md) var(--radius-md);',
      ],
      [
        'queue rows',
        '.queue-item',
        'border-radius: var(--radius-inner-composer);',
      ],
      [
        'queue editing rows',
        '.queue-item.editing',
        'border-radius: var(--radius-inner-composer);',
      ],
    ]) {
      expect(
        rules(selector).some((rule) => rule.includes(declaration)),
        label,
      ).toBe(true)
    }
  })

  it('keeps list and control hierarchy at the compact text size', () => {
    for (const [label, selector] of [
      ['thread titles', '.thread-row h2'],
      ['desktop list titles', '.desktop-list h2'],
      ['question legends', '.question-fieldset legend strong'],
      ['crystal stats', '.crystals-stats dd'],
      ['attachment labels', '.attachment-chip strong'],
      ['attachment controls', '.attachment-chip button'],
    ]) {
      expect(
        rules(selector).some((rule) =>
          rule.includes('font-size: var(--text-sm);'),
        ),
        label,
      ).toBe(true)
      // Thread titles are the primary list label; they carry hierarchy by weight.
      const weight =
        label === 'thread titles'
          ? 'var(--weight-semibold)'
          : 'var(--weight-medium)'
      if (!label.includes('controls'))
        expect(
          rules(selector).some((rule) =>
            rule.includes(`font-weight: ${weight};`),
          ),
          label,
        ).toBe(true)
    }
    expect(css.match(/\.context-meter strong\s*{[^}]*}/s)?.[0]).toContain(
      'font-size: var(--text-md);',
    )
  })

  it('uses only approved radii, hairlines, shadows and colors', () => {
    expect(
      declarations('border-radius').filter(
        (value) =>
          !/^(0|50%|inherit|var\(--radius-(sm|md|lg|full|inner-composer)\))$/.test(
            value,
          ) &&
          !/^max\(calc\(var\(--radius-(sm|md|lg)\) - \d+px\), 4px\)$/.test(
            value,
          ) &&
          ![
            'var(--radius-lg) var(--radius-lg) 0 0',
            'var(--radius-md) var(--radius-md) 0 0',
            '0 0 var(--radius-md) var(--radius-md)',
          ].includes(value),
      ),
    ).toEqual([])
    const borderDeclarations = [
      ...declarations('border'),
      ...declarations('border-top'),
      ...declarations('border-right'),
      ...declarations('border-bottom'),
      ...declarations('border-left'),
    ]
    expect(
      borderDeclarations.filter(
        (value) =>
          !/^(0|none|var\(--border-hairline\) solid var\(--gray-[67]\)|var\(--border-hairline\) solid var\(--sheet-edge\)|var\(--border-hairline\) solid transparent)$/.test(
            value,
          ),
      ),
    ).toEqual([])
    expect(
      declarations('box-shadow').filter(
        (value) => !/^(none|var\(--shadow-(popover|sheet)\))$/.test(value),
      ),
    ).toEqual([])
    expect(css).not.toMatch(/color-mix\(/)
    expect(css).not.toMatch(
      /(?<![\w-])#[0-9a-f]{3,8}\b|(?<![\w-])rgba?\(|(?<![\w-])hsla?\(/i,
    )
  })

  it('keeps infinite status loops off the transition easing', () => {
    const loops = declarations('animation').filter((value) =>
      value.includes('infinite'),
    )
    expect(loops.length).toBeGreaterThan(0)
    for (const value of loops)
      expect(value, value).toMatch(/var\(--ease-loop-(step|linear|wave)\)/)
  })

  it.each([
    ['styles.css', css],
    // Screen-local sheets read the same tokens; no literal timing there either.
    ['remoteScreen.css', remoteScreenCss],
  ])(
    'uses only motion duration tokens outside documented functional loops (%s)',
    (_name, source) => {
      const withoutDefinitions = source.replace(
        /--(?:dur-[\w-]+|ease-out|ease-spring|ease-expand|ease-collapse|ease-loop-[\w-]+):\s*[^;]+;/g,
        '',
      )
      expect(
        withoutDefinitions.match(/(?<![\w.-])(?:\d*\.)?\d+m?s\b/g),
      ).toBeNull()
      expect(
        declarations('transition', source).filter(
          (value) =>
            !/var\(--dur-(press|fast|panel|handoff)\)/.test(value) &&
            value !== 'none',
        ),
      ).toEqual([])
      expect(withoutDefinitions).not.toMatch(
        /(?<![\w-])(?:ease(?:-in-out|-in|-out)?|linear|step-start|step-end|cubic-bezier\([^)]*\)|steps\([^)]*\))(?![\w-])/,
      )
    },
  )
})
