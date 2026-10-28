import type { RealtimeEvent, Thread } from '../relay'

export function shouldReloadThread(
  threadId: string,
  event: Pick<RealtimeEvent, 'type' | 'data'>,
): boolean {
  return event.type === 'thread_updated' && event.data?.id === threadId
}

export function applyThreadTitleEvent(
  threads: Thread[],
  event: Pick<RealtimeEvent, 'type' | 'data'>,
): Thread[] {
  if (!['title_generating', 'title_generated'].includes(event.type)) {
    return threads
  }

  const id = event.data?.id
  if (typeof id !== 'string' || !threads.some((thread) => thread.id === id)) {
    return threads
  }

  return threads.map((thread) => {
    if (thread.id !== id) return thread
    if (event.type === 'title_generated') {
      return {
        ...thread,
        title:
          typeof event.data?.title === 'string'
            ? event.data.title
            : thread.title,
        isGeneratingTitle: false,
      }
    }
    return {
      ...thread,
      isGeneratingTitle: Boolean(event.data?.isGeneratingTitle),
    }
  })
}
