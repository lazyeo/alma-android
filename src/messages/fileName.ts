import { t } from '../i18n/runtime'

export function fileName(path: string) {
  return (
    path.split(/[\\/]/).filter(Boolean).pop() || t('files.link.fallbackName')
  )
}
