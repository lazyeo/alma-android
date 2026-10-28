import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import {
  aggregateFileWrites,
  classifyFileWrite,
  collectDeliveredResources,
  collectFallbackFileWrites,
  extractUserAttachments,
  relativeFileLocation,
  type FileWriteEntry,
} from './threadFiles'

const realFileWrites: FileWriteEntry[] = [
  {
    type: 'write',
    filePath: '/workspace/src/report.md',
    content: 'one\ntwo\nthree',
    bytesWritten: 13,
    previousContent: 'one',
    messageId: 'thread-1--subagent-task-1-1',
    toolCallId: 'write-1',
    timestamp: '2026-10-27T09:00:00.000Z',
  },
  {
    type: 'edit',
    filePath: '/workspace/src/report.md',
    oldString: 'two\nthree',
    newString: 'second',
    replaceAll: false,
    messageId: 'thread-1--subagent-task-1-2',
    toolCallId: 'edit-1',
    timestamp: '2026-10-27T10:00:00.000Z',
  },
  {
    type: 'write',
    filePath: '/workspace/README.md',
    content: 'hello\nworld',
    bytesWritten: 11,
    messageId: 'assistant-message',
    toolCallId: 'write-2',
    timestamp: '2026-10-27T08:00:00.000Z',
  },
]

const row = (
  id: string,
  role: string,
  parts: MessageRow['message']['parts'],
  metadata?: Record<string, unknown>,
): MessageRow => ({
  id,
  threadId: 'thread-1',
  message: { id, role, parts },
  metadata,
})

describe('thread file logic', () => {
  it('aggregates counts, rough line estimates, timestamps and sub-agent provenance', () => {
    expect(
      aggregateFileWrites(realFileWrites, 'thread-1', '/workspace'),
    ).toEqual([
      {
        filePath: '/workspace/src/report.md',
        relativePath: 'src/report.md',
        directory: 'src',
        writes: 1,
        edits: 1,
        additions: 4,
        deletions: 3,
        lastTimestamp: '2026-10-27T10:00:00.000Z',
        viaSubagent: true,
      },
      {
        filePath: '/workspace/README.md',
        relativePath: 'README.md',
        directory: '.',
        writes: 1,
        edits: 0,
        additions: 2,
        deletions: 0,
        lastTimestamp: '2026-10-27T08:00:00.000Z',
        viaSubagent: false,
      },
    ])
  })

  it('groups paths relative to exact and aliased workspace prefixes', () => {
    expect(relativeFileLocation('/workspace/src/a.ts', '/workspace')).toEqual({
      relativePath: 'src/a.ts',
      directory: 'src',
    })
    expect(
      relativeFileLocation(
        '/home/shared/Claude/projects/alma-app/mobile/src/a.ts',
        '/home/developer/Claude/projects/alma-app',
      ),
    ).toEqual({ relativePath: 'mobile/src/a.ts', directory: 'mobile/src' })
    expect(
      relativeFileLocation(
        '/home/shared/Claude/projects/alma-app/.worktrees/filediff/mobile/src/a.ts',
        '/home/developer/Claude/projects/alma-app',
      ),
    ).toEqual({
      relativePath: '.worktrees/filediff/mobile/src/a.ts',
      directory: '.worktrees/filediff/mobile/src',
    })
    expect(relativeFileLocation('/tmp/out.txt', '/workspace')).toEqual({
      relativePath: '/tmp/out.txt',
      directory: '/tmp',
    })
  })

  it('classifies edits, new files, overwrites and unversioned writes', () => {
    expect(classifyFileWrite(realFileWrites[1])).toBe('Edit')
    expect(classifyFileWrite(realFileWrites[0])).toBe('Overwrite')
    expect(classifyFileWrite(realFileWrites[2])).toBe(
      'Written (no previous version recorded)',
    )
    const versionedWrite = realFileWrites[0]
    if (versionedWrite.type !== 'write') throw new Error('expected write')
    expect(classifyFileWrite({ ...versionedWrite, previousContent: '' })).toBe(
      'New file',
    )
  })

  it('collects newest delivered resources across assistant rows and dedupes targets', () => {
    const rows = [
      row(
        'old',
        'assistant',
        [{ type: 'tool-Write', state: 'done', input: { file_path: 'a.md' } }],
        { endResources: [{ type: 'file', path: '/workspace/shared.md' }] },
      ),
      row('new', 'assistant', [], {
        endResources: [
          { type: 'file', path: '/workspace/shared.md' },
          { type: 'website', target: 'https://alma.now', title: 'Alma' },
        ],
      }),
    ]

    expect(collectDeliveredResources(rows, '/workspace')).toEqual([
      { type: 'file', path: '/workspace/shared.md' },
      { type: 'website', target: 'https://alma.now', title: 'Alma' },
      { type: 'file', path: '/workspace/a.md' },
    ])
  })

  it('derives fallback Write and Edit records without retaining content elsewhere', () => {
    const rows = [
      row('assistant-1', 'assistant', [
        {
          type: 'tool-Write',
          state: 'output-available',
          toolCallId: 'w1',
          input: { file_path: 'src/a.ts', content: 'a\nb' },
        },
        {
          type: 'tool-Edit',
          state: 'done',
          toolCallId: 'e1',
          input: {
            file_path: '/workspace/src/b.ts',
            old_string: 'old',
            new_string: 'new\nline',
            replace_all: true,
          },
        },
      ]),
    ]

    expect(collectFallbackFileWrites(rows, '/workspace')).toMatchObject([
      { type: 'write', filePath: '/workspace/src/a.ts', content: 'a\nb' },
      {
        type: 'edit',
        filePath: '/workspace/src/b.ts',
        oldString: 'old',
        newString: 'new\nline',
      },
    ])
  })

  it('collects and dedupes user attachments while preserving image metadata', () => {
    const rows = [
      row('user-1', 'user', [
        {
          type: 'image',
          url: '/api/gallery/cache/photo',
          filename: 'photo.png',
          mediaType: 'image/png',
        },
        {
          type: 'file',
          url: '/api/files/notes',
          filePath: '/workspace/notes.txt',
          filename: 'notes.txt',
        },
      ]),
      row('assistant-1', 'assistant', [
        { type: 'file', filePath: '/workspace/ignore.txt' },
      ]),
      row('user-2', 'user', [
        {
          type: 'image',
          url: '/api/gallery/cache/photo',
          filename: 'duplicate.png',
        },
      ]),
    ]

    expect(extractUserAttachments(rows)).toEqual([
      {
        kind: 'image',
        source: '/api/gallery/cache/photo',
        name: 'photo.png',
        mediaType: 'image/png',
      },
      {
        kind: 'file',
        source: '/workspace/notes.txt',
        name: 'notes.txt',
        mediaType: undefined,
      },
    ])
  })
})
