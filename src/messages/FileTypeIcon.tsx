import {
  Box,
  File,
  FileArchive,
  FileCode,
  FileHeadphone,
  FilePlay,
  FileText,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { fileAttachmentKind, type FileAttachmentKind } from './fileAttachment'

const ICONS: Record<FileAttachmentKind, LucideIcon> = {
  '3d': Box,
  archive: FileArchive,
  document: FileText,
  code: FileCode,
  audio: FileHeadphone,
  video: FilePlay,
  file: File,
}

/** Decorative: the file's name beside it carries the meaning. */
export function FileTypeIcon({
  name,
  mediaType,
  ...props
}: { name: string; mediaType: string } & LucideProps) {
  const Icon = ICONS[fileAttachmentKind(name, mediaType)]
  return <Icon aria-hidden="true" {...props} />
}
