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
function number(v: unknown) { const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v); return Number.isFinite(n) ? n : null }
function object(v: unknown): HistoryRow { return v && typeof v === 'object' && !Array.isArray(v) ? v as HistoryRow : {} }
function payloadData(capture: any): HistoryRow {
  let value = object(capture?.parsed_payload ?? capture?.raw_payload)
  for (let i = 0; i < 6; i++) {
    const next = value.data ?? value.payload ?? value.throne ?? value.state ?? value.parsed
    if (!next || typeof next !== 'object' || Array.isArray(next)) break
    value = object(next)
  }
  return value
}
function value(d: HistoryRow, ...keys: string[]) { for (const key of keys) if (d[key] !== undefined && d[key] !== null) return d[key]; return null }
function captureSnapshot(capture: any, province: any): HistoryRow {
  const d = payloadData(capture)
  return {
    observed_at: capture?.captured_at ?? province?.state_data?.throne_captured_at ?? new Date().toISOString(),
    province_id: province?.id ?? capture?.province_id ?? null,
    kingdom_id: province?.kd_code ?? capture?.kingdom_id ?? null,
    acres: number(value(d, 'acres', 'land')), networth: number(value(d, 'nw', 'networth')),
    population: number(value(d, 'population')), peons: number(value(d, 'peons', 'peasants')),
    soldiers: number(value(d, 'soldiers')), off_specs: number(value(d, 'off_specs', 'offSpecs')),
    def_specs: number(value(d, 'def_specs', 'defSpecs')), elites: number(value(d, 'elites')),
    thieves: number(value(d, 'thieves')), wizards: number(value(d, 'wizards')),
    generals: number(value(d, 'generals')), prisoners: number(value(d, 'prisoners')),
    war_horses: number(value(d, 'war_horses', 'warHorses')), offense: number(value(d, 'offense', 'off')),
    defense: number(value(d, 'defense', 'def')), defense_home: number(value(d, 'defense_home', 'defenseHome')),
    mana: number(value(d, 'mana')), stealth: number(value(d, 'stealth', 'stlth')),
    r_tpa: number(value(d, 'r_tpa', 'rTpa')), o_tpa: number(value(d, 'o_tpa', 'oTpa')), d_tpa: number(value(d, 'd_tpa', 'dTpa')),
    r_wpa: number(value(d, 'r_wpa', 'rWpa')), o_wpa: number(value(d, 'o_wpa', 'oWpa')), d_wpa: number(value(d, 'd_wpa', 'dWpa')),
    build_efficiency: number(value(d, 'build_efficiency', 'buildEfficiency', 'be')), wages: number(value(d, 'wages')),
    age: number(value(d, 'age')), game_year: number(value(d, 'game_year', 'gameYear', 'year')),
    game_tick: value(d, 'game_tick', 'gameTick', 'tick') == null ? null : String(value(d, 'game_tick', 'gameTick', 'tick')),
    source: capture?.source ?? 'universal_capture', source_id: capture?.source_id ?? capture?.capture_id ?? null,
    raw_state: capture?.parsed_payload ?? capture?.raw_payload ?? {}, canonical: true,
  }
}
function projectionState(projection: any, province: any): HistoryRow {
  const state = object(projection?.state), data = object(state.data)
  const rows = Array.isArray(data.provinces) ? data.provinces : []
  const row = rows.find((p: any) => String(p?.name || '').trim().toLowerCase() === String(province?.name || '').trim().toLowerCase()) || {}
  const d = Object.keys(row).length ? row : data
  return {
    observed_at: projection?.updated_at ?? province?.updated_at ?? new Date().toISOString(),
    province_id: province?.id ?? projection?.province_id ?? null,
    kingdom_id: province?.kd_code ?? projection?.kingdom_id ?? null,
    acres: number(value(d, 'acres', 'land')), networth: number(value(d, 'nw', 'networth')),
    population: number(value(d, 'population')), soldiers: number(value(d, 'soldiers')),
    off_specs: number(value(d, 'off_specs', 'offSpecs')), def_specs: number(value(d, 'def_specs', 'defSpecs')),
    elites: number(value(d, 'elites')), thieves: number(value(d, 'thieves')), wizards: number(value(d, 'wizards')),
    offense: number(value(d, 'offense', 'off')), defense: number(value(d, 'defense', 'def')),
    mana: number(value(d, 'mana')), stealth: number(value(d, 'stealth', 'stlth')),
    build_efficiency: number(value(d, 'build_efficiency', 'buildEfficiency', 'be')), wages: number(value(d, 'wages')),
    source: 'spartan_state_projection', canonical: true, state_data: state,
  }
}
function canonicalState(province: any, projection?: any): HistoryRow {
  if (projection) {
    const projected = projectionState(projection, province)
    if (projected.acres != null || projected.networth != null) return projected
  }
  const throne = province?.state_data?.throne ?? {}
  return {
    observed_at: province?.state_data?.throne_captured_at ?? province?.updated_at ?? new Date().toISOString(),
    province_id: province?.id ?? null, kingdom_id: province?.kd_code ?? province?.kingdom_id ?? null,
    acres: number(throne.acres ?? province?.acres), networth: number(throne.nw ?? province?.nw),
    population: number(throne.peons ?? province?.peons), soldiers: number(throne.soldiers ?? province?.soldiers),
    off_specs: number(throne.off_specs ?? province?.off_specs), def_specs: number(throne.def_specs ?? province?.def_specs),
    elites: number(throne.elites ?? province?.elites), thieves: number(throne.thieves ?? province?.thieves),
    wizards: number(throne.wizards ?? province?.wizards), offense: number(throne.off ?? province?.off),
    defense: number(throne.def ?? province?.def), mana: number(throne.mana ?? province?.mana),
    stealth: number(throne.stlth ?? province?.stlth), build_efficiency: number(throne.be ?? province?.be),
    wages: number(throne.wages ?? province?.wages), source: 'canonical_province', canonical: true, state_data: province?.state_data ?? {},
  }
}
function normalizeSnapshot(row: HistoryRow, province: any, projection?: any): HistoryRow {
  const fallback = canonicalState(province, projection), normalized = { ...fallback, ...row }
  for (const key of ['acres','networth','population','soldiers','off_specs','def_specs','elites','thieves','wizards','offense','defense','mana','stealth','build_efficiency','wages']) if (normalized[key] == null) normalized[key] = fallback[key]
  return normalized
}
function hasTelemetry(row: HistoryRow) { return ['acres','networth','population','offense','defense','thieves','wizards'].some(k => row[k] != null) }

