import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export const SPARTAN_OWNER_ID = '653534906277822494'
export const SPARTAN_TRUSTED_ADMIN_ID = '262745631829786624'

export function isOwner(discordId: string | null | undefined) { return String(discordId ?? '') === SPARTAN_OWNER_ID }
export function isTrustedAdmin(discordId: string | null | undefined) { return String(discordId ?? '') === SPARTAN_TRUSTED_ADMIN_ID }
export function isProtectedIdentity(discordId: string | null | undefined) { return isOwner(discordId) || isTrustedAdmin(discordId) }

export function extractDiscordId(user: any): string | null {
  const candidates = [user?.user_metadata?.discord_user_id, user?.app_metadata?.discord_user_id, user?.user_metadata?.provider_id, user?.user_metadata?.sub, user?.identities?.find((identity: any) => identity.provider === 'discord')?.identity_data?.provider_id, user?.identities?.find((identity: any) => identity.provider === 'discord')?.identity_data?.sub]
  const id = candidates.find((value) => /^\d{8,30}$/.test(String(value ?? '')))
  return id ? String(id) : null
}

function normalizeIp(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().replace(/^\[|\]$/g, '')
  if (!raw || raw.toLowerCase() === 'unknown') return null
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw) && raw.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)
  const ipv6 = raw.includes(':') && /^[0-9a-f:]+$/i.test(raw)
  return ipv4 || ipv6 ? raw : null
}

export function requestIp(request: Request): string | null {
  const headers = request.headers
  return normalizeIp(headers.get('x-forwarded-for')?.split(',')[0]?.trim()) || normalizeIp(headers.get('x-real-ip')?.trim()) || normalizeIp(headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim())
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan security service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function recordDashboardSession({ discordUserId, sessionId, ipAddress, userAgent, route, success }: { discordUserId: string; sessionId: string; ipAddress: string | null; userAgent: string | null; route: string; success: boolean }) {
  if (!ipAddress) return
  const supabase = adminClient()
  await supabase.from('spartan_security_sessions').insert({ discord_user_id: discordUserId, session_id: sessionId, ip_address: ipAddress, user_agent: userAgent, dashboard_route: route, success })
}

export async function getActiveIpBlock(ipAddress: string | null) {
  if (!ipAddress) return null
  const supabase = adminClient()
  const { data } = await supabase.from('spartan_ip_blocks').select('id,ip_address,status,reason,created_by_discord_id,created_at').eq('ip_address', ipAddress).eq('status', 'active').maybeSingle()
  return data ?? null
}

export async function getSpartanAccess(discordUserId: string) {
  const supabase = adminClient()
  const { data } = await supabase.from('spartan_access').select('discord_user_id,username,status,role,metadata').eq('discord_user_id', discordUserId).maybeSingle()
  return data ?? null
}

export async function recordSecurityEvent(eventType: string, discordUserId: string | null, ipAddress: string | null, actorDiscordId: string | null, reason: string, metadata: Record<string, unknown> = {}) {
  const supabase = adminClient()
  await supabase.from('spartan_security_events').insert({ event_type: eventType, discord_user_id: discordUserId, ip_address: ipAddress, actor_discord_id: actorDiscordId, reason: reason || null, metadata })
}

export async function authorizeDashboard(request: Request, discordUserId: string) {
  const ip = requestIp(request)
  const access = await getSpartanAccess(discordUserId)
  const protectedIdentity = isProtectedIdentity(discordUserId)
  const block = await getActiveIpBlock(ip)
  const ipRecorded = Boolean(ip)
  const ipBlocked = Boolean(block) && (!protectedIdentity || isOwner(String(block?.created_by_discord_id ?? '')))
  const identityAllowed = protectedIdentity || access?.status === 'active'
  // Fail closed: Spartan access requires a server-observable client IP.
  const allowed = identityAllowed && ipRecorded && !ipBlocked

  await recordDashboardSession({ discordUserId, sessionId: crypto.randomUUID(), ipAddress: ip, userAgent: request.headers.get('user-agent'), route: new URL(request.url).pathname, success: allowed })

  if (!allowed) {
    await recordSecurityEvent(ipBlocked ? 'dashboard_ip_blocked' : !ipRecorded ? 'dashboard_ip_unavailable' : 'dashboard_access_denied', discordUserId, ip, block?.created_by_discord_id ?? null, ipBlocked ? 'Active Spartan IP block' : !ipRecorded ? 'No valid client IP was available; access denied until IP can be recorded.' : 'No active Spartan access', { protectedIdentity, role: access?.role ?? null, ipRecorded })
  }

  return { allowed, ip, ipRecorded, access, block, protectedIdentity, reason: !ipRecorded ? 'ip_unavailable' : ipBlocked ? 'ip_blocked' : !identityAllowed ? 'access_inactive' : null }
}
