import { describe, expect, it } from 'vitest'
import type { UploadedAttachment } from './messageParts'
import {
  addQueuedMessage,
  combineQueuedMessages,
  commitQueuedMessageEdit,
  editQueuedMessage,
  idleQueueShouldAutoSend,
  listQueuedThreads,
  loadThreadQueue,
  loadThreadQueueState,
  moveQueuedMessage,
  moveQueuedMessageToIndex,
  queueDragTargetIndex,
  removeQueuedMessage,
  restoreFailedSteer,
  saveThreadQueue,
  type QueueStorage,
} from './threadQueue'

class MemoryStorage implements QueueStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

const file: UploadedAttachment = {
  kind: 'file',
  name: 'notes.txt',
  mediaType: 'text/plain',
  filePath: '/desktop/notes.txt',
  previewUrl: 'blob:must-not-persist',
}

describe('thread queue mutations', () => {
  it('adds, edits, and removes queued messages', () => {
    const first = addQueuedMessage([], ' alpha ', [file], 10, 'q-1')
    expect(first[0]).toMatchObject({
      id: 'q-1',
      content: 'alpha',
      timestamp: 10,
    })
    expect(first[0].attachedFiles[0]).not.toHaveProperty('previewUrl')

    const edited = editQueuedMessage(first, 'q-1', ' revised ')
    expect(edited[0].content).toBe('revised')
    expect(removeQueuedMessage(edited, 'q-1')).toEqual([])
  })

  it('reverts an empty text edit unless attachments keep the item valid', () => {
    const textOnly = addQueuedMessage([], 'keep me', [], 10, 'q-1')
    expect(commitQueuedMessageEdit(textOnly, 'q-1', '   ')).toBe(textOnly)

    const withFile = addQueuedMessage([], 'caption', [file], 11, 'q-2')
    expect(commitQueuedMessageEdit(withFile, 'q-2', '   ')[0].content).toBe('')
  })

  it('moves a queued message before or after another item', () => {
    const queue = ['a', 'b', 'c'].map((id, index) => ({
      id,
      content: id,
      attachedFiles: [],
      timestamp: index,
    }))

    expect(
      moveQueuedMessage(queue, 'c', 'a', false).map((item) => item.id),
    ).toEqual(['c', 'a', 'b'])
    expect(
      moveQueuedMessage(queue, 'a', 'b', true).map((item) => item.id),
    ).toEqual(['b', 'a', 'c'])
    expect(
      moveQueuedMessageToIndex(queue, 'a', 2).map((item) => item.id),
    ).toEqual(['b', 'c', 'a'])
    expect(
      moveQueuedMessageToIndex(queue, 'c', -20).map((item) => item.id),
    ).toEqual(['c', 'a', 'b'])
  })

  it('computes the insertion slot from row midpoints and clamps edges', () => {
    const midpoints = [20, 60, 100, 140]
    expect(queueDragTargetIndex(-40, midpoints)).toBe(0)
    expect(queueDragTargetIndex(19, midpoints)).toBe(0)
    expect(queueDragTargetIndex(20, midpoints)).toBe(1)
    expect(queueDragTargetIndex(99, midpoints)).toBe(2)
    expect(queueDragTargetIndex(400, midpoints)).toBe(4)
  })

  it('combines non-empty content and all attachments for one send', () => {
    const combined = combineQueuedMessages([
      { id: 'a', content: 'one', attachedFiles: [], timestamp: 1 },
      { id: 'b', content: '  ', attachedFiles: [file], timestamp: 2 },
      { id: 'c', content: 'three', attachedFiles: [], timestamp: 3 },
    ])

    expect(combined.content).toBe('one\n\nthree')
    expect(combined.attachments).toEqual([file])
  })

  it('restores a failed steer at its original position', () => {
    const queue = ['a', 'b', 'c'].map((id, index) => ({
      id,
      content: id,
      attachedFiles: [],
      timestamp: index,
    }))
    const withoutB = removeQueuedMessage(queue, 'b')

    expect(
      restoreFailedSteer(withoutB, queue[1], 1).map((item) => item.id),
    ).toEqual(['a', 'b', 'c'])
  })
})

describe('thread queue idle flush guard', () => {
  const ready = {
    generating: false,
    autoSendWhenIdle: true,
    queueLength: 2,
    online: true,
    socketReady: true,
    alreadySending: false,
    editingQueuedItem: false,
  }

  it.each(['remount load', 'reconnect snapshot', 'foreground', 'finish edge'])(
    'flushes after %s whenever persisted intent observes an idle thread',
    () => expect(idleQueueShouldAutoSend(ready)).toBe(true),
  )

  it('keeps the queue while the desktop is offline', () => {
    expect(idleQueueShouldAutoSend({ ...ready, online: false })).toBe(false)
  })

  it('waits for a ready socket', () => {
    expect(idleQueueShouldAutoSend({ ...ready, socketReady: false })).toBe(
      false,
    )
  })

  it('guards an already-started send including StrictMode reruns', () => {
    expect(idleQueueShouldAutoSend({ ...ready, alreadySending: true })).toBe(
      false,
    )
  })

  it('waits until inline queue editing is committed', () => {
    expect(idleQueueShouldAutoSend({ ...ready, editingQueuedItem: true })).toBe(
      false,
    )
  })

  it('does not flush without persisted auto-send intent', () => {
    expect(idleQueueShouldAutoSend({ ...ready, autoSendWhenIdle: false })).toBe(
      false,
    )
  })
})

describe('thread queue persistence', () => {
  it('scopes queues per desktop and thread and strips preview URLs', () => {
    const storage = new MemoryStorage()
    const queue = addQueuedMessage([], 'hello', [file], 10, 'q-1')
    saveThreadQueue(storage, 'desktop-a', 'thread-1', queue, true)
    saveThreadQueue(
      storage,
      'desktop-b',
      'thread-1',
      addQueuedMessage([], 'other'),
    )

    expect(loadThreadQueue(storage, 'desktop-a', 'thread-1')[0]).toEqual({
      id: 'q-1',
      content: 'hello',
      attachedFiles: [
        {
          kind: 'file',
          name: 'notes.txt',
          mediaType: 'text/plain',
          filePath: '/desktop/notes.txt',
        },
      ],
      timestamp: 10,
    })
    expect(loadThreadQueue(storage, 'desktop-b', 'thread-1')[0].content).toBe(
      'other',
    )
    expect(
      loadThreadQueueState(storage, 'desktop-a', 'thread-1'),
    ).toMatchObject({ autoSendWhenIdle: true })
    expect(
      loadThreadQueueState(storage, 'desktop-b', 'thread-1'),
    ).toMatchObject({ autoSendWhenIdle: false })
    expect(listQueuedThreads(storage, 'desktop-a')).toEqual([
      { threadId: 'thread-1', count: 1 },
    ])
  })

  it('removes empty queues and tolerates corrupt storage', () => {
    const storage = new MemoryStorage()
    storage.setItem('alma-mobile.thread-queues.v1', '{bad json')
    expect(loadThreadQueue(storage, 'desktop-a', 'thread-1')).toEqual([])

    saveThreadQueue(
      storage,
      'desktop-a',
      'thread-1',
      addQueuedMessage([], 'hello'),
    )
    saveThreadQueue(storage, 'desktop-a', 'thread-1', [])
    expect(loadThreadQueue(storage, 'desktop-a', 'thread-1')).toEqual([])
  })
})
