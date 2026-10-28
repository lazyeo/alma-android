import { describe, expect, it } from 'vitest'
import {
  transformUserFilePaths,
  type MarkdownNode,
} from './remarkUserFilePaths'

const paragraph = (...children: MarkdownNode[]): MarkdownNode => ({
  type: 'paragraph',
  children,
})

const root = (...children: MarkdownNode[]): MarkdownNode => ({
  type: 'root',
  children,
})

describe('transformUserFilePaths', () => {
  it('links conservative absolute paths in text and strips trailing punctuation', () => {
    const tree = root(
      paragraph({
        type: 'text',
        value:
          'Open /home/example/project/release-notes.md, not /api/threads/list or https://alma.now/a/b.txt.',
      }),
    )

    transformUserFilePaths(tree)

    expect(tree).toEqual(
      root(
        paragraph(
          { type: 'text', value: 'Open ' },
          {
            type: 'link',
            url: '/home/example/project/release-notes.md',
            children: [
              { type: 'text', value: '/home/example/project/release-notes.md' },
            ],
          },
          {
            type: 'text',
            value: ', not /api/threads/list or https://alma.now/a/b.txt.',
          },
        ),
      ),
    )
  })

  it('turns a whole inline-code path into a link while preserving inline code', () => {
    const tree = root(
      paragraph({
        type: 'inlineCode',
        value: '/tmp/alma-android-preview/alma-mobile.apk',
      }),
    )

    transformUserFilePaths(tree)

    expect(tree).toEqual(
      root(
        paragraph({
          type: 'link',
          url: '/tmp/alma-android-preview/alma-mobile.apk',
          data: { hProperties: { className: ['markdown-file-path'] } },
          children: [
            {
              type: 'inlineCode',
              value: '/tmp/alma-android-preview/alma-mobile.apk',
            },
          ],
        }),
      ),
    )
  })

  it('skips existing links, fenced code, regexes, and single-separator paths', () => {
    const tree = root(
      paragraph({
        type: 'link',
        url: 'https://example.com',
        children: [{ type: 'text', value: '/home/example/project/file.md' }],
      }),
      { type: 'code', value: '/home/example/project/file.md' },
      paragraph({ type: 'text', value: 'Regex /foo/bar/ and file /readme.md' }),
    )

    const original = structuredClone(tree)
    transformUserFilePaths(tree)
    expect(tree).toEqual(original)
  })

  it('supports Windows absolute paths without linking UNC paths', () => {
    const tree = root(
      paragraph({
        type: 'text',
        value: String.raw`Open C:\Users\x\report.docx but not C:\\server\share.txt`,
      }),
    )

    transformUserFilePaths(tree)

    expect(tree.children?.[0].children?.[1]).toMatchObject({
      type: 'link',
      url: String.raw`C:\Users\x\report.docx`,
    })
  })
})
