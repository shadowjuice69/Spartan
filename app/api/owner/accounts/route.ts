import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { extractDiscordId, isOwner, resolveDashboardIdentity } from '@/lib/spartan/security'

async function getOwnerUser(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return null
  const identity = await resolveDashboardIdentity(user.id, extractDiscordId(user))
  const discordId = identity.discordUserId
  return isOwner(discordId) ? { user, discordId } : null
}

function admin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  try {
    const owner = await getOwnerUser(request)
    if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 })

    const db = admin()
    const [{ data: accounts, error: accountError }, { data: sessions, error: sessionError }, usersResult] = await Promise.all([
      db.from('spartan_accounts')
        .select('id,auth_user_id,discord_user_id,screen_name,province_name,province_location,registration_ip,last_login_ip,account_status,role,created_at,updated_at,last_login_at,previous_login_at')
        .order('created_at', { ascending: true }),
      db.from('spartan_security_sessions')
        .select('discord_user_id,session_id,ip_address,user_agent,dashboard_route,success,created_at,ended_at')
        .order('created_at', { ascending: false })
        .limit(5000),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])

    if (accountError) throw new Error(accountError.message)
    if (sessionError) throw new Error(sessionError.message)
    if (usersResult.error) throw new Error(usersResult.error.message)

    const emails = new Map<string, string | null>()
    for (const u of usersResult.data.users || []) emails.set(u.id, u.email ?? null)

    const sessionRows = sessions || []
    const byDiscord = new Map<string, any[]>()
    for (const s of sessionRows) {
      const key = String(s.discord_user_id || '')
      if (!key) continue
      const list = byDiscord.get(key) || []
      list.push(s)
      byDiscord.set(key, list)
    }

    const rows = (accounts || []).map((a: any) => {
      const discord = a.discord_user_id ? String(a.discord_user_id) : ''
      const ss = byDiscord.get(discord) || []
      const successful = ss.filter(s => s.success)
      const latest = successful[0] || ss[0] || null
      const browsers = [...new Set(ss.map(s => String(s.user_agent || '')).filter(Boolean))].slice(0, 8)
      return {
        id: a.id,
        authUserId: a.auth_user_id,
        discordUserId: discord || null,
        screenName: a.screen_name,
        email: emails.get(a.auth_user_id) || null,
        provinceName: a.province_name,
        kingdom: a.province_location,
        registrationIp: a.registration_ip,
        lastLoginIp: a.last_login_ip,
        accountStatus: a.account_status,
        role: a.role,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        lastLoginAt: a.last_login_at,
        previousLoginAt: a.previous_login_at,
        sessionCount: ss.length,
        successfulSessionCount: successful.length,
        lastSeenAt: latest?.created_at || a.last_login_at || null,
        lastBrowser: latest?.user_agent || null,
        browsers,
      }
    })

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      owner: { discordUserId: owner.discordId },
      total: rows.length,
      active: rows.filter((r: any) => r.accountStatus === 'active').length,
      rows,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Owner account query failed.' }, { status: 500 })
  }
}
