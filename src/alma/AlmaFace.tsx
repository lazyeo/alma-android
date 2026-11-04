import { useState } from 'react'
import { useMascotRig } from '../extensions/mascotRig'
import { AlmaFaceFallback } from './AlmaFaceFallback'
import type { FaceActivity, FaceMood } from './faceState'
import { MascotRig } from './rig/MascotRig'

export type FaceRenderer = 'rig' | 'vector'

/** The raster rig when an extension registered one that loads; else vector. */
export function faceRenderer(rigRegistered: boolean, rigFailed: boolean) {
  return rigRegistered && !rigFailed ? 'rig' : 'vector'
}

/**
 * Alma's face wherever she appears. A registered mascot rig draws her as a
 * layered raster character; without one (or if its art fails to load) the
 * built-in vector face stands in with the same props.
 */
export function AlmaFace(props: {
  size: number
  mood?: FaceMood
  activity?: FaceActivity
  /** Static rendering for repeated small copies (message avatars). */
  still?: boolean
  className?: string
}) {
  const rig = useMascotRig()
  const [failed, setFailed] = useState<typeof rig>()
  if (rig && faceRenderer(true, failed === rig) === 'rig')
    return (
      <MascotRig assets={rig} {...props} onUnavailable={() => setFailed(rig)} />
    )
  return <AlmaFaceFallback {...props} />
}
