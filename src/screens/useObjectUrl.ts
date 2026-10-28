import { useEffect, useState } from 'react'
/** URLs belong to the mounted preview, never to navigation history or a fetch. */
export function useObjectUrl(blob?: Blob) {
  const [value, setValue] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!blob) {
      setValue(undefined)
      return
    }
    const url = URL.createObjectURL(blob)
    setValue({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return value?.blob === blob ? value?.url : undefined
}
