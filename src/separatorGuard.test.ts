import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const roots = [new URL('./', import.meta.url)]
const allowed = new Set(['screens/modelOptions.ts'])

function sourceFiles(root: URL) {
  const rootPath = root.pathname
  const files: string[] = []
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (
        ['.ts', '.tsx', '.js', '.mjs'].includes(extname(entry.name)) &&
        !/\.(test|spec)\.[^.]+$/.test(entry.name)
      )
        files.push(path)
    }
  }
  visit(rootPath)
  return files
}

describe('UI copy separators', () => {
  it('contains no middot separators in non-test source', () => {
    const offenders = roots.flatMap((root) =>
      sourceFiles(root).flatMap((path) => {
        const name = relative(root.pathname, path)
        // Incoming model names may contain a middot; this regex parses that external format.
        if (root === roots[0] && allowed.has(name)) return []
        return readFileSync(path, 'utf8').includes('·') ? [name] : []
      }),
    )
    expect(offenders).toEqual([])
  })
})
