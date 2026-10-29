export function nextTerminalScrollTop(input: {
  previousScrollTop: number
  previousScrollHeight: number
  nextScrollHeight: number
  clientHeight: number
  prepending: boolean
  pinned: boolean
}) {
  if (input.prepending)
    return (
      input.previousScrollTop +
      Math.max(0, input.nextScrollHeight - input.previousScrollHeight)
    )
  if (input.pinned)
    return Math.max(0, input.nextScrollHeight - input.clientHeight)
  return input.previousScrollTop
}
