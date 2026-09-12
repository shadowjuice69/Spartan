export type IpReputation = {
  checked: boolean
  blocked: boolean
  reason: string | null
  vpn: boolean
  proxy: boolean
  tor: boolean
  relay: boolean
  hosting: boolean
  residentialProxy: boolean
  service: string | null
  provider: string
}

const EMPTY: IpReputation = {
  checked: false,
  blocked: false,
  reason: null,
  vpn: false,
  proxy: false,
  tor: false,
  relay: false,
  hosting: false,
  residentialProxy: false,
  service: null,
  provider: 'ipinfo',
}

export async function checkIpReputation(ip: string | null): Promise<IpReputation> {
  if (!ip) return { ...EMPTY, reason: 'ip_unavailable' }

  const token = process.env.IPINFO_TOKEN
  if (!token) return { ...EMPTY, reason: 'ip_reputation_unavailable' }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)
    const response = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return { ...EMPTY, reason: 'ip_reputation_unavailable' }

    const data = await response.json()
    const privacy = data?.privacy ?? data?.anonymous ?? {}
    const vpn = privacy.is_vpn === true || privacy.vpn === true
    const proxy = privacy.is_proxy === true || privacy.proxy === true
    const tor = privacy.is_tor === true || privacy.tor === true
    const relay = privacy.is_relay === true || privacy.relay === true
    const hosting = privacy.is_hosting === true || privacy.hosting === true || data?.is_hosting === true
    const residentialProxy = privacy.is_res_proxy === true || privacy.residential_proxy === true
    const blocked = vpn || proxy || tor || relay || residentialProxy || hosting
    const reasons = [
      vpn && 'VPN',
      proxy && 'proxy',
      tor && 'Tor',
      relay && 'relay',
      residentialProxy && 'residential proxy',
      hosting && 'hosting/data-center IP',
    ].filter(Boolean)

    return {
      checked: true,
      blocked,
      reason: blocked ? `IP masking detected: ${reasons.join(', ')}` : null,
      vpn,
      proxy,
      tor,
      relay,
      hosting,
      residentialProxy,
      service: privacy.service ?? privacy.name ?? null,
      provider: 'ipinfo',
    }
  } catch {
    return { ...EMPTY, reason: 'ip_reputation_unavailable' }
  }
}
