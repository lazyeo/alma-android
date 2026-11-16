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
  insertQuote,
  quoteMarkdown,
  quotableMessageText,
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
    expect(insertQuote('', 0, 0, 'one\n\ntwo\n')).toEqual({
      value: '> one\n>\n> two\n\n',
      caret: 15,
    })
    expect(quoteMarkdown('a\r\n  \r\nb')).toBe('> a\n>\n> b')
  })

  it('appends after a draft when the caret is at its end', () => {
    expect(insertQuote('Draft  \n', 8, 8, 'one')).toEqual({
      value: 'Draft\n\n> one\n\n',
      caret: 14,
    })
  })

  it('inserts at the caret and keeps the text after it', () => {
    const next = insertQuote('Before\n\nAfter', 0, 0, 'q')
    expect(next).toEqual({ value: '> q\n\nBefore\n\nAfter', caret: 5 })
    const middle = insertQuote('Hello world', 6, 6, 'q')
    expect(middle).toEqual({ value: 'Hello\n\n> q\n\nworld', caret: 12 })
    const atBreak = insertQuote('One\n\nTwo', 5, 5, 'q')
    expect(atBreak).toEqual({ value: 'One\n\n> q\n\nTwo', caret: 10 })
  })

  it('never overwrites selected composer text', () => {
    const next = insertQuote('keep this', 0, 4, 'q')
    expect(next.value).toBe('keep\n\n> q\n\nthis')
    // A reversed range behaves the same.
    expect(insertQuote('keep this', 4, 0, 'q')).toEqual(next)
  })

  it('moves the insertion point past a reference token it would split', () => {
    const refs = [{ label: 'Road map', uri: 'alma://thread/a', kind: 'thread' }]
    const next = insertQuote('Ask @Road map next', 8, 8, 'q', refs)
    expect(next.value).toBe('Ask @Road map\n\n> q\n\nnext')
    expect(next.value).toContain('@Road map')
  })

  it('steps past the longest reference at the caret, whatever the list order', () => {
    const road = { label: 'Road', uri: 'alma://thread/a', kind: 'thread' }
    const road2 = { label: 'Road 2', uri: 'alma://thread/b', kind: 'thread' }
    expect(
      insertQuote('@Road and @Road 2 end', 13, 13, 'q', [road, road2]).value,
    ).toBe('@Road and @Road 2\n\n> q\n\nend')
    // '@Roadster' is a plain word, not the 'Road' token.
    expect(insertQuote('@Roadster', 3, 3, 'q', [road]).value).toBe(
      '@Ro\n\n> q\n\nadster',
    )
  })

  it('keeps a quoted @label from taking over the draft reference on send', () => {
    const bob = { label: 'Bob', uri: 'alma://thread/b', kind: 'thread' }
    const next = insertQuote('see @Bob', 0, 0, 'ping @Bob please', [bob])
    expect(next.value).toBe('> ping Bob please\n\nsee @Bob')
    expect(materializeReferences(next.value, [bob])).toBe(
      '> ping Bob please\n\nsee @[Bob](alma://thread/b)',
    )
  })

  it('clamps an out-of-range caret and leaves the draft alone for blank text', () => {
    expect(insertQuote('Draft', 99, 99, 'q').value).toBe('Draft\n\n> q\n\n')
    expect(insertQuote('Draft', Number.NaN, Number.NaN, 'q').value).toBe(
      'Draft\n\n> q\n\n',
    )
    expect(insertQuote('Draft', 2, 2, ' \n ')).toEqual({
      value: 'Draft',
      caret: 2,
    })
  })

  it('quotes a whole message with references shown as their labels', () => {
    expect(
      quotableMessageText(
        'See @[Road map](alma://thread/a) and @[x](alma://file/b)',
      ),
    ).toBe('See Road map and x')
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
