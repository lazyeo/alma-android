import { useCallback, useEffect, useRef, useState } from 'react'
import type { TunnelSocket } from '../../relay'
import { latestFrame } from '../remoteScreen/protocol'
import { reconnectDelay } from '../liveStream/reconnect'
import { createRtcViewer, type RtcViewer } from '../liveStream/rtcViewer'
import {
  decodeIabMessage,
  type IabClientMessage,
  type IabFrame,
  type IabInput,
  type IabPage,
  type IabTab,
  type PageSize,
} from './protocol'

export interface IabTunnel {
  openIabSocket(threadId: string): TunnelSocket
}

export interface IabStreamOptions {
  rtc?: boolean
  rtcTimeoutMs?: number
  /**
   * The desktop reports a status as soon as the socket opens; an open socket
   * that stays silent this long belongs to a desktop without the browser.
   */
  statusTimeoutMs?: number
}

/** Open sockets closed before any status, in a row, before giving up. */
export const SILENT_CLOSES_UNSUPPORTED = 3

const EMPTY_PAGE: IabPage = { url: '', title: '', loading: false }

export function useIabStream(
  tunnel: IabTunnel,
  threadId: string,
  {
    rtc = true,
    rtcTimeoutMs = 5_000,
    statusTimeoutMs = 6_000,
  }: IabStreamOptions = {},
) {
  const socketRef = useRef<TunnelSocket>()
  const openRef = useRef(false)
  const viewerRef = useRef<RtcViewer>()
  // Bumped to reopen the socket for the same thread.
  const [generation, setGeneration] = useState(0)
  const failures = useRef(0)
  const silentCloses = useRef(0)
  const [unsupported, setUnsupported] = useState(false)
  const [connected, setConnected] = useState(false)
  /** Undefined until the desktop's first status on this socket. */
  const [bound, setBound] = useState<boolean>()
  const [page, setPage] = useState<IabPage>(EMPTY_PAGE)
  const [tabs, setTabs] = useState<IabTab[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [viewport, setViewport] = useState<PageSize>()
  const [frame, setFrame] = useState<IabFrame>()
  const frameRef = useRef<IabFrame>()
  const [stream, setStream] = useState<MediaStream>()
  const videoLiveRef = useRef(false)
  const [videoLive, setVideoLive] = useState(false)
  const [rtcState, setRtcState] = useState('idle')
  const [error, setError] = useState('')

  const sendRaw = useCallback((value: IabClientMessage) => {
    if (!openRef.current) return
    socketRef.current?.send(JSON.stringify(value))
  }, [])

  /** Page input: the WebRTC data channel when open, else the socket. */
  const send = useCallback((value: IabInput) => {
    if (!openRef.current) return
    const raw = JSON.stringify(value)
    if (viewerRef.current?.sendInput(raw)) return
    socketRef.current?.send(raw)
  }, [])

  useEffect(() => {
    failures.current = 0
    silentCloses.current = 0
    setUnsupported(false)
  }, [tunnel, threadId])

  useEffect(() => {
    if (unsupported) return
    let disposed = false
    let paused = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let rtcTimer: ReturnType<typeof setTimeout> | undefined
    let statusTimer: ReturnType<typeof setTimeout> | undefined
    let rtcStarted = false
    let opened = false
    let heard = false
    // Frames are numbered per socket from 1: the first one of this socket
    // replaces whatever an earlier socket showed.
    let firstFrame = true
    const socket = tunnel.openIabSocket(threadId)
    socketRef.current = socket
    openRef.current = false
    setBound(undefined)
    setRtcState('idle')

    const clearVideo = () => {
      if (rtcTimer) clearTimeout(rtcTimer)
      rtcTimer = undefined
      setStream(undefined)
      videoLiveRef.current = false
      setVideoLive(false)
    }
    const viewer = createRtcViewer({
      send: sendRaw,
      onStream: (next) => {
        if (!disposed) setStream(next)
      },
      onState: (state) => {
        setRtcState(state)
        if (state === 'failed') clearVideo()
      },
      onError: setError,
    })
    viewerRef.current = viewer
    const stopRtc = () => {
      viewer.close()
      clearVideo()
    }
    // Like the official client: video once the first frame proves the page
    // streams, so a closed browser never sets up a peer.
    const startRtc = () => {
      if (!rtc || disposed || rtcStarted) return
      rtcStarted = true
      sendRaw({ type: 'rtc_start', relayOnly: false })
      rtcTimer = setTimeout(() => {
        if (videoLiveRef.current) return
        setRtcState('timeout')
        sendRaw({ type: 'rtc_stop' })
        stopRtc()
      }, rtcTimeoutMs)
    }
    const giveUp = () => {
      setUnsupported(true)
      socket.close()
    }

    const removeMessage = socket.onMessage((raw) => {
      if (disposed || typeof raw !== 'string') return
      const next = decodeIabMessage(raw)
      if (!next) return
      failures.current = 0
      switch (next.type) {
        case 'status':
          heard = true
          silentCloses.current = 0
          if (statusTimer) clearTimeout(statusTimer)
          setBound(next.bound)
          setPage({ url: next.url, title: next.title, loading: next.loading })
          setError(next.error ?? '')
          if (!next.bound) {
            frameRef.current = undefined
            setFrame(undefined)
          }
          break
        case 'page':
          setPage({ url: next.url, title: next.title, loading: next.loading })
          break
        case 'tabs':
          setTabs(next.tabs)
          setActiveTabId(next.activeId)
          break
        case 'viewport':
          setViewport({ width: next.width, height: next.height })
          break
        case 'frame': {
          const kept =
            firstFrame || !frameRef.current
              ? next
              : latestFrame(frameRef.current, next)
          firstFrame = false
          frameRef.current = kept
          setFrame(kept)
          setViewport((current) =>
            current &&
            current.width === kept.width &&
            current.height === kept.height
              ? current
              : { width: kept.width, height: kept.height },
          )
          startRtc()
          break
        }
        case 'error':
          setError(next.message)
          break
        case 'rtc':
          setRtcState(next.state)
          break
        case 'rtc_offer':
          clearVideo()
          void viewer.acceptOffer(next.sdp, next.iceServers)
          break
        case 'rtc_ice':
          viewer.addIce(next.candidate)
          break
      }
    })

    const reopen = (delay: number) => {
      if (disposed || paused || retryTimer) return
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        if (!disposed) setGeneration((value) => value + 1)
      }, delay)
    }
    const reconnectLater = () => {
      if (document.visibilityState !== 'visible') return
      reopen(reconnectDelay(failures.current++))
    }
    const removeClose = socket.onClose(() => {
      if (disposed) return
      if (statusTimer) clearTimeout(statusTimer)
      openRef.current = false
      setConnected(false)
      stopRtc()
      if (opened && !heard && !paused) {
        silentCloses.current += 1
        if (silentCloses.current >= SILENT_CLOSES_UNSUPPORTED) {
          giveUp()
          return
        }
      }
      reconnectLater()
    })
    void socket.opened
      .then(() => {
        if (disposed) return
        opened = true
        openRef.current = true
        setConnected(true)
        if (!heard) statusTimer = setTimeout(giveUp, statusTimeoutMs)
      })
      .catch((cause) => {
        if (disposed) return
        setError(cause instanceof Error ? cause.message : String(cause))
        reconnectLater()
      })
    // The stream stops in the background and resumes on return.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (paused) return
        paused = true
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = undefined
        if (statusTimer) clearTimeout(statusTimer)
        openRef.current = false
        setConnected(false)
        stopRtc()
        socket.close()
      } else if (paused) {
        paused = false
        failures.current = 0
        reopen(0)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (statusTimer) clearTimeout(statusTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      removeMessage()
      removeClose()
      stopRtc()
      socket.close()
      openRef.current = false
      if (socketRef.current === socket) socketRef.current = undefined
      if (viewerRef.current === viewer) viewerRef.current = undefined
    }
  }, [
    generation,
    rtc,
    rtcTimeoutMs,
    sendRaw,
    statusTimeoutMs,
    threadId,
    tunnel,
    unsupported,
  ])

  const markVideoFrame = useCallback(() => {
    if (videoLiveRef.current) return
    videoLiveRef.current = true
    setVideoLive(true)
  }, [])

  return {
    connected,
    unsupported,
    bound,
    page,
    tabs,
    activeTabId,
    viewport,
    frame,
    stream,
    videoLive,
    markVideoFrame,
    rtcState,
    error,
    send,
  }
}
