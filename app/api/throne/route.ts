import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan throne service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const discordId = extractDiscordId(user)
    if (!discordId) return NextResponse.json({ error: 'Security identity unavailable.' }, { status: 403 })

    const db = adminClient()
    const { data: province, error: provinceError } = await db
      .from('provinces')
      .select('*')
      .eq('discord_id', discordId)
      .limit(1)
      .maybeSingle()
    if (provinceError) throw provinceError
    if (!province) return NextResponse.json({ error: 'Your province record is not currently available.' }, { status: 404 })

    let throne = null
    const { data: throneRow, error: throneError } = await db
      .from('intel_throne')
      .select('*')
      .eq('kd_code', province.kd_code)
      .eq('province', province.name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (throneError) throw throneError
    throne = throneRow

    return NextResponse.json({
      ok: true,
      source: throne ? 'intel_throne' : 'provinces',
      capturedAt: throne?.created_at ?? province.updated_at ?? null,
      throne,
      province,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Throne data unavailable' }, { status: 500 })
  }
}
