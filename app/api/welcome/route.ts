import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'
type Row = Record<string, any>

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan welcome service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
function num(v: unknown) { const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v); return Number.isFinite(n) ? n : null }
function obj(v: unknown): Row { return v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {} }
function payload(capture: any) {
  let v = obj(capture?.parsed_payload ?? capture?.raw_payload)
  for (let i = 0; i < 6; i++) {
    const next = v.data ?? v.payload ?? v.throne ?? v.state ?? v.parsed
    if (!next || typeof next !== 'object' || Array.isArray(next)) break
    v = obj(next)
  }
  return v
}
function pick(v: Row, ...keys: string[]) { for (const k of keys) if (v[k] !== undefined && v[k] !== null) return v[k]; return null }
function state(province: any): Row {
  const t = province?.state_data?.throne ?? {}
  return { observed_at: province?.state_data?.throne_captured_at ?? province?.updated_at ?? new Date().toISOString(), province_id: province?.id, kingdom_id: province?.kd_code, acres: num(t.acres ?? province?.acres), networth: num(t.nw ?? province?.nw), population: num(t.peons ?? province?.peons), soldiers: num(t.soldiers ?? province?.soldiers), off_specs: num(t.off_specs ?? province?.off_specs), def_specs: num(t.def_specs ?? province?.def_specs), elites: num(t.elites ?? province?.elites), thieves: num(t.thieves ?? province?.thieves), wizards: num(t.wizards ?? province?.wizards), offense: num(t.off ?? province?.off), defense: num(t.def ?? province?.def), mana: num(t.mana ?? province?.mana), stealth: num(t.stlth ?? province?.stlth), build_efficiency: num(t.be ?? province?.be), wages: num(t.wages ?? province?.wages), source: 'canonical_province' }
}
function captureState(c: any, province: any): Row {
  const d = payload(c)
  return { observed_at: c?.captured_at ?? province?.state_data?.throne_captured_at ?? new Date().toISOString(), province_id: province?.id ?? c?.province_id, kingdom_id: province?.kd_code ?? c?.kingdom_id, acres: num(pick(d, 'acres', 'land')), networth: num(pick(d, 'nw', 'networth')), population: num(pick(d, 'population', 'peons', 'peasants')), soldiers: num(pick(d, 'soldiers')), off_specs: num(pick(d, 'off_specs', 'offSpecs')), def_specs: num(pick(d, 'def_specs', 'defSpecs')), elites: num(pick(d, 'elites')), thieves: num(pick(d, 'thieves')), wizards: num(pick(d, 'wizards')), offense: num(pick(d, 'offense', 'off')), defense: num(pick(d, 'defense', 'def')), mana: num(pick(d, 'mana')), stealth: num(pick(d, 'stealth', 'stlth')), build_efficiency: num(pick(d, 'build_efficiency', 'buildEfficiency', 'be')), wages: num(pick(d, 'wages')), source: c?.source ?? 'capture_vault' }
}
function normalize(row: Row, fallback: Row) {
  const out = { ...fallback, ...row }
  for (const k of ['acres','networth','population','soldiers','off_specs','def_specs','elites','thieves','wizards','offense','defense','mana','stealth','build_efficiency','wages']) if (out[k] == null) out[k] = fallback[k]
  return out
}
async function verified() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const discordId = extractDiscordId(user)
  const admin = db()
  const { data: account, error } = await admin.from('spartan_accounts').select('screen_name,discord_user_id,province_name,province_location,previous_login_at,last_login_at,created_at,role').eq('auth_user_id', user.id).maybeSingle()
  if (error) throw error
  if (!account) return { error: NextResponse.json({ error: 'Spartan account identity not found.' }, { status: 404 }) }
  const { data: jeeves, error: jeevesError } = await admin.from('spartan_jeeves_profiles').select('*').eq('auth_user_id', user.id).maybeSingle()
  if (jeevesError) throw jeevesError
  return { admin, account, discordId: String(account.discord_user_id || discordId || '') || null, authUserId: user.id, jeeves }
}

