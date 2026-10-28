import { ArrowLeft, Camera, LockKeyhole } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import {
  AlmaApi,
  RelayTunnel,
  createStoredPairing,
  parsePairingLink,
  type StoredPairing,
} from '../relay'
import { useT } from '../i18n'

const BLANK_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
export function PairScreen({
  onPaired,
  onCancel,
  incomingLink,
  onIncomingLinkConsumed,
}: {
  onPaired: (pairing: StoredPairing) => void
  /** Present when adding another desktop; the first pairing cannot cancel. */
  onCancel?(): void
  incomingLink?: string
  onIncomingLinkConsumed?(): void
}) {
  const t = useT()
  const [link, setLink] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false),
    [cameraLive, setCameraLive] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    setCameraLive(false)
    if (!scanning || !video.current) return
    const reader = new BrowserQRCodeReader()
    let controls: { stop(): void } | undefined
    reader
      .decodeFromVideoDevice(undefined, video.current, (result) => {
        if (result) {
          setLink(result.getText())
          controls?.stop()
          setScanning(false)
        }
      })
      .then((c) => {
        controls = c
      })
      .catch((e) => {
        setError(
          e instanceof Error
            ? e.message
            : t('connection.pair.cameraUnavailable'),
        )
        setScanning(false)
      })
    return () => controls?.stop()
  }, [scanning])
  const pair = async (candidate = link) => {
    setBusy(true)
    setError('')
    let tunnel: RelayTunnel | undefined
    try {
      const parsed = parsePairingLink(candidate)
      tunnel = new RelayTunnel(parsed)
      const api = new AlmaApi(tunnel)
      // Older desktops may lack /api/health; the thread list proves access.
      const health = await api.getHealth().catch(() => undefined)
      await api.listThreads()
      onPaired(await createStoredPairing(parsed, health?.name ?? ''))
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('connection.pair.connectFailed'),
      )
    } finally {
      tunnel?.close()
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!incomingLink) return
    setLink(incomingLink)
    onIncomingLinkConsumed?.()
    void pair(incomingLink)
    // The link is consumed once and never logged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingLink])

  return (
    <main className="pair-screen">
      {onCancel ? (
        <button
          className="header-icon-button start-back"
          aria-label={t('common.back')}
          onClick={onCancel}
        >
          <ArrowLeft size={20} />
        </button>
      ) : null}
      <img
        className="pair-launcher"
        src="/icon-192.png"
        alt=""
        width={64}
        height={64}
      />
      <h1>Alma</h1>
      <p className="lede">{t('connection.pair.lede')}</p>
      <div className="pair-card">
        <label htmlFor="pair-link">{t('connection.pair.linkLabel')}</label>
        <textarea
          id="pair-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="alma://connect?u=…&k=…&e2e=1"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <div className="button-row">
          <button
            className="primary"
            onClick={() => void pair()}
            disabled={busy || !link.trim()}
          >
            {busy
              ? t('connection.pair.connecting')
              : t('connection.pair.connect')}
          </button>
          <button className="secondary" onClick={() => setScanning((v) => !v)}>
            {scanning
              ? t('connection.pair.cancelScan')
              : t('connection.pair.scan')}
          </button>
        </div>
        {scanning ? (
          <div className="scanner" data-live={cameraLive || undefined}>
            {/* Android WebView paints a stretched play glyph as the default
                poster until frames arrive; a blank poster hides it. */}
            <video
              ref={video}
              muted
              playsInline
              poster={BLANK_POSTER}
              onPlaying={() => setCameraLive(true)}
            />
            {cameraLive ? null : <Camera size={28} aria-hidden="true" />}
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
      <p className="security-note">
        <LockKeyhole size={14} aria-hidden="true" />{' '}
        {t('connection.pair.encrypted')}
        <br />
        {t('connection.pair.relayNeverSees')}
      </p>
    </main>
  )
}
