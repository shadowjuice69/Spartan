import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

type Snapshot = Record<string, any>

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan history service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function object(v: unknown): Snapshot { return v && typeof v === 'object' && !Array.isArray(v) ? v as Snapshot : {} }
function number(v: unknown) { const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v); return Number.isFinite(n) ? n : null }
function value(d: Snapshot, ...keys: string[]) { for (const key of keys) if (d[key] !== undefined && d[key] !== null) return d[key]; return null }
function projectionData(row: any) { const state = object(row?.state); return object(state.data).raw_kind ? object(state.data) : state.data ? object(state.data) : state }
function kingdomProvince(row: any, provinceName: string) {
  const data = projectionData(row)
  const rows = Array.isArray(data.provinces) ? data.provinces : []
  return rows.find((p: any) => String(p?.name ?? '').trim().toLowerCase() === provinceName.trim().toLowerCase()) ?? {}
}
function snapshotFromState(province: any, state: Snapshot, observedAt: string | null, source: string): Snapshot {
  return {
    observed_at: observedAt ?? new Date().toISOString(),
    province_id: province.province_id,
    kingdom_id: province.kingdom_code,
    acres: number(value(state, 'acres', 'land')),
    networth: number(value(state, 'nw', 'networth')),
    population: number(value(state, 'population')),
    peons: number(value(state, 'peons', 'peasants')),
    soldiers: number(value(state, 'soldiers')),
    off_specs: number(value(state, 'off_specs', 'offSpecs')),
    def_specs: number(value(state, 'def_specs', 'defSpecs')),
    elites: number(value(state, 'elites')),
    thieves: number(value(state, 'thieves')),
    wizards: number(value(state, 'wizards')),
    generals: number(value(state, 'generals')),
    prisoners: number(value(state, 'prisoners')),
    war_horses: number(value(state, 'war_horses', 'warHorses')),
    offense: number(value(state, 'offense', 'off')),
    defense: number(value(state, 'defense', 'def')),
    mana: number(value(state, 'mana')),
    stealth: number(value(state, 'stealth', 'stlth')),
    build_efficiency: number(value(state, 'build_efficiency', 'buildEfficiency', 'be')),
    wages: number(value(state, 'wages')),
    source,
    canonical: true,
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500)
    const requestedProvince = url.searchParams.get('province')?.trim() || null
    const db = adminClient()
    const discordId = extractDiscordId(user)

    const { data: account, error: accountError } = await db.from('spartan_accounts')
      .select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role')
      .eq('auth_user_id', user.id).maybeSingle()
    if (accountError) throw accountError
    if (!account?.province_name || !account?.province_location) return NextResponse.json({ error: 'Your Spartan account is not linked to a province yet.' }, { status: 404 })

    const { data: home, error: homeError } = await db.from('spartan_province_registry')
      .select('*').eq('province_name', account.province_name).eq('kingdom_code', account.province_location).maybeSingle()
    if (homeError) throw homeError
    if (!home) return NextResponse.json({ error: 'Your province is not present in the Spartan province registry.' }, { status: 404 })

    let province = home
    if (requestedProvince) {
      const result = await db.from('spartan_province_registry').select('*')
        .eq('kingdom_code', home.kingdom_code).eq('province_name', requestedProvince).maybeSingle()
      if (result.error) throw result.error
      if (!result.data) return NextResponse.json({ error: 'That province is not available in your kingdom.' }, { status: 404 })
      province = result.data
    }

    const [historyResult, projectionsResult, eventsResult] = await Promise.all([
      db.from('spartan_province_history').select('*').eq('province_id', province.province_id).order('observed_at', { ascending: true }).limit(limit),
      db.from('spartan_state_projection').select('province_id,kingdom_id,state,version,updated_at').eq('kingdom_id', province.kingdom_code).order('updated_at', { ascending: false }).limit(100),
      db.from('spartan_event_history').select('*').eq('province_id', province.province_id).order('occurred_at', { ascending: false }).limit(100),
    ])
    if (historyResult.error) throw historyResult.error
    if (projectionsResult.error) throw projectionsResult.error
    if (eventsResult.error) throw eventsResult.error

    const projections = projectionsResult.data || []
    const direct = projections.find((p: any) => String(p.province_id).trim().toLowerCase() === province.province_name.trim().toLowerCase())
    const kingdomProjection = projections.find((p: any) => projectionData(p).raw_kind === 'kingdom_details') || projections[0]
    const currentState = direct ? projectionData(direct) : kingdomProvince(kingdomProjection, province.province_name)
    const current = snapshotFromState(province, currentState, direct?.updated_at || kingdomProjection?.updated_at || province.updated_at, 'spartan_state_projection')

    const rows = (historyResult.data || []).map((row: any) => ({ ...current, ...row, source: row.source || 'spartan_province_history', canonical: true }))
    const merged = new Map<string, Snapshot>()
    for (const row of rows) merged.set(`${row.province_id}:${row.observed_at}`, row)
    merged.set(`${current.province_id}:${current.observed_at}`, current)
    const snapshots = [...merged.values()].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)).slice(-limit)

    return NextResponse.json({
      ok: true,
      snapshots,
      events: eventsResult.data || [],
      identity: {
        screenName: account.screen_name || null,
        discordUserId: account.discord_user_id ? String(account.discord_user_id) : discordId,
        provinceId: province.province_id,
        provinceName: province.province_name,
        kingdomId: province.kingdom_code,
        role: account.role || null,
      },
      meta: { snapshotCount: snapshots.length, eventCount: (eventsResult.data || []).length, latestObservedAt: snapshots.at(-1)?.observed_at || null, source: 'spartan_state_projection+spartan_province_history', projectionVersion: direct?.version ?? kingdomProjection?.version ?? null },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History query failed' }, { status: 500 })
  }
}
