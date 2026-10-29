import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('.', import.meta.url)
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const FORBIDDEN_IMPORTS = [
  /ThreadScreen/,
  /^react-router(?:-dom)?$/,
  /DesktopContext/,
  /useConnection/,
  /(?:^|\/)relay(?:\/almaApi)?$/,
]

function sourceFiles(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name, directory)
    if (entry.isDirectory())
      return sourceFiles(new URL(`${entry.name}/`, directory))
    if (
      !SOURCE_EXTENSIONS.has(extname(entry.name)) ||
      entry.name.endsWith('.test.ts')
    )
      return []
    return [url.pathname]
  })
}

function imports(source: string): string[] {
  return Array.from(
    source.matchAll(
      /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    ),
    (match) => match[1],
  )
}

describe('shared message UI import boundary', () => {
  it('contains production modules', () => {
    expect(sourceFiles(ROOT).length).toBeGreaterThan(0)
  })

  it('does not import host or thread dependencies', () => {
    const violations = sourceFiles(ROOT).flatMap((file) =>
      imports(readFileSync(file, 'utf8'))
        .filter((specifier) =>
          FORBIDDEN_IMPORTS.some((forbidden) => forbidden.test(specifier)),
        )
        .map(
          (specifier) =>
            `${relative(ROOT.pathname, file)} imports ${JSON.stringify(specifier)}`,
        ),
    )

    expect(violations).toEqual([])
  })
})
