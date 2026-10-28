/** The selected text, only when the whole selection sits inside `root`. */
export function selectionTextWithin(
  selection:
    | (Pick<Selection, 'rangeCount' | 'isCollapsed' | 'toString'> & {
        anchorNode: Node | null
        focusNode: Node | null
      })
    | null,
  root: Node | null,
) {
  if (
    !selection ||
    !root ||
    selection.rangeCount === 0 ||
    selection.isCollapsed
  )
    return ''
  const { anchorNode, focusNode } = selection
  if (!anchorNode || !focusNode) return ''
  if (!root.contains(anchorNode) || !root.contains(focusNode)) return ''
  return selection.toString()
}
