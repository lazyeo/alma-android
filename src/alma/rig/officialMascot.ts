import {
  registerMascotRig,
  useMascotRig,
  validMascotRig,
  type MascotRigAssets,
  type MascotRigGeometry,
} from '../../extensions/mascotRig'

/**
 * Where scripts/prepare-mascot.mjs unpacks the official Alma art (from the
 * official Android release, at build time) inside the web app. The images
 * are © yetone / Alma and are never committed to this repository.
 */
export const OFFICIAL_MASCOT_DIR = 'alma-mascot/'

const mascotDir = (base: string) =>
  `${base.endsWith('/') ? base : `${base}/`}${OFFICIAL_MASCOT_DIR}`

export function officialMascotAssets(
  base: string,
  rig: MascotRigGeometry,
): MascotRigAssets {
  const dir = mascotDir(base)
  const eye = (side: 'L' | 'R') => ({
    white: `${dir}eye-${side}-white.png`,
    iris: `${dir}eye-${side}-iris.png`,
    lid: `${dir}eye-${side}-lid.png`,
  })
  return {
    base: `${dir}base.png`,
    eyes: { L: eye('L'), R: eye('R') },
    rig,
    // Our own vector glasses, drawn over the official face.
    accessories: ['glasses'],
  }
}

/**
 * Registers the official rig when the build bundled it. A dev server or a
 * build that skipped the download keeps the built-in vector face.
 */
export async function registerOfficialMascot(
  base: string = import.meta.env.BASE_URL,
  fetcher: typeof fetch = fetch,
) {
  try {
    const response = await fetcher(`${mascotDir(base)}rig.json`)
    if (!response.ok) return false
    const rig: unknown = await response.json()
    if (!validMascotRig(rig)) return false
    registerMascotRig(officialMascotAssets(base, rig))
    return true
  } catch {
    return false
  }
}

/** True while Alma is drawn with the official art (it needs a credit). */
export function useOfficialMascot() {
  return (
    useMascotRig()?.base.includes(`/${OFFICIAL_MASCOT_DIR}base.png`) ?? false
  )
}
