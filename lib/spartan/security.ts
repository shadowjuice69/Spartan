import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { checkIpReputation } from './ip-reputation'

export const SPARTAN_OWNER_ID = '653534906277822494'
export const SPARTAN_TRUSTED_ADMIN_ID = '262745631829786624' // Riven — unrestricted global access

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
  return normalizeIp(headers.get('x-forwarded-for')?.split(',')[0]?.trim()) || normalizeIp(headers.get('x-real-ip')?.trim())
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan security service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function recordDashboardSession({ discordUserId, sessionId, ipAddress, userAgent, route, success }: { discordUserId: string | null; sessionId: string; ipAddress: string | null; userAgent: string | null; route: string; success: boolean }) {
  if (!ipAddress) throw new Error('No valid client IP was available for Spartan session recording.')
  const supabase = adminClient()
  const { error } = await supabase.from('spartan_security_sessions').insert({ discord_user_id: discordUserId, session_id: sessionId, ip_address: ipAddress, user_agent: userAgent, dashboard_route: route, success })
  if (error) throw new Error(`Spartan security session recording failed: ${error.message}`)
}

export async function recordLoginCheckpoint({ authUserId, request }: { authUserId: string; request: Request }) {
  const ip = requestIp(request)
  if (!ip) throw new Error('No valid client IP was available for Spartan login recording.')

  const supabase = adminClient()
  const now = new Date().toISOString()
  const { data: account, error: lookupError } = await supabase
    .from('spartan_accounts')
    .select('discord_user_id,last_login_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (lookupError) throw new Error(`Spartan login history lookup failed: ${lookupError.message}`)
  if (!account) throw new Error('Spartan account identity is not linked to the authenticated account.')

  const discordUserId = account.discord_user_id ? String(account.discord_user_id) : null
  const { error: accountError } = await supabase
    .from('spartan_accounts')
    .update({ last_login_ip: ip, previous_login_at: account.last_login_at ?? null, last_login_at: now, updated_at: now })
    .eq('auth_user_id', authUserId)

  if (accountError) throw new Error(`Spartan login IP recording failed: ${accountError.message}`)

  await recordDashboardSession({
    discordUserId,
    sessionId: crypto.randomUUID(),
    ipAddress: ip,
    userAgent: request.headers.get('user-agent'),
    route: '/login',
    success: true,
  })

  await recordSecurityEvent(
    'login_ip_recorded',
    discordUserId,
    ip,
    null,
    'IP successfully recorded at Spartan login checkpoint.',
    { authUserId, ipRecorded: true, route: '/login', previousLoginAt: account.last_login_at ?? null, discordOptional: true },
  )

  return { ip, recordedAt: now, previousLoginAt: account.last_login_at ?? null, discordUserId }
}

export async function getActiveIpBlock(ipAddress: string | null) {
  if (!ipAddress) return null
  const supabase = adminClient()
  const { data, error } = await supabase.from('spartan_ip_blocks').select('id,ip_address,status,reason,created_by_discord_id,created_at').eq('ip_address', ipAddress).eq('status', 'active').maybeSingle()
  if (error) throw new Error(`Spartan IP block lookup failed: ${error.message}`)
  return data ?? null
}

export async function getSpartanAccess(discordUserId: string) {
  const supabase = adminClient()
  const { data, error } = await supabase.from('spartan_access').select('discord_user_id,username,status,role,metadata').eq('discord_user_id', discordUserId).maybeSingle()
  if (error) throw new Error(`Spartan access lookup failed: ${error.message}`)
  return data ?? null
}

export async function getSpartanAccessForAuthUser(authUserId: string) {
  const supabase = adminClient()
  const { data: account, error } = await supabase
    .from('spartan_accounts')
    .select('auth_user_id,screen_name,province_name,province_location,role,discord_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw new Error(`Spartan account access lookup failed: ${error.message}`)
  if (!account) return null

  const role = account.role || 'member'
  return {
    auth_user_id: account.auth_user_id,
    username: account.screen_name,
    status: 'active',
    role,
    metadata: {
      province_name: account.province_name,
      province_location: account.province_location,
      discord_user_id: account.discord_user_id ?? null,
    },
  }
}

export async function resolveDashboardIdentity(authUserId: string, sessionDiscordId?: string | null) {
  const supabase = adminClient()
  const { data: account, error } = await supabase
    .from('spartan_accounts')
    .select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw new Error(`Spartan account identity lookup failed: ${error.message}`)
  const accountDiscordId = account?.discord_user_id ? String(account.discord_user_id) : null
  const discordUserId = accountDiscordId || (sessionDiscordId && /^\d{8,30}$/.test(sessionDiscordId) ? sessionDiscordId : null)
  return { account, discordUserId }
}

export async function recordSecurityEvent(eventType: string, discordUserId: string | null, ipAddress: string | null, actorDiscordId: string | null, reason: string, metadata: Record<string, unknown> = {}) {
  const supabase = adminClient()
  const { error } = await supabase.from('spartan_security_events').insert({ event_type: eventType, discord_user_id: discordUserId, ip_address: ipAddress, actor_discord_id: actorDiscordId, reason: reason || null, metadata })
  if (error) throw new Error(`Spartan security event recording failed: ${error.message}`)
}

export async function authorizeDashboard(request: Request, discordUserId: string) {
  const ip = requestIp(request)
  const access = await getSpartanAccess(discordUserId)
  const protectedIdentity = isProtectedIdentity(discordUserId)
  const block = await getActiveIpBlock(ip)
  const ipRecorded = Boolean(ip)
  const ipReputation = protectedIdentity ? null : await checkIpReputation(ip)
  const ipBlocked = Boolean(block) && (!protectedIdentity || isOwner(String(block?.created_by_discord_id ?? '')))
  const reputationBlocked = !protectedIdentity && Boolean(ipReputation?.blocked)
  const reputationUnavailable = !protectedIdentity && ipRecorded && ipReputation?.reason === 'ip_reputation_unavailable'
  const identityAllowed = protectedIdentity || access?.status === 'active'
  const allowed = identityAllowed && ipRecorded && !ipBlocked && !reputationBlocked && !reputationUnavailable

  await recordDashboardSession({ discordUserId, sessionId: crypto.randomUUID(), ipAddress: ip, userAgent: request.headers.get('user-agent'), route: new URL(request.url).pathname, success: allowed })

  const eventType = allowed ? 'dashboard_ip_recorded' : ipBlocked ? 'dashboard_ip_blocked' : reputationBlocked ? 'dashboard_ip_masking_blocked' : reputationUnavailable ? 'dashboard_ip_reputation_unavailable' : !ipRecorded ? 'dashboard_ip_unavailable' : 'dashboard_access_denied'
  const reason = allowed ? 'IP successfully recorded at Spartan authentication checkpoint.' : ipBlocked ? 'Active Spartan IP block' : reputationBlocked ? (ipReputation?.reason || 'IP masking detected') : reputationUnavailable ? 'IP reputation could not be verified; access denied until verification is available.' : !ipRecorded ? 'No valid client IP was available; access denied until IP can be recorded.' : 'No active Spartan access'

  await recordSecurityEvent(eventType, discordUserId, ip, block?.created_by_discord_id ?? null, reason, { protectedIdentity, role: access?.role ?? null, ipRecorded, reputation: ipReputation, route: new URL(request.url).pathname })

  return { allowed, ip, ipRecorded, access, block, protectedIdentity, ipReputation, reason: !ipRecorded ? 'ip_unavailable' : ipBlocked ? 'ip_blocked' : reputationBlocked ? 'ip_masking_detected' : reputationUnavailable ? 'ip_reputation_unavailable' : !identityAllowed ? 'access_inactive' : null }
}

export async function authorizeDashboardForAuthUser(request: Request, authUserId: string, sessionDiscordId?: string | null) {
  const identity = await resolveDashboardIdentity(authUserId, sessionDiscordId)
  if (!identity.account) {
    return { allowed: false, reason: 'security_identity_unavailable', access: null, protectedIdentity: false, ipRecorded: Boolean(requestIp(request)) }
  }

  const ip = requestIp(request)
  const block = await getActiveIpBlock(ip)
  const ipRecorded = Boolean(ip)
  const discordUserId = identity.discordUserId
  const protectedIdentity = isProtectedIdentity(discordUserId)
  const access = await getSpartanAccessForAuthUser(authUserId)
  const ipReputation = protectedIdentity ? null : await checkIpReputation(ip)
  const ipBlocked = Boolean(block) && (!protectedIdentity || isOwner(String(block?.created_by_discord_id ?? '')))
  const reputationBlocked = !protectedIdentity && Boolean(ipReputation?.blocked)
  const reputationUnavailable = !protectedIdentity && ipRecorded && ipReputation?.reason === 'ip_reputation_unavailable'
  // Protected identities are globally unrestricted. Security may audit them, but
  // authentication, IP reputation, IP blocks, missing IPs, and account status can
  // never become a reason to deny access.
  const identityAllowed = protectedIdentity || Boolean(access && access.status === 'active')
  const allowed = protectedIdentity || (identityAllowed && ipRecorded && !ipBlocked && !reputationBlocked && !reputationUnavailable)

  // Auditing is best-effort for protected identities: logging must never become
  // a second access-control gate.
  try {
    if (ipRecorded) {
      await recordDashboardSession({ discordUserId, sessionId: crypto.randomUUID(), ipAddress: ip, userAgent: request.headers.get('user-agent'), route: new URL(request.url).pathname, success: allowed })
    }
    await recordSecurityEvent(allowed ? (protectedIdentity ? 'protected_dashboard_access' : 'dashboard_ip_recorded') : ipBlocked ? 'dashboard_ip_blocked' : reputationBlocked ? 'dashboard_ip_masking_blocked' : reputationUnavailable ? 'dashboard_ip_reputation_unavailable' : 'dashboard_access_denied', discordUserId, ip, block?.created_by_discord_id ?? null, protectedIdentity ? 'Protected Spartan identity — unrestricted access.' : allowed ? 'Spartan website identity authenticated independently of Discord.' : ipBlocked ? 'Active Spartan IP block' : reputationBlocked ? (ipReputation?.reason || 'IP masking detected') : reputationUnavailable ? 'IP reputation could not be verified; access denied until verification is available.' : 'No active Spartan account access', { authUserId, discordOptional: true, role: access?.role ?? null, ipRecorded, reputation: ipReputation, route: new URL(request.url).pathname })
  } catch {
    if (!protectedIdentity) throw new Error('Spartan security audit failed.')
  }

  return { allowed, ip, ipRecorded, access, block, protectedIdentity, ipReputation, reason: protectedIdentity ? null : !ipRecorded ? 'ip_unavailable' : ipBlocked ? 'ip_blocked' : reputationBlocked ? 'ip_masking_detected' : reputationUnavailable ? 'ip_reputation_unavailable' : !identityAllowed ? 'access_inactive' : null }
}
