// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installTextSelectionGuard, isSelectableTarget } from './textSelection'

function mount(html: string) {
  document.body.innerHTML = html
}

describe('text selection allowlist', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('allows editable fields and the selectable text view', () => {
    mount(`
      <textarea id="ta"></textarea>
      <input id="in" />
      <div contenteditable="true"><span id="ce">x</span></div>
      <div class="selectable-message"><p id="sel">x</p></div>
      <div class="markdown-file-content"><p id="md">x</p></div>
      <div class="file-diff"><code id="diff">+ added</code></div>
    `)
    for (const id of ['ta', 'in', 'ce', 'sel', 'md', 'diff'])
      expect(isSelectableTarget(document.getElementById(id))).toBe(true)
  })

  it('blocks buttons, rows and plain text', () => {
    mount(`
      <button id="stop"><svg><circle id="ring" /></svg></button>
      <div class="thread-row"><span id="title">T</span></div>
      <p id="plain">x</p>
    `)
    for (const id of ['stop', 'ring', 'title', 'plain'])
      expect(isSelectableTarget(document.getElementById(id))).toBe(false)
    expect(isSelectableTarget(null)).toBe(false)
    expect(isSelectableTarget(document.createTextNode('x'))).toBe(false)
  })

  it('treats a text node by its parent element', () => {
    mount(`<div class="selectable-message"><p id="p">hello</p></div>`)
    const text = document.getElementById('p')!.firstChild
    expect(isSelectableTarget(text)).toBe(true)
  })

  it('cancels native selectstart/contextmenu only outside the allowlist', () => {
    mount(`<button id="b">Stop</button><textarea id="t"></textarea>`)
    const uninstall = installTextSelectionGuard(document)
    const fire = (id: string, type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      document.getElementById(id)!.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(fire('b', 'selectstart')).toBe(true)
    expect(fire('b', 'contextmenu')).toBe(true)
    expect(fire('t', 'selectstart')).toBe(false)
    expect(fire('t', 'contextmenu')).toBe(false)
    uninstall()
    expect(fire('b', 'selectstart')).toBe(false)
  })
})
