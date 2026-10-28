import type { MessageRow } from '../relay'

export interface GalleryImage {
  source: string
  name: string
}

export const GALLERY_SWIPE_DISTANCE_RATIO = 0.18
export const GALLERY_SWIPE_MIN_DISTANCE = 56
export const GALLERY_SWIPE_VELOCITY = 0.55
export const GALLERY_DISMISS_DISTANCE = 96
export const GALLERY_DISMISS_VELOCITY = 0.7

export function extractThreadImages(
  rows: readonly MessageRow[],
): GalleryImage[] {
  const images: GalleryImage[] = []
  for (const row of rows) {
    for (const part of row.message.parts) {
      const source = typeof part.url === 'string' ? part.url : undefined
      const mediaType =
        typeof part.mediaType === 'string' ? part.mediaType : undefined
      if (
        !source ||
        (part.type !== 'image' &&
          !(part.type === 'file' && mediaType?.startsWith('image/')))
      )
        continue
      images.push({
        source,
        name: typeof part.filename === 'string' ? part.filename : 'Image',
      })
    }
  }
  return images
}

export function clampGalleryIndex(index: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), index))
}

export function gallerySwipeTarget(
  index: number,
  deltaX: number,
  velocityX: number,
  count: number,
  viewportWidth: number,
) {
  const threshold = Math.max(
    GALLERY_SWIPE_MIN_DISTANCE,
    viewportWidth * GALLERY_SWIPE_DISTANCE_RATIO,
  )
  if (deltaX <= -threshold || velocityX <= -GALLERY_SWIPE_VELOCITY)
    return clampGalleryIndex(index + 1, count)
  if (deltaX >= threshold || velocityX >= GALLERY_SWIPE_VELOCITY)
    return clampGalleryIndex(index - 1, count)
  return clampGalleryIndex(index, count)
}

export function thumbnailScrollLeft(
  index: number,
  itemWidth: number,
  gap: number,
  viewportWidth: number,
  count: number,
) {
  const contentWidth = count * itemWidth + Math.max(0, count - 1) * gap
  const centred = index * (itemWidth + gap) + itemWidth / 2 - viewportWidth / 2
  return Math.max(
    0,
    Math.min(Math.max(0, contentWidth - viewportWidth), centred),
  )
}