export async function POST(request: Request) {
  try {
    const v = await verified(); if ('error' in v) return v.error
    const body = await request.json().catch(() => ({})); const name = typeof body.screenName === 'string' ? body.screenName.trim().replace(/\s+/g, ' ') : ''
    if (!name) return NextResponse.json({ error: 'A Spartan name is required.' }, { status: 400 })
    if (name.length > 40) return NextResponse.json({ error: 'Keep your Spartan name to 40 characters or fewer.' }, { status: 400 })
    let q = v.admin.from('provinces').select('id').eq('name', v.account.province_name || '')
    if (v.account.province_location) q = q.eq('kd_code', v.account.province_location)
    let { data: province, error } = await q.limit(1).maybeSingle(); if (error) throw error
    if (!province && v.discordId) { const r = await v.admin.from('provinces').select('id').eq('discord_id', v.discordId).limit(1).maybeSingle(); if (r.error) throw r.error; province = r.data }
    const now = new Date().toISOString()
    const { data: profile, error: pe } = await v.admin.from('spartan_jeeves_profiles').upsert({ auth_user_id: v.authUserId, discord_user_id: v.discordId, province_id: province?.id ?? null, preferred_name: name, introduced_at: v.jeeves?.introduced_at ?? now, last_briefing_at: now, briefing_count: (v.jeeves?.briefing_count ?? 0) + 1, updated_at: now }, { onConflict: 'auth_user_id' }).select('*').single()
    if (pe) throw pe
    const { error: ae } = await v.admin.from('spartan_accounts').update({ screen_name: name }).eq('auth_user_id', v.authUserId); if (ae) throw ae
    return NextResponse.json({ ok: true, jeeves: profile, screenName: name })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to establish Jeeves.' }, { status: 500 }) }
}

export async function GET() {
  try {
    const v = await verified(); if ('error' in v) return v.error
    let q = v.admin.from('provinces').select('*').eq('name', v.account.province_name || '')
    if (v.account.province_location) q = q.eq('kd_code', v.account.province_location)
    let { data: province, error } = await q.limit(1).maybeSingle(); if (error) throw error
    if (!province && v.discordId) { const r = await v.admin.from('provinces').select('*').eq('discord_id', v.discordId).limit(1).maybeSingle(); if (r.error) throw r.error; province = r.data }
    if (!province) return NextResponse.json({ error: 'Your Spartan account is verified, but your province record is not currently available.' }, { status: 404 })

    const since = v.jeeves?.last_briefing_at || v.account.previous_login_at || v.account.created_at
    const [h, c, e] = await Promise.all([
      v.admin.from('spartan_province_history').select('*').eq('province_id', province.id).order('observed_at', { ascending: false }).limit(10),
      v.admin.from('spartan_capture_vault').select('capture_id,province_id,kingdom_id,captured_at,source,source_id,page_kind,parsed_payload,raw_payload').eq('province_id', province.id).eq('page_kind', 'throne').order('captured_at', { ascending: false }).limit(10),
      v.admin.from('spartan_event_history').select('id,occurred_at,event_type,raw_text,acres_change,troops_lost,thieves_lost,wizards_lost,peasants_change,gold_change,food_change,runes_change,mana_change,attacker,defender,target_kingdom,payload').eq('province_id', province.id).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(100),
    ])
    if (h.error) throw h.error; if (c.error) throw c.error; if (e.error) throw e.error

    const events: Row[] = (e.data ?? []) as Row[]
    const fallback = state(province)
    const rows = [...(h.data ?? []).map(x => normalize(x, fallback)), ...(c.data ?? []).map(x => captureState(x, province))]
    const merged = new Map<string, Row>()
    for (const row of rows) { const key = `${row.province_id}:${row.observed_at}`; merged.set(key, { ...(merged.get(key) ?? {}), ...row }) }
    const snapshots = [...merged.values()].sort((a,b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
    const latest = snapshots.at(-1) ?? fallback
    const previous = snapshots.length > 1 ? snapshots.at(-2) : null
    const delta = (k: string) => { const a = num(latest[k]); const b = previous ? num(previous[k]) : null; return a != null && b != null ? a - b : null }
    const totals = (k: string) => events.reduce((s, x) => s + (num(x[k]) ?? 0), 0)
    const critical = events.filter(x => /attack|war|ambush|plague|failed|loss|destroy|raze/i.test(`${x.event_type ?? ''} ${x.raw_text ?? ''}`))
    const alerts: string[] = []; if (num(latest.defense) != null && num(latest.defense) < 0) alerts.push('Your current defensive state needs attention.'); if (critical.length) alerts.push(`${critical.length} combat or loss event${critical.length === 1 ? '' : 's'} occurred while you were away.`)
    const firstArrival = !v.jeeves?.introduced_at; const name = v.jeeves?.preferred_name || v.account.screen_name || ''
    return NextResponse.json({ ok: true, firstArrival, firstLogin: firstArrival, historyAvailable: Boolean(previous), jeeves: { name: 'Jeeves', title: 'Personal Steward', introducedAt: v.jeeves?.introduced_at ?? null, preferredName: name, lastBriefingAt: v.jeeves?.last_briefing_at ?? null, briefingCount: v.jeeves?.briefing_count ?? 0 }, identity: { screenName: name, discordId: v.discordId, role: v.account.role, provinceId: province.id, provinceName: province.name, provinceLocation: province.location || province.slot || v.account.province_location, kingdom: province.kd_code, race: province.race, personality: province.personality, lastLoginAt: v.account.previous_login_at, currentLoginAt: v.account.last_login_at }, province, latest, changes: { acres: delta('acres'), networth: delta('networth'), population: delta('population'), soldiers: delta('soldiers'), off_specs: delta('off_specs'), def_specs: delta('def_specs'), elites: delta('elites'), thieves: delta('thieves'), wizards: delta('wizards'), offense: delta('offense'), defense: delta('defense'), mana: delta('mana'), stealth: delta('stealth') }, away: { since, eventCount: events.length, acresChange: totals('acres_change'), troopsLost: totals('troops_lost'), thievesLost: totals('thieves_lost'), wizardsLost: totals('wizards_lost'), peasantsChange: totals('peasants_change'), goldChange: totals('gold_change'), foodChange: totals('food_change'), runesChange: totals('runes_change'), manaChange: totals('mana_change'), events, alerts } })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Jeeves briefing failed' }, { status: 500 }) }
}
