import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapBase46ToCSS } from './theme'
import { themes } from './themes'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function declarations(property: string) {
  const pattern = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;}]+)`, 'g')
  return [...css.matchAll(pattern)].map((match) => match[1].trim())
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

  it('guarantees readable text and solid-fill contrast across all themes', () => {
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
          contrast(variables[`--${scale}-contrast`], variables[`--${scale}-9`]),
          `${theme.name}: ${scale} fill`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      expect(
        contrast(variables['--accent-contrast'], variables['--accent-9']),
        `${theme.name}: accent contrast`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('stylesheet token enforcement', () => {
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
    }))
      expect(css).toContain(`--${name}: ${value};`)
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
    ]
    const defined = [...css.matchAll(/@keyframes ([\w-]+)/g)].map(
      (match) => match[1],
    )
    expect(defined.sort()).toEqual(allowed.sort())
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
          !/^(0|50%|inherit|var\(--radius-(sm|md|lg|full|inner-composer)\)|var\(--editor-origin-radius\))$/.test(
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

  it('uses only motion duration tokens outside documented functional loops', () => {
    const withoutDefinitions = css.replace(
      /--(?:dur-[\w-]+|ease-out|ease-loop-[\w-]+):\s*[^;]+;/g,
      '',
    )
    expect(
      withoutDefinitions.match(/(?<![\w.-])(?:\d*\.)?\d+m?s\b/g),
    ).toBeNull()
    expect(
      declarations('transition').filter(
        (value) =>
          !/var\(--dur-(press|fast|panel)\)/.test(value) && value !== 'none',
      ),
    ).toEqual([])
    expect(withoutDefinitions).not.toMatch(
      /(?<![\w-])(?:ease(?:-in-out|-in|-out)?|linear|step-start|step-end|cubic-bezier\([^)]*\)|steps\([^)]*\))(?![\w-])/,
    )
  })
})
