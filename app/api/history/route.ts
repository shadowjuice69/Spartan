import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan history service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const provinceId = url.searchParams.get('province')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500)
    const db = adminClient()
    const discordId = extractDiscordId(user)

    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError

    const accountDiscordId = account?.discord_user_id ? String(account.discord_user_id) : discordId
    let province = null
    if (account?.province_name && account?.province_location) {
      const result = await db
        .from('provinces')
        .select('*')
        .eq('name', account.province_name)
        .eq('kd_code', account.province_location)
        .limit(1)
        .maybeSingle()
      if (result.error) throw result.error
      province = result.data
    }
    if (!province && accountDiscordId) {
      const result = await db.from('provinces').select('*').eq('discord_id', accountDiscordId).limit(1).maybeSingle()
      if (result.error) throw result.error
      province = result.data
    }
    if (!province) return NextResponse.json({ error: 'Your Spartan account is not linked to a province yet.' }, { status: 404 })

    const resolvedProvinceId = provinceId || province.id

    const { data: snapshotRows, error: snapshotError } = await db
      .from('spartan_province_history')
      .select('*')
      .eq('province_id', resolvedProvinceId)
      .order('observed_at', { ascending: true })
      .limit(limit)
    if (snapshotError) throw snapshotError

    const { data: eventRows, error: eventError } = await db
      .from('spartan_event_history')
      .select('*')
      .eq('province_id', resolvedProvinceId)
      .order('occurred_at', { ascending: false })
      .limit(100)
    if (eventError) throw eventError

    const snapshots = snapshotRows?.length ? snapshotRows : [{
      observed_at: province.updated_at,
      province_id: province.id,
      kingdom_id: province.kd_code,
      acres: Number(province.acres) || null,
      networth: Number(province.nw) || null,
      population: Number(province.peons) || null,
      soldiers: Number(province.soldiers) || null,
      off_specs: Number(province.off_specs) || null,
      def_specs: Number(province.def_specs) || null,
      elites: Number(province.elites) || null,
      thieves: Number(province.thieves) || null,
      wizards: Number(province.wizards) || null,
      offense: Number(province.off) || null,
      defense: Number(province.def) || null,
      mana: Number(province.mana) || null,
      stealth: Number(province.stlth) || null,
      build_efficiency: Number(province.be) || null,
      wages: Number(province.wages) || null,
      source: 'canonical_province',
    }]

    return NextResponse.json({
      ok: true,
      snapshots,
      events: eventRows ?? [],
      identity: {
        screenName: account?.screen_name ?? null,
        discordUserId: accountDiscordId,
        provinceId: province.id,
        provinceName: province.name,
        kingdomId: province.kd_code,
        role: account?.role ?? null,
      },
      meta: {
        snapshotCount: snapshots.length,
        eventCount: eventRows?.length ?? 0,
        latestObservedAt: snapshots.at(-1)?.observed_at ?? null,
        source: snapshotRows?.length ? 'province_history' : 'canonical_province',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History query failed' }, { status: 500 })
  }
}
