// The live picture from the desktop: JPEG frames drawn on a canvas, with the
// WebRTC video laid over it once the video has a real frame. Shared by the
// Mac screen and the in-app browser; both lay it out with remoteScreen.css.
import { useEffect, useRef } from 'react'
import { BLANK_POSTER, isDarkSample } from '../remoteScreen/liveness'

function ScreenCanvas({
  data,
  onDark,
}: {
  data?: string
  onDark?: (dark: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decodeVersion = useRef(0)
  useEffect(() => {
    if (!data) return
    const version = ++decodeVersion.current
    let disposed = false
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    void createImageBitmap(blob)
      .then((bitmap) => {
        if (disposed || version !== decodeVersion.current) {
          bitmap.close()
          return
        }
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
        if (onDark) {
          // A sleeping or locked display often captures as a black frame.
          const probe = document.createElement('canvas')
          probe.width = 16
          probe.height = 10
          const context = probe.getContext('2d', { willReadFrequently: true })
          context?.drawImage(bitmap, 0, 0, 16, 10)
          const sample = context?.getImageData(0, 0, 16, 10).data
          if (sample) onDark(isDarkSample(sample))
        }
        bitmap.close()
      })
      .catch(() => undefined)
    return () => {
      disposed = true
    }
    // onDark is a stable state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  return <canvas ref={canvasRef} className="remote-screen-media" />
}

export function ScreenMedia({
  stream,
  frame,
  videoLive,
  onVideoFrame,
  onDark,
}: {
  stream?: MediaStream
  frame?: { data: string }
  videoLive: boolean
  onVideoFrame: () => void
  onDark: (dark: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream ?? null
    if (!stream) return
    // `playing` alone can fire before any frame; wait for real dimensions.
    const check = () => {
      if (video.videoWidth > 0) onVideoFrame()
    }
    video.addEventListener('loadeddata', check)
    video.addEventListener('playing', check)
    video.addEventListener('resize', check)
    return () => {
      video.removeEventListener('loadeddata', check)
      video.removeEventListener('playing', check)
      video.removeEventListener('resize', check)
    }
  }, [stream, onVideoFrame])
  // The last JPEG frame stays underneath until video actually has a picture.
  return (
    <>
      <ScreenCanvas
        data={frame?.data}
        onDark={videoLive ? undefined : onDark}
      />
      {stream ? (
        <video
          ref={videoRef}
          className={`remote-screen-media remote-screen-video${videoLive ? ' live' : ''}`}
          poster={BLANK_POSTER}
          autoPlay
          playsInline
          muted
        />
      ) : null}
    </>
  )
}
