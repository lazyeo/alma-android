export function createLongPress(action: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin = { x: 0, y: 0 }
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return {
    start(x: number, y: number) {
      cancel()
      origin = { x, y }
      timer = setTimeout(() => {
        timer = undefined
        action()
      }, 450)
    },
    move(x: number, y: number) {
      if (Math.hypot(x - origin.x, y - origin.y) > 8) cancel()
    },
    cancel,
  }
}
