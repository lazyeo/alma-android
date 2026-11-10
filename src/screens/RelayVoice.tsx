import { useCallback } from 'react'
import { useConnection } from '../desktops/DesktopContext'
import { VoiceCapsule } from '../messages/VoiceCapsule'
import type { VoiceNote } from '../messages/voiceNote'

/** The thread host's voice player: bytes come through the tunnel (relay or LAN). */
export function RelayVoice({ voice }: { voice: VoiceNote }) {
  const { api } = useConnection()
  const { path, mediaType } = voice
  const load = useCallback(
    () => api.getAudio(path, mediaType),
    [api, path, mediaType],
  )
  // A new voice on the same row (a later message_updated) starts fresh.
  return <VoiceCapsule key={path} voice={voice} load={load} />
}
