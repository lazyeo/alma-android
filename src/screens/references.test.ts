import { describe, expect, it } from 'vitest'
import {
  deleteReferenceAtCaret,
  highlightSegments,
  isReferenceTokenAt,
  materializeReferences,
  parseMaterializedReferences,
  sanitizeReferenceLabel,
  stripReferenceAtSigns,
  type DraftReference,
  appendQuote,
  appendReference,
  messageReferenceUri,
  snippetLabel,
} from './references'

describe('reference tokens', () => {
  it('sanitizes labels and numbers duplicates', () => {
    expect(sanitizeReferenceLabel(' [Roadmap]\n()', [])).toBe('Roadmap')
    expect(sanitizeReferenceLabel('', [])).toBe('untitled')
    expect(sanitizeReferenceLabel('Roadmap', ['Roadmap'])).toBe('Roadmap 2')
  })
  it('materializes longest labels first and drops edited tokens', () => {
    const refs: DraftReference[] = [
      { label: 'Roadmap', uri: 'alma://thread/a', kind: 'thread' },
      { label: 'Roadmap plan', uri: 'alma://plan/b', kind: 'plan' },
      { label: 'Missing', uri: 'alma://thread/c', kind: 'thread' },
    ]
    expect(materializeReferences('@Roadmap plan then @Roadmap', refs)).toBe(
      '@[Roadmap plan](alma://plan/b) then @[Roadmap](alma://thread/a)',
    )
  })
  it('parses materialized text for edit and resend', () => {
    expect(
      parseMaterializedReferences('Open @[Roadmap](alma://thread/a).'),
    ).toEqual({
      text: 'Open @Roadmap.',
      references: [
        { label: 'Roadmap', uri: 'alma://thread/a', kind: 'thread' },
      ],
    })
  })
  it('deletes a whole reference after its label or trailing space', () => {
    const ref = { label: 'Roadmap', uri: 'alma://thread/a', kind: 'thread' }
    expect(deleteReferenceAtCaret('Ask @Roadmap next', 13, [ref])).toEqual({
      text: 'Ask next',
      caret: 4,
      references: [],
    })
    expect(deleteReferenceAtCaret('Ask @Roadmap', 12, [ref])).toEqual({
      text: 'Ask ',
      caret: 4,
      references: [],
    })
  })
})

describe('composer highlight segments', () => {
  it('marks only tokens that belong to tracked references', () => {
    const refs = [{ label: 'Roadmap', uri: 'alma://thread/a', kind: 'thread' }]
    expect(highlightSegments('See @Roadmap and @Other', refs)).toEqual([
      { text: 'See ' },
      { text: '@Roadmap', ref: refs[0] },
      { text: ' and @Other' },
    ])
  })
  it('prefers the longest label and keeps trailing text', () => {
    const refs = [
      { label: 'Road', uri: 'alma://thread/a', kind: 'thread' },
      { label: 'Road map', uri: 'alma://plan/b', kind: 'plan' },
    ]
    expect(highlightSegments('@Road map!', refs)).toEqual([
      { text: '@Road map', ref: refs[1] },
      { text: '!' },
    ])
  })
})

describe('markdown reference mentions', () => {
  it('drops the @ before alma links so the chip replaces the whole token', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Open @' },
            { type: 'link', url: 'alma://thread/a', children: [] },
            { type: 'text', value: ' or mail a@' },
            { type: 'link', url: 'https://x.test', children: [] },
          ],
        },
      ],
    }
    stripReferenceAtSigns(tree)
    expect(tree.children[0].children.map((node) => node.value)).toEqual([
      'Open ',
      undefined,
      ' or mail a@',
      undefined,
    ])
  })
})

describe('reference token positions', () => {
  it('recognizes an @ that starts a tracked token', () => {
    const refs = [{ label: 'Road map', uri: 'alma://thread/a', kind: 'thread' }]
    expect(isReferenceTokenAt('Ask @Road map next', 4, refs)).toBe(true)
    expect(isReferenceTokenAt('Ask @Road next', 4, refs)).toBe(false)
  })
})

describe('selection actions', () => {
  it('names a snippet by its first non-empty line', () => {
    expect(snippetLabel('\n  Ship   the fix\nsecond')).toBe('Ship the fix')
    expect(snippetLabel('x'.repeat(50))).toBe(`${'x'.repeat(40)}…`)
  })

  it('builds message references from the row id', () => {
    expect(messageReferenceUri('t1', 't1--user-9')).toBe(
      'alma://thread/t1/message/t1--user-9',
    )
  })

  it('quotes every line and keeps blank lines inside the quote', () => {
    expect(appendQuote('', 'one\n\ntwo\n')).toBe('> one\n>\n> two\n\n')
    expect(appendQuote('Draft  \n', 'one')).toBe('Draft\n\n> one\n\n')
    expect(appendQuote('Draft', '   ')).toBe('Draft')
  })

  it('appends a reference token with a separating space', () => {
    const next = appendReference(
      'see',
      { title: 'Ship the fix', uri: 'alma://snippet/s1', kind: 'snippet' },
      [],
    )
    expect(next.text).toBe('see @Ship the fix ')
    expect(next.caret).toBe(next.text.length)
    expect(next.references).toEqual([
      { label: 'Ship the fix', uri: 'alma://snippet/s1', kind: 'snippet' },
    ])
  })
})
