export const notifications = {
  // Same wording as remote notifications: the title names the thread, the
  // body says what happened.
  status: {
    approval: 'Needs your approval',
    question: 'Has a question for you',
    queued: 'Queued message sent',
    finished: 'Reply finished',
    agentNeedsYou: 'Agent needs you',
  },
  onDesktop: '{status} on {desktop}',
  channel: {
    name: 'Alma foreground alerts',
    description: 'Approvals, questions, and completed responses',
  },
} as const
