import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

type HistoryRow = Record<string, any>

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan history service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function number(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function canonicalState(province: any): HistoryRow {
  const throne = province?.state_data?.throne ?? {}
  const state = province?.state_data ?? {}
  return {
    observed_at: province?.state_data?.throne_captured_at ?? province?.updated_at ?? new Date().toISOString(),
    province_id: province?.id ?? null,
    kingdom_id: province?.kd_code ?? province?.kingdom_id ?? null,
    acres: number(throne.acres ?? province?.acres),
    networth: number(throne.nw ?? province?.nw),
    population: number(throne.peons ?? province?.peons),
    soldiers: number(throne.soldiers ?? province?.soldiers),
    off_specs: number(throne.off_specs ?? province?.off_specs),
    def_specs: number(throne.def_specs ?? province?.def_specs),
    elites: number(throne.elites ?? province?.elites),
    thieves: number(throne.thieves ?? province?.thieves),
    wizards: number(throne.wizards ?? province?.wizards),
    offense: number(throne.off ?? province?.off),
    defense: number(throne.def ?? province?.def),
    mana: number(throne.mana ?? province?.mana),
    stealth: number(throne.stlth ?? province?.stlth),
    build_efficiency: number(throne.be ?? province?.be),
    wages: number(throne.wages ?? province?.wages),
    source: 'canonical_province',
    canonical: true,
    state_data: state,
  }
}

function normalizeSnapshot(row: HistoryRow, province: any): HistoryRow {
  const fallback = canonicalState(province)
  const normalized: HistoryRow = { ...fallback, ...row }
  for (const key of ['acres','networth','population','soldiers','off_specs','def_specs','elites','thieves','wizards','offense','defense','mana','stealth','build_efficiency','wages']) {
    if (normalized[key] == null) normalized[key] = fallback[key]
  }
  return normalized
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
      .from('spartan_accounts').select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role')
      .eq('auth_user_id', user.id).maybeSingle()
    if (accountError) throw accountError

    const accountDiscordId = account?.discord_user_id ? String(account.discord_user_id) : discordId
    let province: any = null
    if (account?.province_name && account?.province_location) {
      const result = await db.from('provinces').select('*').eq('name', account.province_name).eq('kd_code', account.province_location).limit(1).maybeSingle()
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
      .from('spartan_province_history').select('*').eq('province_id', resolvedProvinceId).order('observed_at', { ascending: true }).limit(limit)
    if (snapshotError) throw snapshotError

    const { data: eventRows, error: eventError } = await db
      .from('spartan_event_history').select('*').eq('province_id', resolvedProvinceId).order('occurred_at', { ascending: false }).limit(100)
    if (eventError) throw eventError

    const rawSnapshots = snapshotRows ?? []
    const snapshots = rawSnapshots.length ? rawSnapshots.map((row: any) => normalizeSnapshot(row, province)) : [canonicalState(province)]

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
        source: rawSnapshots.length ? 'province_history+canonical_fallback' : 'canonical_province',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History query failed' }, { status: 500 })
  }
}
