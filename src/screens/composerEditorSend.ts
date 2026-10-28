export async function closeEditorAfterAcceptedSend(
  accepted: boolean | Promise<boolean>,
  close: () => void,
) {
  const didAccept = await accepted
  if (didAccept) close()
  return didAccept
}
