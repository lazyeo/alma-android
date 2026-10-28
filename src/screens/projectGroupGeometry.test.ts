import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

it('aligns project children with the parent text column without a child indent', () => {
  expect(styles).toMatch(
    /\.project-thread-row \{[^}]*width: calc\(100% - 8px\);[^}]*margin: 1px 4px;[^}]*padding: 8px;/s,
  )
  expect(styles).toMatch(
    /\.project-new-action \{[^}]*width: calc\(100% - 8px\);[^}]*margin: 1px 4px;[^}]*padding: 8px;[^}]*padding-left: 8px;/s,
  )
})
