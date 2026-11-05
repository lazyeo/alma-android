import { useCallback, useEffect, useRef, useState } from 'react'
import type { RelayTunnel, TunnelSocket } from '../../relay'
import {
  decodeScreenMessage,
  latestFrame,
  type ScreenClientMessage,
  type ScreenFrame,
  type ScreenServerMessage,
  type ScreenStatus,
  type ScreenWindow,
} from './protocol'
import { screenPath } from './screenTargets'
import { isFrameStalled } from './liveness'

interface ScreenTunnel {
  openWebSocket: Pick<RelayTunnel, 'openWebSocket'>['openWebSocket']
}

export interface RemoteScreenOptions {
  rtc?: boolean
  displayId?: number
  /** Streams one app window instead of the display (macOS desktops). */
  windowId?: number
  rtcTimeoutMs?: number
}

/**
 * Whether to ask the desktop for WebRTC video. The desktop's video track is
 * the display (its window source is only picked when the window is already
 * known, which it is not yet when `rtc_start` arrives), so a window target
 * stays on the JPEG frames, which the desktop crops to the window. Once the
 * window closes the desktop shows the display again, so video can start.
 */
export function wantsVideo({
  rtc,
  windowId,
  windowClosed = false,
}: {
  rtc: boolean
  windowId?: number
  windowClosed?: boolean
}) {
  return rtc && (windowId === undefined || windowClosed)
}

/**
 * Waits before reopening a socket the desktop or the network closed, by
 * consecutive failure. A target switch or a return to the app reopens at once.
 */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]

export const reconnectDelay = (failures: number) =>
  RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)]

export interface ScreenWindowList {
  windows: ScreenWindow[]
  error?: string
}