export async function GET(request: Request) {
  try {
    const supabase = await createClient(), { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(request.url), provinceId = url.searchParams.get('province'), limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500)
    const db = adminClient(), discordId = extractDiscordId(user)
    const { data: account, error: accountError } = await db.from('spartan_accounts').select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role').eq('auth_user_id', user.id).maybeSingle()
    if (accountError) throw accountError
    const accountDiscordId = account?.discord_user_id ? String(account.discord_user_id) : discordId
    let province: any = null
    if (account?.province_name && account?.province_location) { const r = await db.from('provinces').select('*').eq('name', account.province_name).eq('kd_code', account.province_location).limit(1).maybeSingle(); if (r.error) throw r.error; province = r.data }
    if (!province && accountDiscordId) { const r = await db.from('provinces').select('*').eq('discord_id', accountDiscordId).limit(1).maybeSingle(); if (r.error) throw r.error; province = r.data }
    if (!province) return NextResponse.json({ error: 'Your Spartan account is not linked to a province yet.' }, { status: 404 })
    const resolvedProvinceId = provinceId || province.id
    const projectionResult = await db.from('spartan_state_projection').select('province_id,kingdom_id,state,version,updated_at').eq('province_id', province.name).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (projectionResult.error) throw projectionResult.error
    const projection = projectionResult.data
    const [historyResult, eventResult, vaultResult] = await Promise.all([
      db.from('spartan_province_history').select('*').eq('province_id', resolvedProvinceId).order('observed_at', { ascending: true }).limit(limit),
      db.from('spartan_event_history').select('*').eq('province_id', resolvedProvinceId).order('occurred_at', { ascending: false }).limit(100),
      db.from('spartan_capture_vault').select('capture_id,province_id,kingdom_id,captured_at,source,source_id,page_kind,parsed_payload,raw_payload').eq('province_id', resolvedProvinceId).eq('page_kind', 'throne').order('captured_at', { ascending: false }).limit(Math.min(limit, 250)),
    ])
    if (historyResult.error) throw historyResult.error; if (eventResult.error) throw eventResult.error; if (vaultResult.error) throw vaultResult.error
    const historyRows = (historyResult.data ?? []).map((row: any) => normalizeSnapshot(row, province, projection)).filter(hasTelemetry)
    const captureRows = (vaultResult.data ?? []).map((capture: any) => captureSnapshot(capture, province)).filter(hasTelemetry)
    const merged = new Map<string, HistoryRow>()
    for (const row of [...historyRows, ...captureRows]) { const key = `${row.province_id}:${row.observed_at}`; const existing = merged.get(key); merged.set(key, existing ? { ...existing, ...row } : row) }
    let snapshots = [...merged.values()].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)).slice(-limit)
    if (!snapshots.length) snapshots = [canonicalState(province, projection)]
    return NextResponse.json({ ok: true, snapshots, events: eventResult.data ?? [], identity: { screenName: account?.screen_name ?? null, discordUserId: accountDiscordId, provinceId: province.id, provinceName: province.name, kingdomId: province.kd_code, role: account?.role ?? null }, meta: { snapshotCount: snapshots.length, eventCount: eventResult.data?.length ?? 0, latestObservedAt: snapshots.at(-1)?.observed_at ?? null, source: captureRows.length ? 'capture_vault+province_history+projection' : historyRows.length ? 'province_history+projection' : 'projection+canonical_province', projectionVersion: projection?.version ?? null } })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'History query failed' }, { status: 500 }) }
}
