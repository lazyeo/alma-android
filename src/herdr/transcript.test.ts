import { describe, expect, it } from 'vitest'
import { cleanAgentText, parseAnsi, stripAnsi, toolView } from './transcript'

const ESC = '\u001b'

describe('parseAnsi', () => {
  it('turns SGR runs into styled segments and drops the escapes', () => {
    const segments = parseAnsi(
      `${ESC}[0m${ESC}[2m• ${ESC}[0mhello ${ESC}[1;38;2;255;255;255mwhite${ESC}[0m`,
    )
    expect(segments.map((s) => s.text).join('')).toBe('• hello white')
    expect(segments[0]).toEqual({ text: '• ', style: { dim: true } })
    expect(segments.at(-1)).toEqual({
      text: 'white',
      style: { bold: true, fg: 'rgb(255, 255, 255)' },
    })
  })

  it('handles 256-colour, background and non-SGR sequences', () => {
    const segments = parseAnsi(
      `${ESC}[48;2;74;77;84m${ESC}[38;5;196mx${ESC}[2K${ESC}]0;title\u0007y${ESC}[49;39mz`,
    )
    expect(segments).toEqual([
      { text: 'xy', style: { bg: 'rgb(74, 77, 84)', fg: 'rgb(255, 0, 0)' } },
      { text: 'z', style: {} },
    ])
  })

  it('stripAnsi leaves plain text for menu parsing', () => {
    expect(stripAnsi(`${ESC}[1m1. Yes${ESC}[0m\n2. No`)).toBe('1. Yes\n2. No')
  })
})

describe('cleanAgentText', () => {
  it('removes Codex memory citation blocks', () => {
    const text =
      '结论在这里。\n\n<oai-mem-citation>\n<citation_entries>\nMEMORY.md:47-48|note=[x]\n</citation_entries>\n<rollout_ids>\n01a0\n</rollout_ids>\n</oai-mem-citation>'
    expect(cleanAgentText(text)).toBe('结论在这里。')
  })
  it('removes an unterminated block while streaming', () => {
    expect(cleanAgentText('ok\n<oai-mem-citation>\n<citation')).toBe('ok')
  })
  it('keeps ordinary markup', () => {
    expect(cleanAgentText('use `<img>` tags')).toBe('use `<img>` tags')
  })
})

describe('toolView', () => {
  it('extracts Codex async questions with string options', () => {
    expect(
      toolView({
        name: 'request_user_input_async',
        input: { questions: [{ title: 'Pick one', options: ['A', 'B'] }] },
        result: '{"accepted":true}',
      }).questions,
    ).toEqual([
      { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
    ])
  })

  it('extracts structured question options', () => {
    expect(
      toolView({
        name: 'request_user_input',
        input: {
          questions: [
            {
              header: 'Test',
              question: 'Choose',
              options: [{ label: 'A', description: 'first' }],
            },
          ],
        },
      }).questions,
    ).toEqual([
      { question: 'Choose', options: [{ label: 'A', description: 'first' }] },
    ])
  })

  it('summarises Codex exec by its shell command', () => {
    expect(
      toolView({
        name: 'exec',
        input: {
          input:
            'text(await tools.exec_command({cmd:"npm run check \\"x\\"",yield_time_ms:1000}));\n',
        },
        result: 'Script completed',
      }),
    ).toMatchObject({
      name: 'exec',
      detail: 'npm run check "x"',
      result: 'Script completed',
    })
  })

  it('summarises Claude tools by command or path and flags errors', () => {
    expect(
      toolView({
        name: 'Bash',
        input: { command: 'ls -la\npwd', description: 'List' },
        is_error: true,
      }),
    ).toMatchObject({ detail: 'ls -la', error: true })
    expect(
      toolView({ name: 'Edit', input: { file_path: '/a/b.ts' } }).detail,
    ).toBe('/a/b.ts')
  })
})