export function useRemoteScreen(
  tunnel: ScreenTunnel,
  {
    rtc = true,
    displayId,
    windowId,
    rtcTimeoutMs = 5_000,
  }: RemoteScreenOptions = {},
) {
  const socketRef = useRef<TunnelSocket>()
  const peerRef = useRef<RTCPeerConnection>()
  const streamRef = useRef<MediaStream>()
  // Control is the user's choice for this desktop: it outlives sockets, so
  // target switches and reconnects keep it. Only the user, another desktop,
  // or the desktop refusing to stream turns it off.
  const controlRef = useRef(false)
  const [control, setControlState] = useState(false)
  /** Counts the times the desktop ended control, for a visible notice. */
  const [controlRevoked, setControlRevoked] = useState(0)
  // Bumped to reopen the socket for the same target.
  const [generation, setGeneration] = useState(0)
  const failures = useRef(0)
  const [message, setMessage] = useState<ScreenServerMessage>()
  // The latest status survives the frames that follow it.
  const [status, setStatus] = useState<ScreenStatus>()
  const [windowList, setWindowList] = useState<ScreenWindowList>()
  const [frame, setFrame] = useState<ScreenFrame>()
  const frameRef = useRef<ScreenFrame>()
  // A new socket (another target, or a reconnect) keeps showing the last
  // picture until its own first frame arrives.
  const switchingRef = useRef(false)
  const [switching, setSwitchingState] = useState(false)
  const setSwitching = useCallback((value: boolean) => {
    switchingRef.current = value
    setSwitchingState(value)
  }, [])
  const [stream, setStream] = useState<MediaStream>()
  const [connected, setConnected] = useState(false)
  const [rtcState, setRtcState] = useState('idle')
  const [error, setError] = useState('')
  // A WebRTC track can arrive without ever delivering a frame (e.g. the Mac
  // display is asleep), so video only counts once a frame has been decoded.
  const videoLiveRef = useRef(false)
  const [videoLive, setVideoLive] = useState(false)
  const lastFrameAt = useRef<number>()
  const [stalled, setStalled] = useState(false)

  const send = useCallback((value: ScreenClientMessage) => {
    socketRef.current?.send(JSON.stringify(value))
  }, [])
  const setControl = useCallback((enabled: boolean) => {
    controlRef.current = enabled
    setControlState(enabled)
  }, [])
  const sendControl = useCallback(
    (value: ScreenClientMessage) => {
      if (!controlRef.current) return
      // Until the new target's first frame, the picture is the old one: a
      // tap or scroll would land somewhere else on the new target.
      if (
        switchingRef.current &&
        (value.type === 'pointer' || value.type === 'scroll')
      )
        return
      send(value)
    },
    [send],
  )

  useEffect(() => {
    controlRef.current = false
    setControlState(false)
    failures.current = 0
  }, [tunnel])

  useEffect(() => {
    let disposed = false
    // Closed on purpose while the app is in the background.
    let paused = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let rtcTimer: ReturnType<typeof setTimeout> | undefined
    let rtcStarted = false
    // The desktop numbers frames per socket, from 1: the first frame of this
    // socket replaces whatever an earlier socket showed, whatever its `seq`.
    let firstFrame = true
    const path = screenPath({ displayId, windowId })
    const socket = tunnel.openWebSocket(path)
    socketRef.current = socket
    setSwitching(frameRef.current !== undefined)
    setStatus(undefined)
    setWindowList(undefined)
    setRtcState('idle')
    const stopRtc = () => {
      if (rtcTimer) clearTimeout(rtcTimer)
      rtcTimer = undefined
      peerRef.current?.close()
      peerRef.current = undefined
      streamRef.current = undefined
      setStream(undefined)
      videoLiveRef.current = false
      setVideoLive(false)
    }
    const startRtc = () => {
      if (disposed || rtcStarted) return
      rtcStarted = true
      send({ type: 'rtc_start' })
      rtcTimer = setTimeout(() => {
        if (!videoLiveRef.current) {
          setRtcState('timeout')
          send({ type: 'rtc_stop' })
          stopRtc()
        }
      }, rtcTimeoutMs)
    }
    const removeMessage = socket.onMessage((raw) => {
      if (disposed || typeof raw !== 'string') return
      const next = decodeScreenMessage(raw)
      if (!next) return
      setMessage(next)
      failures.current = 0
      if (next.type === 'status') {
        setStatus(next)
        if (!next.bound && controlRef.current) {
          setControl(false)
          setControlRevoked((count) => count + 1)
        }
        if (wantsVideo({ rtc, windowId, windowClosed: next.windowClosed }))
          startRtc()
      }
      if (next.type === 'windows')
        setWindowList({ windows: next.windows, error: next.error })
      if (next.type === 'frame') {
        lastFrameAt.current = Date.now()
        setStalled(false)
        const kept =
          firstFrame || !frameRef.current
            ? next
            : latestFrame(frameRef.current, next)
        if (firstFrame) setSwitching(false)
        firstFrame = false
        frameRef.current = kept
        setFrame(kept)
      }
      if (next.type === 'error') setError(next.message)
      if (next.type === 'rtc') setRtcState(next.state)
      if (next.type === 'rtc_offer') {
        void (async () => {
          try {
            stopRtc()
            const peer = new RTCPeerConnection({
              iceServers: next.iceServers,
            })
            peerRef.current = peer
            peer.ontrack = (event) => {
              const nextStream =
                event.streams[0] ?? new MediaStream([event.track])
              streamRef.current = nextStream
              if (!disposed) setStream(nextStream)
            }
            peer.onicecandidate = (event) => {
              if (event.candidate)
                send({ type: 'rtc_ice', candidate: event.candidate.toJSON() })
            }
            peer.onconnectionstatechange = () => {
              setRtcState(peer.connectionState)
              if (peer.connectionState === 'failed') {
                stopRtc()
                send({ type: 'rtc_stop' })
              }
            }
            await peer.setRemoteDescription({ type: 'offer', sdp: next.sdp })
            const answer = await peer.createAnswer()
            await peer.setLocalDescription(answer)
            send({ type: 'rtc_answer', sdp: answer.sdp ?? '' })
          } catch (cause) {
            setRtcState('failed')
            setError(cause instanceof Error ? cause.message : String(cause))
            stopRtc()
          }
        })()
      }
      if (next.type === 'rtc_ice' && peerRef.current)
        void peerRef.current
          .addIceCandidate(next.candidate)
          .catch(() => undefined)
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
      setConnected(false)
      stopRtc()
      reconnectLater()
    })
    void socket.opened
      .then(() => {
        if (disposed) return
        setConnected(true)
        lastFrameAt.current = Date.now()
        if (wantsVideo({ rtc, windowId })) startRtc()
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
    // JPEG frames keep coming while the display is on; while video is live
    // the desktop stops sending them, so only judge the JPEG path.
    const stallTimer = setInterval(() => {
      if (videoLiveRef.current) return
      const nextStalled = isFrameStalled(lastFrameAt.current, Date.now())
      setStalled(nextStalled)
      // The no-picture notice takes over from the switching spinner.
      if (nextStalled) setSwitching(false)
    }, 1_000)
    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      clearInterval(stallTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      removeMessage()
      removeClose()
      stopRtc()
      socket.close()
      if (socketRef.current === socket) socketRef.current = undefined
    }
  }, [
    displayId,
    generation,
    rtc,
    rtcTimeoutMs,
    send,
    setControl,
    setSwitching,
    tunnel,
    windowId,
  ])

  /** Asks the desktop for its windows; the answer lands in `windowList`. */
  const requestWindows = useCallback(() => {
    setWindowList(undefined)
    send({ type: 'windows' })
  }, [send])

  const markVideoFrame = useCallback(() => {
    if (videoLiveRef.current) return
    videoLiveRef.current = true
    setVideoLive(true)
    setStalled(false)
    setSwitching(false)
  }, [setSwitching])
  return {
    connected,
    switching,
    markVideoFrame,
    stalled,
    videoLive,
    control,
    controlRevoked,
    error,
    frame,
    message,
    status,
    windowList,
    requestWindows,
    rtcState,
    stream,
    send,
    sendControl,
    setControl,
  }
}
