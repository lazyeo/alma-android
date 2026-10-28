// Single allowlist for native text selection. Everything else is chrome:
// a long press there belongs to our own gestures (hold-to-stop, row menus,
// message action sheet), never to the WebView's select/callout handlers.
// CSS in styles.css mirrors this list; the event guard covers the cases
// where Android WebView still starts a selection inside buttons or SVG.
const ALWAYS_SELECTABLE =
  'input, textarea, [contenteditable=""], [contenteditable="true"], .selectable-message, .markdown-file-content, .file-diff'
// With a mouse, drag-selecting message text is expected and harmless.
const FINE_POINTER_SELECTABLE = '.message'

function elementOf(target: EventTarget | Node | null): Element | null {
  if (!target || typeof (target as Node).nodeType !== 'number') return null
  const node = target as Node
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

export function isSelectableTarget(
  target: EventTarget | Node | null,
  finePointer = false,
): boolean {
  const element = elementOf(target)
  if (!element) return false
  if (element.closest(ALWAYS_SELECTABLE)) return true
  return finePointer && Boolean(element.closest(FINE_POINTER_SELECTABLE))
}

export function installTextSelectionGuard(doc: Document = document) {
  const fine = () =>
    doc.defaultView?.matchMedia?.('(pointer: fine)').matches ?? false
  const guard = (event: Event) => {
    if (!isSelectableTarget(event.target, fine())) event.preventDefault()
  }
  // Capture phase so it runs before anything can start a selection, but
  // only the native default is cancelled; React handlers still receive it.
  doc.addEventListener('selectstart', guard, true)
  doc.addEventListener('contextmenu', guard, true)
  return () => {
    doc.removeEventListener('selectstart', guard, true)
    doc.removeEventListener('contextmenu', guard, true)
  }
}
