// The receiving side of the desktop's WebRTC video, shared by the Mac screen
// and the in-app browser. The desktop sends the offer over the picture's own
// socket; this answers it, trades ICE candidates through `send`, and hands
// over the remote stream. When the desktop opens its `input` data channel,
// input can go over it instead of the socket.

export type RtcSignal =
  | { type: 'rtc_answer'; sdp: string }
  | { type: 'rtc_ice'; candidate: RTCIceCandidateInit }
  | { type: 'rtc_stop' }

export interface RtcViewerHandlers {
  send(signal: RtcSignal): void
  onStream(stream: MediaStream): void
  onState(state: string): void
  onError(message: string): void
}

/** The parts of RTCPeerConnection this uses; tests supply a fake. */
export interface RtcPeer {
  connectionState: RTCPeerConnectionState
  ontrack: ((event: RTCTrackEvent) => void) | null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null
  onconnectionstatechange: ((event: Event) => void) | null
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>
  createAnswer(): Promise<RTCSessionDescriptionInit>
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>
  close(): void
}

/** The desktop's input channel label (its WebRTC bridge creates it). */
export const INPUT_CHANNEL = 'input'

type DataChannel = Pick<RTCDataChannel, 'label' | 'readyState' | 'send'>

export function createRtcViewer(
  handlers: RtcViewerHandlers,
  createPeer: (config: RTCConfiguration) => RtcPeer = (config) =>
    new RTCPeerConnection(config),
) {
  let peer: RtcPeer | undefined
  let channel: DataChannel | undefined

  const close = () => {
    peer?.close()
    peer = undefined
    channel = undefined
  }

  return {
    get active() {
      return peer !== undefined
    },
    /** Answers a desktop offer, replacing any earlier connection. */
    async acceptOffer(sdp: string, iceServers?: RTCIceServer[]) {
      close()
      const current = createPeer({ iceServers })
      peer = current
      const live = () => peer === current
      current.ontrack = (event) => {
        if (!live()) return
        handlers.onStream(event.streams[0] ?? new MediaStream([event.track]))
      }
      current.onicecandidate = (event) => {
        if (live() && event.candidate)
          handlers.send({
            type: 'rtc_ice',
            candidate: event.candidate.toJSON(),
          })
      }
      current.ondatachannel = (event) => {
        if (live() && event.channel.label === INPUT_CHANNEL)
          channel = event.channel
      }
      current.onconnectionstatechange = () => {
        if (!live()) return
        handlers.onState(current.connectionState)
        if (current.connectionState === 'failed') {
          close()
          handlers.send({ type: 'rtc_stop' })
        }
      }
      try {
        await current.setRemoteDescription({ type: 'offer', sdp })
        const answer = await current.createAnswer()
        await current.setLocalDescription(answer)
        if (live()) handlers.send({ type: 'rtc_answer', sdp: answer.sdp ?? '' })
      } catch (cause) {
        if (!live()) return
        close()
        handlers.onState('failed')
        handlers.onError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    addIce(candidate: RTCIceCandidateInit) {
      // A late candidate for a closed peer is harmless; nothing to report.
      void peer?.addIceCandidate(candidate).catch(() => undefined)
    },
    /** Sends over the data channel; false when it is not open. */
    sendInput(message: string) {
      if (channel?.readyState !== 'open') return false
      try {
        channel.send(message)
        return true
      } catch {
        return false
      }
    },
    close,
  }
}

export type RtcViewer = ReturnType<typeof createRtcViewer>
