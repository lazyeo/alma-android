import { describe, expect, it, vi } from 'vitest'
import { createRtcViewer, type RtcPeer } from './rtcViewer'

class FakeChannel {
  readyState: RTCDataChannelState = 'connecting'
  label: string
  send = vi.fn()
  close = vi.fn()
  constructor(label: string) {
    this.label = label
  }
}

class FakePeer implements RtcPeer {
  connectionState: RTCPeerConnectionState = 'new'
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  onconnectionstatechange: ((event: Event) => void) | null = null
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null
  setRemoteDescription = vi.fn(async () => undefined)
  createAnswer = vi.fn(async (): Promise<RTCSessionDescriptionInit> => ({
    type: 'answer',
    sdp: 'answer-sdp',
  }))
  setLocalDescription = vi.fn(async () => undefined)
  addIceCandidate = vi.fn(async () => undefined)
  close = vi.fn()
  state(next: RTCPeerConnectionState) {
    this.connectionState = next
    this.onconnectionstatechange?.(new Event('connectionstatechange'))
  }
}

function setup() {
  const peers: FakePeer[] = []
  const handlers = {
    send: vi.fn(),
    onStream: vi.fn(),
    onState: vi.fn(),
    onError: vi.fn(),
  }
  const viewer = createRtcViewer(handlers, (config) => {
    const peer = new FakePeer()
    peers.push(peer)
    void config
    return peer
  })
  return { viewer, peers, handlers }
}

describe('createRtcViewer', () => {
  it('answers an offer and forwards its own ICE candidates', async () => {
    const { viewer, peers, handlers } = setup()
    await viewer.acceptOffer('offer-sdp', [{ urls: 'stun:example' }])
    const peer = peers[0]
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'offer-sdp',
    })
    expect(handlers.send).toHaveBeenCalledWith({
      type: 'rtc_answer',
      sdp: 'answer-sdp',
    })
    peer.onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: 'c1' }) },
    } as unknown as RTCPeerConnectionIceEvent)
    expect(handlers.send).toHaveBeenLastCalledWith({
      type: 'rtc_ice',
      candidate: { candidate: 'c1' },
    })
  })

  it('hands over the remote stream and the connection state', async () => {
    const { viewer, peers, handlers } = setup()
    await viewer.acceptOffer('sdp')
    const stream = { id: 's' } as unknown as MediaStream
    peers[0].ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent)
    expect(handlers.onStream).toHaveBeenCalledWith(stream)
    peers[0].state('connected')
    expect(handlers.onState).toHaveBeenLastCalledWith('connected')
  })

  it('closes and asks the desktop to stop when the connection fails', async () => {
    const { viewer, peers, handlers } = setup()
    await viewer.acceptOffer('sdp')
    peers[0].state('failed')
    expect(peers[0].close).toHaveBeenCalled()
    expect(handlers.send).toHaveBeenLastCalledWith({ type: 'rtc_stop' })
    expect(viewer.active).toBe(false)
  })

  it('sends input over the desktop data channel only while it is open', async () => {
    const { viewer, peers } = setup()
    expect(viewer.sendInput('{"type":"tap"}')).toBe(false)
    await viewer.acceptOffer('sdp')
    const channel = new FakeChannel('input')
    peers[0].ondatachannel?.({
      channel,
    } as unknown as RTCDataChannelEvent)
    expect(viewer.sendInput('{"type":"tap"}')).toBe(false)
    channel.readyState = 'open'
    expect(viewer.sendInput('{"type":"tap"}')).toBe(true)
    expect(channel.send).toHaveBeenCalledWith('{"type":"tap"}')
  })

  it('ignores data channels with another label', async () => {
    const { viewer, peers } = setup()
    await viewer.acceptOffer('sdp')
    const channel = new FakeChannel('stats')
    channel.readyState = 'open'
    peers[0].ondatachannel?.({
      channel,
    } as unknown as RTCDataChannelEvent)
    expect(viewer.sendInput('{}')).toBe(false)
  })

  it('replaces the previous peer on a new offer and drops its channel', async () => {
    const { viewer, peers } = setup()
    await viewer.acceptOffer('one')
    const channel = new FakeChannel('input')
    channel.readyState = 'open'
    peers[0].ondatachannel?.({
      channel,
    } as unknown as RTCDataChannelEvent)
    await viewer.acceptOffer('two')
    expect(peers[0].close).toHaveBeenCalled()
    expect(viewer.sendInput('{}')).toBe(false)
  })

  it('reports a failed negotiation without throwing', async () => {
    const handlers = {
      send: vi.fn(),
      onStream: vi.fn(),
      onState: vi.fn(),
      onError: vi.fn(),
    }
    const peer = new FakePeer()
    peer.setRemoteDescription.mockRejectedValue(new Error('bad sdp'))
    const viewer = createRtcViewer(handlers, () => peer)
    await viewer.acceptOffer('bad')
    expect(handlers.onState).toHaveBeenLastCalledWith('failed')
    expect(handlers.onError).toHaveBeenLastCalledWith('bad sdp')
    expect(peer.close).toHaveBeenCalled()
    expect(viewer.active).toBe(false)
  })

  it('applies remote ICE only while a peer exists', async () => {
    const { viewer, peers } = setup()
    viewer.addIce({ candidate: 'early' })
    await viewer.acceptOffer('sdp')
    viewer.addIce({ candidate: 'c2' })
    expect(peers[0].addIceCandidate).toHaveBeenCalledWith({ candidate: 'c2' })
  })
})
