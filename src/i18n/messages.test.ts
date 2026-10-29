import { describe, expect, it } from 'vitest'
import { en } from './en'
import { zh } from './zh'

type Tree = { [key: string]: unknown }
const isPlural = (value: unknown): value is Record<string, string> =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as Tree).other === 'string'

function leaves(tree: Tree, prefix = ''): Map<string, unknown> {
  const result = new Map<string, unknown>()
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`
    if (typeof value === 'string' || isPlural(value)) result.set(path, value)
    else
      for (const [child, leaf] of leaves(value as Tree, `${path}.`))
        result.set(child, leaf)
  }
  return result
}

const placeholders = (value: unknown) =>
  [
    ...new Set(
      (isPlural(value) ? Object.values(value) : [value as string]).flatMap(
        (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
      ),
    ),
  ].sort()

const enLeaves = leaves(en)
const zhLeaves = leaves(zh)

describe('message catalogs', () => {
  it('has the same key shape in English and Chinese', () => {
    expect([...zhLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort())
  })

  it('has no blank copy', () => {
    for (const [key, value] of [...enLeaves, ...zhLeaves]) {
      const texts = isPlural(value) ? Object.values(value) : [value as string]
      for (const text of texts) expect(text.trim(), key).not.toBe('')
    }
  })

  it('uses the same placeholders in both languages', () => {
    for (const [key, value] of enLeaves)
      expect(placeholders(zhLeaves.get(key)), key).toEqual(placeholders(value))
  })

  it('gives every English plural both one and other forms', () => {
    for (const [key, value] of enLeaves)
      if (isPlural(value))
        expect(Object.keys(value).sort(), key).toEqual(['one', 'other'])
  })

  it('translates Chinese copy instead of copying English', () => {
    // Brand, product, and format-only strings may legitimately match.
    const untranslated = [...enLeaves].filter(([key, value]) => {
      const zhValue = zhLeaves.get(key)
      return (
        typeof value === 'string' &&
        value === zhValue &&
        /[a-z]{3,}/.test(value) &&
        !SAME_IN_BOTH.has(key)
      )
    })
    expect(untranslated.map(([key]) => key)).toEqual([])
  })
})

// Keys whose English text is also the right Chinese text (names, symbols).
const SAME_IN_BOTH = new Set<string>([
  'settings.fold.hinge.shizuku',
  // "tokens" is the usual term in Chinese model UIs.
  'composer.context.tokens',
  'composer.context.tokensOf',
  // Mode/feature names desktop Alma also leaves in English.
  'composer.fast',
  'thread.crew.title',
  // Product name is intentionally unchanged in both locales.
  'nav.agents',
  'agents.title',
])
