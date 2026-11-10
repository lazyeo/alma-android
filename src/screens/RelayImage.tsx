import { useEffect, useRef, useState } from 'react'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import { useImageGallery } from './ImageGallery'
import { imageCache } from './relayImages'
import type { AlmaApi } from '../relay/almaApi'

export function RelayImage({
  source,
  name,
  api: sourceApi,
}: {
  source: string
  name: string
  /** The API that owns `source`, e.g. Herdr on another computer. */
  api?: AlmaApi
}) {
  const t = useT()
  const connection = useConnection()
  const api = sourceApi ?? connection.api
  const { openGallery } = useImageGallery()
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' },
    )
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let disposed = false
    let objectUrl = ''
    setUrl('')
    setFailed(false)
    imageCache(api)
      .get(source)
      .then((blob) => {
        if (disposed) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [api, source, visible])
  return (
    <div ref={host} className="relay-image">
      {url ? (
        <button
          className="image-button"
          aria-label={t('files.image.open', { name })}
          onClick={() => openGallery(source)}
        >
          <img
            className="message-image"
            src={url}
            alt={name}
            onError={() => {
              setUrl('')
              setFailed(true)
            }}
          />
        </button>
      ) : (
        <div className="image-placeholder" role="status">
          {failed ? t('files.image.unavailable') : t('files.image.loading')}
        </div>
      )}
    </div>
  )
}
