import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Guard: user-visible English must come from src/i18n, not TSX literals.
// It flags JSX text, copy-bearing attributes, and capitalised phrases in TSX.
const SRC = new URL('../', import.meta.url).pathname
// Synthetic desktop data for screenshots, and the catalogs themselves.
const EXCLUDED_DIRS = ['dev/', 'i18n/']
const COPY_ATTRIBUTES = new Set([
  'title',
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-roledescription',
  'placeholder',
  'alt',
  'label',
])
const LETTERS = /[A-Za-z]{2,}/
// A capitalised word, optionally followed by more words: "Delete", "Try again".
const PHRASE = /^[A-Z][a-z’']+(?:[\s-][\w’'…,.:;!?()/-]+)*[.!?…]?$/

// Every entry needs a reason; keep this list short and specific.
const ALLOWLIST: { file: string; text: string; reason: string }[] = [
  {
    file: 'App.tsx',
    text: 'Desktop is offline',
    reason:
      'Screenshot fixture reproduces the e2eSession transport error verbatim; raw transport errors are English diagnostics matched by humanConnectionError',
  },
  {
    file: 'screens/PairScreen.tsx',
    text: 'Alma',
    reason: 'Brand name heading on the pair screen',
  },
  {
    file: 'screens/PairScreen.tsx',
    text: 'alma://connect?u=…&k=…&e2e=1',
    reason: 'Pairing-link URL format sample; identical in every language',
  },
  {
    file: 'screens/StartScreen.tsx',
    text: 'Alma',
    reason: 'Brand name as the alt text of the Alma app icon',
  },
  {
    file: 'screens/TimelineRail.tsx',
    text: 'Alma',
    reason: 'Brand name labelling assistant replies in the timeline preview',
  },
  {
    file: 'screens/SettingsScreen.tsx',
    text: 'alma-relay-e2e/v1',
    reason: 'Wire protocol identifier shown verbatim in About',
  },
]

type Offender = { file: string; line: number; text: string }

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name)
      ? [path]
      : []
  })
}

// Developer diagnostics are never rendered.
function isConsoleArgument(node: ts.Node) {
  const parent = node.parent
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    ts.isIdentifier(parent.expression.expression) &&
    parent.expression.expression.text === 'console'
  )
}

// Thrown Error messages are diagnostics; screens map failures to catalog copy.
function isErrorConstructorArgument(node: ts.Node) {
  const parent = node.parent
  return (
    ts.isNewExpression(parent) &&
    ts.isIdentifier(parent.expression) &&
    /Error$/.test(parent.expression.text)
  )
}

function isNonCopyContext(node: ts.Node) {
  const parent = node.parent
  return (
    isConsoleArgument(node) ||
    isErrorConstructorArgument(node) ||
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isLiteralTypeNode(parent) ||
    ts.isCaseClause(parent) ||
    ts.isElementAccessExpression(parent) ||
    (ts.isBinaryExpression(parent) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.InKeyword,
      ].includes(parent.operatorToken.kind)) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent)) &&
      parent.name === node)
  )
}

function attributeName(node: ts.Node) {
  let current: ts.Node = node.parent
  while (
    ts.isJsxExpression(current) ||
    ts.isConditionalExpression(current) ||
    ts.isBinaryExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTemplateSpan(current)
  )
    current = current.parent
  return ts.isJsxAttribute(current) ? current.name.getText() : undefined
}

export function findHardcodedCopy(file: string, source: string): Offender[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const offenders: Offender[] = []
  const report = (node: ts.Node, text: string) =>
    offenders.push({
      file,
      line:
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1,
      text: text.trim(),
    })

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      if (LETTERS.test(node.text)) report(node, node.text)
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const attribute = attributeName(node)
      if (isNonCopyContext(node)) {
        // Comparisons, keys, and logs stay code even inside attributes.
      } else if (attribute !== undefined) {
        if (COPY_ATTRIBUTES.has(attribute) && LETTERS.test(node.text))
          report(node, node.text)
      } else if (PHRASE.test(node.text.trim())) report(node, node.text)
    } else if (ts.isTemplateExpression(node)) {
      const parts = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ]
      const attribute = attributeName(node)
      const copy =
        attribute !== undefined
          ? COPY_ATTRIBUTES.has(attribute) && parts.some((p) => LETTERS.test(p))
          : /\b[A-Za-z][a-z’']+\s+[A-Za-z][a-z’']+|^[A-Z][a-z’']+\s/.test(
              parts.join(' '),
            )
      if (copy) report(node, node.getText(sourceFile))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return offenders
}

function allowed(offender: Offender) {
  return ALLOWLIST.some(
    (entry) => entry.file === offender.file && entry.text === offender.text,
  )
}

describe('hardcoded English guard', () => {
  it('finds no user-visible English literals in app TSX', () => {
    const offenders = tsxFiles(SRC)
      .map((path) => relative(SRC, path))
      .filter((file) => !EXCLUDED_DIRS.some((dir) => file.startsWith(dir)))
      .flatMap((file) =>
        findHardcodedCopy(file, readFileSync(join(SRC, file), 'utf8')),
      )
      .filter((offender) => !allowed(offender))
      .map(({ file, line, text }) => `${file}:${line} ${JSON.stringify(text)}`)
    expect(offenders).toEqual([])
    // Parses every app TSX file; allow for a busy machine.
  }, 30_000)

  it('keeps every allowlist entry in use', () => {
    const stale = ALLOWLIST.filter(
      (entry) =>
        !findHardcodedCopy(
          entry.file,
          readFileSync(join(SRC, entry.file), 'utf8'),
        ).some((offender) => offender.text === entry.text),
    )
    expect(stale).toEqual([])
  })

  it('flags the shapes of hardcoded copy it is meant to catch', () => {
    const texts = (source: string) =>
      findHardcodedCopy('probe.tsx', source).map((offender) => offender.text)
    expect(texts('const a = <span>Hello world</span>')).toEqual(['Hello world'])
    expect(texts('const a = <button aria-label="Close sheet" />')).toEqual([
      'Close sheet',
    ])
    expect(texts("const a = <input placeholder={'Search'} />")).toEqual([
      'Search',
    ])
    expect(texts("setError('Could not save')")).toEqual(['Could not save'])
    expect(texts('const a = `Deleted ${n} threads`')).toHaveLength(1)
  })

  it('ignores code-shaped strings', () => {
    const texts = (source: string) =>
      findHardcodedCopy('probe.tsx', source).map((offender) => offender.text)
    expect(
      texts(
        [
          "import x from 'React'",
          "if (event.key === 'Enter') go()",
          'const a = <div className="settings-row Row" role="button" />',
          "const b = { Title: 1 }; b['Title']",
          "type T = 'Done' | 'Open'",
          "const c = <span>{t('common.cancel')}</span>",
          'const d = <span>{name} ✓</span>',
          "const e = <nav aria-label={kind === 'gtd' ? t('nav.gtd') : t('nav.threads')} />",
          "console.warn('Fold transition settings were not applied', error)",
          "throw new Error('Workspace path unavailable')",
        ].join('\n'),
      ),
    ).toEqual([])
  })
})
