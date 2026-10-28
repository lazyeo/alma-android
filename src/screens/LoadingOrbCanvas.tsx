import { useEffect, useRef } from 'react'
import { paintOrb } from './loadingOrb'

export function LoadingOrb({ size = 20 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const scale = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = size * scale
    canvas.height = size * scale
    context.scale(scale, scale)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let visible = true
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    observer.observe(canvas)
    const draw = (now: number) => {
      if (visible && document.visibilityState === 'visible')
        paintOrb(
          context,
          size,
          reduced ? 0.6 : (now / 1000) * 3.9,
          document.documentElement.style.colorScheme === 'dark',
        )
      if (!reduced) frame = requestAnimationFrame(draw)
    }
    const delay = window.setTimeout(() => {
      canvas.classList.add('visible')
      if (reduced) draw(0)
      else frame = requestAnimationFrame(draw)
    }, 800)
    return () => {
      clearTimeout(delay)
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [size])
  return (
    <canvas
      ref={ref}
      className="loading-orb"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
