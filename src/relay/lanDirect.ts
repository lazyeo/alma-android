export interface LanCandidates {
  port: number
  hosts: string[]
}

const privateIpv4 = (host: string) =>
  /^10(?:\.\d{1,3}){3}$/.test(host) ||
  /^192\.168(?:\.\d{1,3}){2}$/.test(host) ||
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host)

const localName = (host: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/i.test(host)

export function lanCandidateUrls(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const { port, hosts } = value as Partial<LanCandidates>
  if (!Number.isInteger(port) || port! < 1024 || port! > 65535) return []
  if (!Array.isArray(hosts)) return []
  const seen = new Set<string>()
  const urls: string[] = []
  for (const raw of hosts) {
    if (typeof raw !== 'string') continue
    const host = raw.toLowerCase()
    if (seen.has(host) || !(localName(host) || privateIpv4(host))) continue
    if (privateIpv4(host) && host.split('.').some((part) => Number(part) > 255))
      continue
    seen.add(host)
    urls.push(`ws://${host}:${port}/__alma_e2e__`)
  }
  return urls
}

export async function raceLanProbes<T>(
  urls: string[],
  probe: (url: string) => Promise<T>,
  close: (value: T) => void,
): Promise<T | undefined> {
  if (!urls.length) return undefined
  let winner: T | undefined
  let remaining = urls.length
  return new Promise((resolve) => {
    for (const url of urls)
      void probe(url).then(
        (value) => {
          remaining -= 1
          if (winner === undefined) {
            winner = value
            resolve(value)
          } else close(value)
        },
        () => {
          remaining -= 1
          if (!remaining && winner === undefined) resolve(undefined)
        },
      )
  })
}
