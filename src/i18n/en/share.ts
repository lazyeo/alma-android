// Share: the Android share-sheet target page and its launcher shortcuts.
export const share = {
  title: 'Share to',
  close: 'Close share',
  searchPlaceholder: 'Search conversations',
  recent: 'Recent conversations',
  loading: 'Loading conversations…',
  desktopOffline: 'Desktop is offline',
  loadFailed: 'Could not load threads',
  noMatches: 'No conversations match your search.',
  questionPlaceholder: 'Add a question',
  sending: 'Sending…',
  newConversationOn: 'New conversation on {desktop}',
  desktopFallback: 'desktop',
  chooseDesktop: 'Choose desktop',
  chooseOnline: 'Choose an online desktop to continue.',
  failed: 'Could not share this. Your question is preserved.',
  nothingWaiting: 'Nothing is waiting to be shared.',
  backToThreads: 'Back to threads',
  newChatShortcut: 'New chat: {desktop}',
  // A thread's share-sheet label once more than one desktop is paired.
  threadOnDesktop: '{title} on {desktop}',
  readFailed: "Couldn't read what was shared: {reason}",
  nothingToSend: 'There is nothing to send. Add a question or share again.',
  // Sent as the message when only files were shared and no question typed.
  sharedFiles: 'Shared {names}',
  fileNameSeparator: ', ',
} as const
