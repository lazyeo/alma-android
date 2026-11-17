import { describe, expect, it } from 'vitest'
import {
  fileAttachmentKind,
  fileExtensionLabel,
  formatBytes,
} from './fileAttachment'

describe('fileAttachmentKind', () => {
  it.each([
    ['plate.3mf', '3d'],
    ['bracket.STL', '3d'],
    ['mesh.obj', '3d'],
    ['housing.step', '3d'],
    ['housing.stp', '3d'],
    ['print.gcode', '3d'],
    ['backup.zip', 'archive'],
    ['bundle.7z', 'archive'],
    ['source.tar', 'archive'],
    ['source.tar.gz', 'archive'],
    ['legacy.RAR', 'archive'],
    ['report.pdf', 'document'],
    ['letter.docx', 'document'],
    ['notes.txt', 'document'],
    ['README.md', 'document'],
    ['main.ts', 'code'],
    ['App.tsx', 'code'],
    ['script.py', 'code'],
    ['config.json', 'code'],
    ['voice.m4a', 'audio'],
    ['clip.MOV', 'video'],
    ['mystery.bin', 'file'],
    ['Makefile', 'file'],
  ])('classifies %s by extension as %s', (name, kind) => {
    expect(fileAttachmentKind(name, 'application/octet-stream')).toBe(kind)
  })

  it.each([
    ['application/zip', 'archive'],
    ['application/x-7z-compressed', 'archive'],
    ['application/gzip', 'archive'],
    ['application/vnd.rar', 'archive'],
    ['model/stl', '3d'],
    ['model/3mf', '3d'],
    ['APPLICATION/PDF', 'document'],
    ['text/plain; charset=utf-8', 'document'],
    ['application/msword', 'document'],
    ['application/json', 'code'],
    ['text/javascript', 'code'],
    ['audio/ogg', 'audio'],
    ['video/mp4', 'video'],
    ['application/octet-stream', 'file'],
    ['', 'file'],
  ])(
    'classifies an extensionless file by media type %s as %s',
    (type, kind) => {
      expect(fileAttachmentKind('attachment', type)).toBe(kind)
    },
  )

  it('trusts the extension over a misleading media type', () => {
    // Android reports TypeScript sources as MPEG transport streams.
    expect(fileAttachmentKind('index.ts', 'video/mp2t')).toBe('code')
    expect(fileAttachmentKind('part.stl', 'text/plain')).toBe('3d')
  })

  it('falls back to the media type when the extension is unknown', () => {
    expect(fileAttachmentKind('export.data', 'application/zip')).toBe('archive')
  })
})

describe('fileExtensionLabel', () => {
  it('shows the last extension in upper case', () => {
    expect(fileExtensionLabel('plate.3mf')).toBe('3MF')
    expect(fileExtensionLabel('source.tar.gz')).toBe('GZ')
    expect(fileExtensionLabel('Report.Pdf')).toBe('PDF')
  })

  it('is empty when the name has no extension', () => {
    expect(fileExtensionLabel('Makefile')).toBe('')
    expect(fileExtensionLabel('.env')).toBe('')
    expect(fileExtensionLabel('trailing.')).toBe('')
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [5.25 * 1024 * 1024, '5.3 MB'],
  ])('formats %d bytes as %s', (size, label) => {
    expect(formatBytes(size)).toBe(label)
  })
})
