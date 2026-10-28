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
  // Sent as the message when only files were shared and no question typed.
  sharedFiles: 'Shared {names}',
  fileNameSeparator: ', ',
} as const
