import {
  navigationMotionRunning,
  reducedMotionPreferred,
} from '../motionTokens'

export type DetachedExitOptions = {
  /** Class that switches the surface onto its exit keyframes. */
  closingClass?: string
  /** Remove the copy after this long even if `animationend` never fires. */
  fallbackMs: number
}

type Snapshot = {
  scroll: Array<[index: number, top: number, left: number]>
  values: Array<[index: number, value: string]>
  canvases: Array<[index: number, canvas: HTMLCanvasElement]>
}

/** True when the surface has entrance/exit keyframes to play at all. */
export function hasExitMotion(node: Element) {
  const name = getComputedStyle(node).animationName
  return Boolean(name) && name !== 'none'
}

function snapshot(nodes: Element[]): Snapshot {
  const result: Snapshot = { scroll: [], values: [], canvases: [] }
  nodes.forEach((node, index) => {
    if (node.scrollTop || node.scrollLeft)
      result.scroll.push([index, node.scrollTop, node.scrollLeft])
    if (
      node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLSelectElement
    )
      result.values.push([index, node.value])
    else if (node instanceof HTMLCanvasElement)
      result.canvases.push([index, node])
  })
  return result
}

/**
 * An overlay that its owner unmounts (a picker row that sets the state
 * closing it) would vanish in one frame. Call this from the overlay's
 * layout-effect cleanup, while its DOM is still attached: if the node is
 * really leaving (not a StrictMode replay), an inert copy of its last frame
 * takes its place and plays the surface's own exit keyframes, then removes
 * itself. Nothing runs while a route or `/alma` transition owns the frame,
 * under reduced motion, or when the surface defines no motion.
 */
export function playDetachedExit(
  node: HTMLElement,
  { closingClass = 'closing', fallbackMs }: DetachedExitOptions,
) {
  const parent = node.parentNode
  if (
    !parent ||
    !node.isConnected ||
    navigationMotionRunning() ||
    reducedMotionPreferred() ||
    node.classList.contains(closingClass) ||
    !hasExitMotion(node)
  )
    return
  const next = node.nextSibling
  const state = snapshot([node, ...node.querySelectorAll('*')])
  queueMicrotask(() => {
    // Still attached: the cleanup was a StrictMode replay, not an unmount.
    if (node.isConnected || !parent.isConnected) return
    const ghost = node.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.setAttribute('inert', '')
    ghost.style.pointerEvents = 'none'
    ghost.classList.add(closingClass)
    parent.insertBefore(ghost, next && next.parentNode === parent ? next : null)
    const copies = [ghost, ...ghost.querySelectorAll('*')]
    for (const copy of copies) copy.removeAttribute('id')
    for (const [index, value] of state.values)
      (copies[index] as HTMLInputElement).value = value
    for (const [index, source] of state.canvases)
      (copies[index] as HTMLCanvasElement)
        .getContext('2d')
        ?.drawImage(source, 0, 0)
    for (const [index, top, left] of state.scroll) {
      copies[index].scrollTop = top
      copies[index].scrollLeft = left
    }
    let timer = 0
    const remove = () => {
      window.clearTimeout(timer)
      ghost.removeEventListener('animationend', onEnd)
      ghost.remove()
    }
    const onEnd = (event: AnimationEvent) => {
      if (event.target === ghost) remove()
    }
    ghost.addEventListener('animationend', onEnd)
    timer = window.setTimeout(remove, fallbackMs)
  })
}
