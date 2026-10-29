import { useCallback, useEffect, useRef, useState } from 'react'
import type { RelayTunnel, TunnelSocket } from '../../relay'
import {
  decodeScreenMessage,
  latestFrame,
  type ScreenClientMessage,
  type ScreenFrame,
  type ScreenServerMessage,
} from './protocol'
import { isFrameStalled } from './liveness'

interface ScreenTunnel {
  openWebSocket: Pick<RelayTunnel, 'openWebSocket'>['openWebSocket']
}

export interface RemoteScreenOptions {
  rtc?: boolean
  displayId?: number
  rtcTimeoutMs?: number
}

export function useRemoteScreen(
  tunnel: ScreenTunnel,
  { rtc = true, displayId, rtcTimeoutMs = 5_000 }: RemoteScreenOptions = {},
) {
  const socketRef = useRef<TunnelSocket>()
  const peerRef = useRef<RTCPeerConnection>()
  const streamRef = useRef<MediaStream>()
  const controlRef = useRef(false)
  const [control, setControlState] = useState(false)
  const [message, setMessage] = useState<ScreenServerMessage>()
  const [frame, setFrame] = useState<ScreenFrame>()
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
      if (controlRef.current) send(value)
    },
    [send],
  )

  useEffect(() => {
    let disposed = false
    let rtcTimer: ReturnType<typeof setTimeout> | undefined
    const path = displayId
      ? `/ws/screen?display=${encodeURIComponent(displayId)}`
      : '/ws/screen'
    const socket = tunnel.openWebSocket(path)
    socketRef.current = socket
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
    const removeMessage = socket.onMessage((raw) => {
      if (disposed || typeof raw !== 'string') return
      const next = decodeScreenMessage(raw)
      if (!next) return
      setMessage(next)
      if (next.type === 'frame') {
        lastFrameAt.current = Date.now()
        setStalled(false)
        setFrame((current) => latestFrame(current, next))
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
    const removeClose = socket.onClose(() => {
      setConnected(false)
      setControl(false)
      stopRtc()
    })
    void socket.opened
      .then(() => {
        if (disposed) return
        setConnected(true)
        lastFrameAt.current = Date.now()
        if (rtc) {
          send({ type: 'rtc_start' })
          rtcTimer = setTimeout(() => {
            if (!videoLiveRef.current) {
              setRtcState('timeout')
              send({ type: 'rtc_stop' })
              stopRtc()
            }
          }, rtcTimeoutMs)
        }
      })
      .catch((cause) => {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : String(cause))
      })
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        setControl(false)
        socket.close()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    // JPEG frames keep coming while the display is on; while video is live
    // the desktop stops sending them, so only judge the JPEG path.
    const stallTimer = setInterval(() => {
      if (!videoLiveRef.current)
        setStalled(isFrameStalled(lastFrameAt.current, Date.now()))
    }, 1_000)
    return () => {
      disposed = true
      clearInterval(stallTimer)
      setControl(false)
      document.removeEventListener('visibilitychange', onVisibility)
      removeMessage()
      removeClose()
      stopRtc()
      socket.close()
      if (socketRef.current === socket) socketRef.current = undefined
    }
  }, [displayId, rtc, rtcTimeoutMs, send, setControl, tunnel])

  const markVideoFrame = useCallback(() => {
    if (videoLiveRef.current) return
    videoLiveRef.current = true
    setVideoLive(true)
    setStalled(false)
  }, [])
  /** One explicit Shift press: wakes a sleeping display without typing. */
  const wake = useCallback(() => send({ type: 'key', key: 'shift' }), [send])

  return {
    connected,
    markVideoFrame,
    stalled,
    videoLive,
    wake,
    control,
    error,
    frame,
    message,
    rtcState,
    stream,
    send,
    sendControl,
    setControl,
  }
}
