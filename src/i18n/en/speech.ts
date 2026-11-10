// Voice input: the composer mic, the dictation sheet and Settings → Voice input.
export const speech = {
  mic: 'Voice input',
  engine: {
    custom: 'Custom endpoint',
  },
  sheet: {
    title: 'Voice input',
    starting: 'Getting ready…',
    speakNow: 'Start speaking',
    listening: 'Listening',
    transcribing: 'Transcribing…',
    finishing: 'Finishing…',
    elapsed: 'Recording time',
    level: 'Input level',
    stop: 'Stop',
    openSettings: 'Open voice settings',
    insertHeard: 'Insert what was heard',
    send: 'Send',
    edit: 'Edit',
    fallback: {
      network: '{from} couldn’t connect, now using {to}',
      auth: '{from} rejected the key, now using {to}',
      timeout: '{from} took too long, now using {to}',
      server: '{from} had a problem, now using {to}',
      empty: '{from} heard nothing, now using {to}',
    },
  },
  hold: {
    send: 'Release to send',
    insert: 'Release to put it in the input box',
    cancel: 'Slide up to cancel',
    edit: 'Slide left to edit',
  },
  notice: {
    short: 'Too short to send, so it went into the input box.',
    draft: 'Added after what you had typed. Send it when ready.',
  },
  errors: {
    setup:
      'The custom endpoint needs a base URL and a model. Set them in voice settings.',
    needs_key:
      'Voice input needs an API key for {engine}. Add one in voice settings.',
    mic_denied:
      'Alma can’t use the microphone. Allow microphone access for Alma in Android settings, then try again.',
    auth: 'The speech service rejected the API key. Check the key in voice settings.',
    rate_limited:
      'The speech service is busy or out of quota. Wait a moment and try again.',
    network:
      'Couldn’t reach the speech service. Check your connection and try again.',
    timeout: 'The speech service took too long to answer. Try again.',
    server: 'The speech service had a problem. Try again in a moment.',
    bad_request:
      'The speech service couldn’t use this request. Check the model in voice settings.',
    host_not_allowed:
      'The saved key isn’t allowed for this endpoint. Enter the key again in voice settings.',
    busy: 'The microphone is already in use. Try again in a moment.',
    empty: 'No speech was heard. Try again and speak a little longer.',
    unknown: 'Voice input stopped unexpectedly. Try again.',
  },
  settings: {
    title: 'Voice input',
    note: 'Speech goes to the provider you pick. API keys stay in Android’s secure storage on this phone.',
    engine: 'Engine',
    key: {
      title: 'API key',
      notSet: 'Not set',
      set: 'Set',
      sheetTitle: 'API key for {engine}',
      label: 'API key',
      hint: 'Saved only on this phone and sent only to {host}.',
      delete: 'Delete key',
      saveFailed: 'Couldn’t save the key. Try again.',
      deleteFailed: 'Couldn’t delete the key. Try again.',
      statusFailed: 'Couldn’t read the saved key.',
    },
    model: 'Model',
    custom: {
      title: 'Custom endpoint',
      notSet: 'Not set',
      baseUrl: 'Base URL',
      baseUrlPlaceholder: 'https://example.com/v1',
      model: 'Model',
      modelPlaceholder: 'whisper-1',
      hint: 'An OpenAI-compatible transcription API.',
      invalidUrl: 'Use an https address.',
      keyCleared:
        'The endpoint changed, so the saved key was removed. Enter the key again.',
    },
    terms: {
      title: 'Terms',
      count: { one: '{count} term', other: '{count} terms' },
      label: 'Terms',
      hint: 'One per line. Names and jargon you say often make recognition much more accurate.',
      reset: 'Reset to defaults',
    },
    mic: {
      title: 'Allow microphone',
      hint: 'Needed to record your voice.',
      denied:
        'Microphone access is off. Allow it for Alma in Android settings.',
      failed: 'Couldn’t ask for microphone access.',
    },
    test: {
      title: 'Test',
      hint: 'Records {seconds} seconds and shows what was recognised.',
      recording: 'Recording for {seconds} seconds. Say a sentence.',
      result: 'Recognised',
    },
    engines: {
      title: 'Engines',
      hint: 'The first engine on is used; if it fails (network, key, timeout, server error or no text), the next ones take over with the same recording. Drag to reorder; tap an engine to set it up.',
      primary: 'Primary',
      fallback: 'Fallback {position}',
      off: 'Off',
      notSetUp: 'Not set up',
      noKey: 'No API key',
      reorder: 'Reorder {engine}',
      toggle: 'Use {engine}',
    },
    release: {
      alma: 'Alma chat: after release',
      herdr: 'Herdr agents: after release',
      send: 'Send',
      insert: 'Put in the input box',
      hint: 'Holding the mic and letting go does this. Slide left to edit instead, or up to cancel.',
    },
    saveFailed: 'Couldn’t save voice settings.',
  },
} as const
