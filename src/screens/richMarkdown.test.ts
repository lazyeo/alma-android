import { expect, it } from 'vitest'
import { guardCurrency, closedFence } from './richMarkdown'

it('keeps currency literal while preserving math and code', () => {
  expect(guardCurrency('Pay $5 and $10; $x + 1$; $2+2$')).toBe(
    'Pay \\$5 and \\$10; $x + 1$; $2+2$',
  )
  expect(guardCurrency('`$5`\n```js\n$5\n```\n$$x$$')).toBe(
    '`$5`\n```js\n$5\n```\n$$x$$',
  )
  expect(guardCurrency('Already \\$5')).toBe('Already \\$5')
})
it('only renders completed matching fences, including tilde fences', () => {
  expect(closedFence('```mermaid\ngraph TD\n```')).toBe(true)
  expect(closedFence('~~~mermaid\ngraph TD\n~~~')).toBe(true)
  expect(closedFence('```mermaid\ngraph TD')).toBe(false)
  expect(closedFence('````mermaid\ngraph TD\n```')).toBe(false)
})

it('preserves Markdown code contexts exactly while guarding surrounding currency', () => {
  const code = [
    '    echo "$1"',
    '    echo "$2"',
    '',
    '\techo "$3"',
    '',
    '>     echo "$4"',
    '',
    '- Shell:',
    '',
    '      echo "$5"',
    '',
    '``Use `$6` here`` and `multi\n$7`',
    '',
    '~~~sh',
    'echo "$8"',
    '~~~',
  ].join('\n')
  expect(guardCurrency(`${code}\n\nPay $9 and $10.`)).toBe(
    `${code}\n\nPay \\$9 and \\$10.`,
  )
  // Indentation alone does not start code inside an existing paragraph.
  expect(guardCurrency('Pay\n    $11 today.')).toBe('Pay\n    \\$11 today.')
})
