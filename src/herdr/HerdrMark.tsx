import type { CSSProperties } from 'react'
import herdrMarkUrl from '../assets/herdr-mark.png'

export function HerdrMark({
  size,
  className = '',
}: {
  size: number
  className?: string
}) {
  const opticalSize = size * 1.15
  const mask = ['url(', herdrMarkUrl, ') center / contain no-repeat'].join('')

  return (
    <span
      aria-hidden="true"
      className={`herdr-mark${className ? ` ${className}` : ''}`}
      style={
        {
          width: opticalSize,
          height: opticalSize,
          display: 'inline-block',
          flex: '0 0 auto',
          background: 'currentColor',
          mask,
          WebkitMask: mask,
        } as CSSProperties
      }
    />
  )
}
