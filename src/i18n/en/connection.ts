export const connection = {
  connectingTo: 'Connecting to {name}…',
  connectingDesktop: 'Connecting to desktop…',
  status: {
    online: 'Online',
    connecting: 'Connecting',
    offline: 'Offline',
    error: 'Connection error',
  },
  currentDesktop: 'Current desktop',
  transport: {
    lan: 'Connected over local network',
    relay: 'Connected over the internet relay',
  },
  relayUnreachable: "Can't reach the relay",
  desktopNotResponding: 'Desktop not responding',
  switcher: {
    label: 'Switch desktop',
    trigger: 'Desktop: {name}. Switch desktop',
    hint: 'Tap to choose a desktop, or swipe vertically to switch',
    item: '{name}, {status}',
    add: 'Add desktop',
  },
  // Stored as connection errors and matched back by relayFailureKindOf, so
  // each message must keep a fixed shape around its placeholder.
  relayFailure: {
    insecure:
      'This relay uses http://, which the app blocks. Use an https relay.',
    insecureShort: 'Relay is not https',
    unreachable: "Can't reach {host}. Check this phone's network or VPN.",
    desktopOffline:
      'The desktop is offline, or its pairing code changed. Make sure Alma is running there, then scan its current code.',
    blocked:
      '{host} is reachable but refused the connection. A proxy or VPN may be blocking WebSockets.',
    blockedShort: 'Connection blocked',
  },
  errors: {
    rejected:
      'The relay rejected the connection. Pair again if this continues.',
    unreachable: 'The service could not be reached. Try again.',
    timeout: 'The desktop did not respond. Try again.',
    generic: 'Something went wrong. Try again.',
  },
  // Friendly titles for failed relay requests (see screens/relayError.ts).
  relayError: {
    threadMissing: 'This conversation was deleted',
    threadMissingDetail: 'It is no longer available on this desktop.',
    auth: 'Reconnect this desktop',
    authDetail: 'Pair it again if the problem continues.',
    offline: 'Desktop is offline',
    offlineDetail: 'Try again when it reconnects.',
    timeout: 'Request timed out',
    timeoutDetail: 'Try again in a moment.',
    generic: 'Something went wrong',
    genericDetail: 'Try again.',
  },
  pair: {
    lede: 'Carry your desktop agent without putting your desktop in the cloud.',
    linkLabel: 'Pairing link',
    connecting: 'Connecting…',
    connect: 'Connect securely',
    scan: 'Scan QR',
    cancelScan: 'Cancel scan',
    encrypted: 'End-to-end encrypted',
    relayNeverSees: 'Your pairing code never reaches the relay.',
    cameraUnavailable: 'Camera unavailable',
    connectFailed: 'Could not connect',
    linkRequired: 'Paste an alma://connect pairing link',
    linkInvalid: 'This is not a valid E2E pairing link',
    relayUrlUnsupported: 'Unsupported relay URL',
    codeInvalid: 'Invalid connect code',
  },
} as const
