import { describe, expect, it } from 'vitest'
import {
  deriveEndResources,
  endResourceLocation,
  endResourceSubtitle,
  parseEndResources,
} from './endResources'

const realResourceFixtures = [
  [
    {
      type: 'file',
      path: '/tmp/alma-android-preview/alma-android-preview.apk',
    },
  ],
  [
    {
      type: 'file',
      path: '/home/example/.config/alma/memory/2026-10-27.md',
      description: 'Memory note',
    },
  ],
  [
    { type: 'file', path: '/home/example/project/preview-samples/report.docx' },
    { type: 'file', path: '/home/example/project/preview-samples/data.xlsx' },
    { type: 'file', path: '/home/example/project/preview-samples/slides.pptx' },
    { type: 'file', path: '/home/example/project/preview-samples/preview.png' },
  ],
]

describe('parseEndResources', () => {
  it('accepts defensive file and website shapes from metadata', () => {
    expect(parseEndResources(realResourceFixtures.flat())).toEqual(
      realResourceFixtures.flat(),
    )
    expect(
      parseEndResources([
        null,
        {},
        { type: 'file', path: '' },
        { type: 'website', target: 'not a url' },
        { type: 'website', target: 'http://' },
        { type: 'website', target: 'ftp://example.com/file' },
        {
          type: 'website',
          target: 'https://alma.now/',
          title: 'Alma',
          description: 'Website preview',
        },
      ]),
    ).toEqual([
      {
        type: 'website',
        target: 'https://alma.now/',
        title: 'Alma',
        description: 'Website preview',
      },
    ])
  })
})

describe('deriveEndResources', () => {
  it('merges explicit resources before completed Write/Edit paths and dedupes', () => {
    expect(
      deriveEndResources(
        {
          parts: [
            {
              type: 'tool-Write',
              state: 'output-available',
              input: { file_path: 'preview-samples/report.docx' },
              output: {
                file_path: '/home/example/project/preview-samples/report.docx',
              },
            },
            {
              type: 'tool-Edit',
              state: 'done',
              input: { file_path: 'preview-samples/notes.md' },
            },
            {
              type: 'tool-Write',
              state: 'input-available',
              input: { file_path: 'unfinished.txt' },
            },
          ],
          metadata: {
            endResources: [
              {
                type: 'file',
                path: '/home/example/project/preview-samples/report.docx',
                description: 'Final report',
              },
              { type: 'website', target: 'https://alma.now/' },
            ],
          },
        },
        '/home/example/project',
      ),
    ).toEqual([
      {
        type: 'file',
        path: '/home/example/project/preview-samples/report.docx',
        description: 'Final report',
      },
      { type: 'website', target: 'https://alma.now/' },
      {
        type: 'file',
        path: '/home/example/project/preview-samples/notes.md',
      },
    ])
  })

  it('drops relative tool paths when the workspace is unavailable', () => {
    expect(
      deriveEndResources(
        {
          parts: [
            {
              type: 'tool-Write',
              state: 'done',
              input: { file_path: 'preview.txt' },
            },
          ],
        },
        undefined,
      ),
    ).toEqual([])
  })
})

describe('card presentation', () => {
  it('derives extension subtitles and location badges', () => {
    expect(endResourceSubtitle('/tmp/app.apk')).toBe('APK document')
    expect(endResourceSubtitle('/project/report.docx')).toBe('DOCX document')
    expect(endResourceSubtitle('/project/data.xlsx')).toBe('XLSX spreadsheet')
    expect(endResourceSubtitle('/project/slides.pptx')).toBe(
      'PPTX presentation',
    )
    expect(endResourceSubtitle('/project/preview.png')).toBe('PNG image')
    expect(endResourceSubtitle('/project/bundle.zip')).toBe('ZIP archive')

    expect(endResourceLocation('/tmp/app.apk', '/home/example/project')).toBe(
      'temp',
    )
    expect(
      endResourceLocation(
        '/home/example/project/preview-samples/report.docx',
        '/home/example/project',
      ),
    ).toBe('project')
    expect(
      endResourceLocation(
        '/home/example/.config/alma/memory/2026-10-27.md',
        '/home/example/project',
      ),
    ).toBe('global')
  })
})
