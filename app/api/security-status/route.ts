import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId, requestIp } from '@/lib/spartan/security'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const discordId = extractDiscordId(data.user)

    if (!discordId) {
      return NextResponse.json({ recorded: false, reason: 'discord_identity_required' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Spartan security service is not configured.')

    const admin = createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: sessions, error } = await admin
      .from('spartan_security_sessions')
      .select('ip_address,success,created_at,dashboard_route')
      .eq('discord_user_id', discordId)
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(2)

    if (error) throw new Error(`Spartan security status lookup failed: ${error.message}`)

    const current = sessions?.[0] ?? null
    const previous = sessions?.[1] ?? null
    const currentIp = requestIp(request)
    const ipChanged = Boolean(current?.ip_address && (!previous || previous.ip_address !== current.ip_address))
    const firstKnownIp = Boolean(current?.ip_address && !previous)
    const showPopup = Boolean(current?.ip_address && (firstKnownIp || ipChanged) && (!currentIp || current.ip_address === currentIp))

    return NextResponse.json({
      recorded: showPopup,
      ip: current?.ip_address ?? null,
      recordedAt: current?.created_at ?? null,
      route: current?.dashboard_route ?? null,
      access: current ? 'active' : null,
      ipChanged: firstKnownIp || ipChanged,
    })
  } catch (error) {
    return NextResponse.json({ recorded: false, reason: error instanceof Error ? error.message : 'security_check_failed' }, { status: 500 })
  }
}
