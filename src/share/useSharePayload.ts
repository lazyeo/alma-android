import { useEffect, useState } from 'react'
import {
  consumeNativePendingShare,
  getNativePendingShare,
  subscribeNativeShares,
} from '../nativeBridge'
import { normalizeSharePayload, type SharePayload } from './shareLogic'

let currentPayload: SharePayload | undefined
const listeners = new Set<(payload: SharePayload | undefined) => void>()

function publish(payload: SharePayload | undefined) {
  currentPayload = payload
  for (const listener of listeners) listener(payload)
}

export function setSharePayloadForFixture(payload: SharePayload | undefined) {
  publish(payload)
}

export function useSharePayload() {
  const [payload, setPayload] = useState(currentPayload)
  useEffect(() => {
    listeners.add(setPayload)
    return () => {
      listeners.delete(setPayload)
    }
  }, [])
  return {
    payload,
    clear() {
      publish(undefined)
      void consumeNativePendingShare()
    },
  }
}

export function installShareIntake(onShare: () => void) {
  let disposed = false
  let unsubscribe = () => undefined
  const accept = (value: unknown) => {
    const payload = normalizeSharePayload(value)
    if (!payload || disposed) return
    publish(payload)
    onShare()
  }
  void getNativePendingShare().then(accept)
  void subscribeNativeShares(accept).then((remove) => {
    if (disposed) remove()
    else unsubscribe = remove
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
