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

function projectionData(row: any) {
  const state = row?.state
  return state?.data && typeof state.data === 'object' ? state.data : (state || {})
}

function findProvince(data: any, name: string) {
  const rows = Array.isArray(data?.provinces) ? data.provinces : []
  return rows.find((p: any) => String(p?.name ?? '').trim().toLowerCase() === name.trim().toLowerCase()) ?? {}
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(request.url).searchParams
    const requestedProvinceId = params.get('provinceId')?.trim() || null
    const requestedProvinceName = params.get('province')?.trim() || null
    const db = adminClient()
    const discordId = extractDiscordId(user)

    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError

    const accountDiscordId = account?.discord_user_id ? String(account.discord_user_id) : discordId
    if (!account?.province_name || !account?.province_location) return NextResponse.json({ error: 'Your Spartan account is not linked to a province yet.' }, { status: 404 })

    const { data: home, error: homeError } = await db.from('spartan_province_registry').select('*').eq('province_name', account.province_name).eq('kingdom_code', account.province_location).maybeSingle()
    if (homeError) throw homeError
    if (!home) return NextResponse.json({ error: 'Your province is not present in the Spartan province registry.' }, { status: 404 })

    let province = home
    if (requestedProvinceId || requestedProvinceName) {
      const query = db.from('spartan_province_registry').select('*').eq('kingdom_code', home.kingdom_code)
      const result = requestedProvinceId
        ? await query.eq('province_id', requestedProvinceId).maybeSingle()
        : await query.eq('province_name', requestedProvinceName).maybeSingle()
      if (result.error) throw result.error
      province = result.data
    }
    if (!province) return NextResponse.json({ error: 'That province is not available in your kingdom.' }, { status: 404 })

    const { data: projections, error: projectionError } = await db
      .from('spartan_state_projection')
      .select('province_id,kingdom_id,state,version,updated_at,source_flow_id')
      .eq('kingdom_id', province.kingdom_code)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (projectionError) throw projectionError

    const projection = projections?.find((p: any) => String(p.province_id).trim().toLowerCase() === province.province_name.trim().toLowerCase())
      || projections?.find((p: any) => projectionData(p)?.raw_kind === 'kingdom_details')
      || null
    const data = projectionData(projection)
    const captured = Array.isArray(data?.provinces) ? findProvince(data, province.province_name) : (data || {})

    const { data: history, error: historyError } = await db
      .from('spartan_province_history')
      .select('*')
      .eq('province_id', province.province_id)
      .order('observed_at', { ascending: false })
      .limit(1)
    if (historyError) throw historyError

    const snapshot = {
      province: province.province_name,
      kd_code: province.kingdom_code,
      race: captured.race ?? null,
      personality: captured.personality ?? null,
      land: captured.land ?? captured.acres ?? null,
      networth: captured.nw ?? captured.networth ?? null,
      offense: captured.off ?? captured.offense ?? null,
      defense: captured.def ?? captured.defense ?? null,
      peasants: captured.peons ?? captured.peasants ?? null,
      thieves: captured.thieves ?? null,
      wizards: captured.wizards ?? null,
      mana: captured.mana ?? null,
      stealth: captured.stealth ?? captured.stlth ?? null,
      be: captured.build_efficiency ?? captured.buildEfficiency ?? captured.be ?? null,
      wages: captured.wages ?? null,
      tpa: captured.tpa ?? null,
      wpa: captured.wpa ?? null,
      troops: {
        soldiers: captured.soldiers ?? null,
        off_specs: captured.off_specs ?? null,
        def_specs: captured.def_specs ?? null,
        elites: captured.elites ?? null,
        war_horses: captured.war_horses ?? captured.warHorses ?? null,
        prisoners: captured.prisoners ?? null,
      },
      created_at: projection?.updated_at ?? history?.[0]?.observed_at ?? province.updated_at ?? null,
      source: projection ? 'spartan_state_projection' : 'spartan_province_registry',
      projectionVersion: projection?.version ?? null,
    }

    return NextResponse.json({
      ok: true,
      source: snapshot.source,
      capturedAt: snapshot.created_at,
      identity: {
        screenName: account?.screen_name ?? null,
        discordUserId: accountDiscordId,
        provinceId: province.province_id,
        provinceName: province.province_name,
        kingdomId: province.kingdom_code,
        role: account?.role ?? null,
      },
      throne: snapshot,
      province: { ...province, state: captured, projectionUpdatedAt: projection?.updated_at ?? null },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Throne data unavailable' }, { status: 500 })
  }
}
