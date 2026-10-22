import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { buildHourlyReport } from '@/lib/spartan/jeeves-hourly'

export const dynamic = 'force-dynamic'

type Row = Record<string, any>
function db() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error('Jeeves service is not configured.'); return createAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) }
function num(v: unknown): number | null { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null }
function find(o: unknown, keys: string[]): unknown { if (!o || typeof o !== 'object') return null; const r = o as Row; for (const k of keys) if (r[k] != null) return r[k]; for (const v of Object.values(r)) { const x = find(v, keys); if (x != null) return x } return null }
function parseLive(raw: unknown, simple?: unknown) {
  const h = String(raw || '')
  const out: Row = {}
  const m = h.match(/<table[^>]*id="resource-bar"[\s\S]*?<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/i)
  if (m) {
    const c = [...m[1].matchAll(/<th[^>]*>\s*([^<]+?)\s*<\/th>/gi)].map(x => x[1].replace(/,/g, '').trim())
    if (c.length >= 6) {
      const [gold, population, food, runes, networth, acres] = c.map(num)
      Object.assign(out, { acres, networth, population, gold, food, runes })
    }
  }
  const cm = h.match(/column-stats[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)
  if (cm) {
    const cells = [...cm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1])
    const firstNumber = (cellHtml: string) => {
      const t = String(cellHtml || '').replace(/<[^>]+>/g, ' ')
      const mm = t.match(/-?[\d,]+(?:\.\d+)?/)
      return mm ? Number(mm[0].replace(/,/g, '')) : null
    }
    if (cells.length >= 20) Object.assign(out, {
      acres: out.acres ?? firstNumber(cells[4]), networth: out.networth ?? firstNumber(cells[18]),
      gold: out.gold ?? firstNumber(cells[10]), food: out.food ?? firstNumber(cells[12]),
      runes: out.runes ?? firstNumber(cells[14]), population: out.population ?? firstNumber(cells[6]),
      soldiers: firstNumber(cells[1]), off_specs: firstNumber(cells[3]), def_specs: firstNumber(cells[5]),
      elites: firstNumber(cells[7]), thieves: firstNumber(cells[9]), wizards: firstNumber(cells[11]),
      war_horses: firstNumber(cells[13]), prisoners: firstNumber(cells[15]),
      offense: firstNumber(cells[17]), defense: firstNumber(cells[19]),
    })
  }

  // UtopiaIntel stores the visible page as data_simple rather than rawDom. Read
  // the same current-state fields from its tab-separated Throne capture.
  const text = String(simple || '')
  const read = (label: string) => {
    const match = text.match(new RegExp('(?:^|[\\t\\n])' + label + '[\\t ]+(-?[\\d,]+)', 'i'))
    return match ? Number(match[1].replace(/,/g, '')) : null
  }
  const fallbacks: Row = {
    acres: read('Land'), networth: read('Networth'), gold: read('Money'), food: read('Food'), runes: read('Runes'),
    soldiers: read('Soldiers'), thieves: read('Thieves'), wizards: read('Wizards'),
    war_horses: read('War Horses'), prisoners: read('Prisoners'),
    offense: read('Off. Points'), defense: read('Def. Points'),
  }
  for (const [key, value] of Object.entries(fallbacks)) if (out[key] == null && value != null) out[key] = value
  return Object.keys(out).length ? out : null
}
async function context() {
  const auth = await createClient(); const { data: { user } } = await auth.auth.getUser(); if (!user) throw new Error('Unauthorized')
  const supabase = db(); const { data: account, error: ae } = await supabase.from('spartan_accounts').select('id,screen_name,province_name,province_location,discord_user_id,last_login_at,previous_login_at').eq('auth_user_id', user.id).maybeSingle(); if (ae) throw ae; if (!account) throw new Error('Spartan account identity not found.')
  let { data: registry, error: re } = await supabase.from('spartan_province_registry').select('province_id,province_name,kingdom_code,user_id,updated_at').eq('province_name', account.province_name).eq('kingdom_code', account.province_location).order('updated_at', { ascending: false }).limit(1).maybeSingle(); if (re) throw re
  if (!registry?.province_id) { const r = await supabase.from('spartan_province_registry').select('province_id,province_name,kingdom_code,user_id,updated_at').ilike('province_name', account.province_name).eq('kingdom_code', account.province_location).order('updated_at', { ascending: false }).limit(1).maybeSingle(); if (r.error) throw r.error; registry = r.data }
  if (!registry?.province_id) throw new Error('Spartan province registry link is missing.')
  const now = new Date().toISOString(); const { error: sync } = await supabase.from('spartan_province_registry').update({ user_id: user.id, province_name: account.province_name, kingdom_code: account.province_location, last_seen_at: now, updated_at: now }).eq('province_id', registry.province_id); if (sync) throw sync
  return { user, supabase, account, registry: { ...registry, user_id: user.id, province_name: account.province_name, kingdom_code: account.province_location, updated_at: now } }
}
export async function GET(request: Request) {
  // Lightweight check used by the Jeeves popup: tells the client which login this is, without building a full briefing.
  if (new URL(request.url).searchParams.get('peek') === '1') {
    try {
      const auth = await createClient(); const { data: { user } } = await auth.auth.getUser()
      if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      const supabase = db()
      const [{ data: acct, error: ae }, { data: prof, error: pe }] = await Promise.all([
        supabase.from('spartan_accounts').select('last_login_at').eq('auth_user_id', user.id).maybeSingle(),
        supabase.from('spartan_jeeves_profiles').select('introduced_at').eq('auth_user_id', user.id).maybeSingle(),
      ])
      if (ae) throw ae; if (pe) throw pe
      return NextResponse.json({ ok: true, peek: true, userId: user.id, loginAt: acct?.last_login_at ?? null, firstArrival: !prof?.introduced_at })
    } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Jeeves check unavailable' }, { status: 503 }) }
  }
  if (new URL(request.url).searchParams.get('hourly') === '1') {
    try {
      const nowMs = Date.now()
      const asked = Date.parse(new URL(request.url).searchParams.get('since') || '')
      const sinceMs = Math.min(Math.max(Number.isFinite(asked) ? asked : nowMs - 3_600_000, nowMs - 24 * 3_600_000), nowMs - 60_000)
      const { supabase, account, registry } = await context()
      const [{ data: history, error: he }, { data: intel, error: ie }, { data: events, error: ee }] = await Promise.all([
        supabase.from('spartan_province_history').select('observed_at,acres,networth,population,soldiers,off_specs,def_specs,elites,thieves,wizards,offense,defense,mana,stealth').eq('province_id', account.id).order('observed_at', { ascending: false }).limit(300),
        supabase.from('spartan_intel_records').select('captured_at,raw_payload').eq('province_id', account.id).eq('page_kind', 'throne').order('captured_at', { ascending: false }).limit(5),
        supabase.from('spartan_event_history').select('occurred_at,troops_lost,thieves_lost,wizards_lost').eq('province_id', account.id).gte('occurred_at', new Date(sinceMs).toISOString()).order('occurred_at', { ascending: false }).limit(200),
      ])
      if (he) throw he
      if (ie) throw ie
      if (ee) throw ee
      const liveRow = (intel || []).find((row: any) => {
        const parsed = parseLive(row.raw_payload?.rawDom ?? row.raw_payload?.data_html, row.raw_payload?.data_simple)
        return parsed && (parsed.acres != null || parsed.networth != null)
      })
      const report = buildHourlyReport({
        history: history || [],
        live: liveRow ? parseLive(liveRow.raw_payload?.rawDom ?? liveRow.raw_payload?.data_html, liveRow.raw_payload?.data_simple) : null,
        liveAt: liveRow?.captured_at ?? null,
        events: events || [],
        sinceMs,
      })
      return NextResponse.json({ ok: true, hourly: true, since: new Date(sinceMs).toISOString(), now: new Date(nowMs).toISOString(), name: account.screen_name || account.province_name, province: account.province_name, ...report })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Jeeves hourly report unavailable'
      return NextResponse.json({ ok: false, error: message }, { status: message === 'Unauthorized' ? 401 : 503 })
    }
  }

  try {
    const { user, supabase, account, registry } = await context()
    let { data: profile, error: pe } = await supabase.from('spartan_jeeves_profiles').select('*').eq('auth_user_id', user.id).maybeSingle(); if (pe) throw pe
    if (!profile) { const r = await supabase.from('spartan_jeeves_profiles').insert({ auth_user_id: user.id, discord_user_id: account.discord_user_id, province_id: registry.province_id, preferred_name: account.screen_name || account.province_name || 'Commander', briefing_count: 0 }).select('*').single(); if (r.error) throw r.error; profile = r.data }
    const [{ data: history, error: he }, { data: intel, error: ie }, { data: events, error: ee }] = await Promise.all([
      supabase.from('spartan_province_history').select('observed_at,acres,networth,population,soldiers,off_specs,def_specs,elites,thieves,wizards,offense,defense,mana,stealth').eq('province_id', account.id).order('observed_at', { ascending: false }).limit(2),
      supabase.from('spartan_intel_records').select('captured_at,parsed_payload,raw_payload').eq('province_id', account.id).eq('page_kind', 'throne').order('captured_at', { ascending: false }).limit(20),
      supabase.from('spartan_event_history').select('occurred_at,troops_lost,thieves_lost,wizards_lost').eq('province_id', account.id).order('occurred_at', { ascending: false }).limit(100)
    ]); if (he) throw he; if (ie) throw ie; if (ee) throw ee
    const latest: Row = history?.[0] || {}; const previous: Row = history?.[1] || {}; const snap: Row = { ...(intel?.[0]?.raw_payload || {}), ...(intel?.[0]?.parsed_payload || {}) }; const live = (intel || []).map((r: Row) => parseLive(r.raw_payload?.rawDom ?? r.raw_payload?.data_html, r.raw_payload?.data_simple)).find((r: any) => r && (r.acres != null || r.networth != null)); const state: Row = { acres: live?.acres ?? num(latest.acres), networth: live?.networth ?? num(latest.networth), population: live?.population ?? num(latest.population), soldiers: live?.soldiers ?? num(latest.soldiers), off_specs: live?.off_specs ?? num(latest.off_specs), def_specs: live?.def_specs ?? num(latest.def_specs), elites: live?.elites ?? num(latest.elites), thieves: live?.thieves ?? num(latest.thieves), wizards: live?.wizards ?? num(latest.wizards), offense: live?.offense ?? num(latest.offense), defense: live?.defense ?? num(latest.defense), mana: num(latest.mana), stealth: num(latest.stealth) };
    const changes = Object.fromEntries(Object.keys(state).map(k => [k, state[k] == null || previous[k] == null ? null : state[k] - num(previous[k])!])); const alerts = (events || []).flatMap((e: Row) => { const a: string[] = []; const troopsLost = num(e.troops_lost); const thievesLost = num(e.thieves_lost); const wizardsLost = num(e.wizards_lost); if (troopsLost !== null && troopsLost > 0) a.push(`Recorded troop losses: ${troopsLost.toLocaleString()}`); if (thievesLost !== null && thievesLost > 0) a.push(`Recorded thief losses: ${thievesLost.toLocaleString()}`); if (wizardsLost !== null && wizardsLost > 0) a.push(`Recorded wizard losses: ${wizardsLost.toLocaleString()}`); return a });
    const count = Number(profile.briefing_count || 0) + 1; const now = new Date().toISOString(); const up = await supabase.from('spartan_jeeves_profiles').update({ last_briefing_at: now, briefing_count: count, province_id: registry.province_id, discord_user_id: account.discord_user_id }).eq('id', profile.id); if (up.error) throw up.error
    return NextResponse.json({ ok: true, briefingId: `${profile.id}:${count}`, firstArrival: !profile.introduced_at, historyAvailable: Boolean(latest.observed_at || live), summary: latest.observed_at || live ? 'Verified province state is available.' : 'Province identity is linked, but no history is available yet.', jeeves: { preferredName: profile.preferred_name || account.screen_name || account.province_name, lastBriefingAt: now, briefingCount: count }, identity: { screenName: account.screen_name || account.province_name, provinceName: account.province_name, provinceLocation: account.province_location, kingdom: registry.kingdom_code, race: find(snap, ['race']) ? String(find(snap, ['race'])) : null, personality: find(snap, ['personality']) ? String(find(snap, ['personality'])) : null, lastLoginAt: account.previous_login_at || null, currentLoginAt: account.last_login_at || null }, latest: state, changes, away: { since: account.previous_login_at || account.last_login_at || null, eventCount: events?.length || 0, troopsLost: events?.reduce((n: number, e: Row) => n + (num(e.troops_lost) || 0), 0) || null, thievesLost: events?.reduce((n: number, e: Row) => n + (num(e.thieves_lost) || 0), 0) || null, wizardsLost: events?.reduce((n: number, e: Row) => n + (num(e.wizards_lost) || 0), 0) || null, alerts: [...new Set(alerts)] } })
  } catch (error) { const message = error instanceof Error ? error.message : 'Jeeves briefing unavailable'; return NextResponse.json({ ok: false, error: message }, { status: message === 'Unauthorized' ? 401 : 503 }) }
}
export async function POST(request: Request) { try { const auth = await createClient(); const { data: { user } } = await auth.auth.getUser(); if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }); const body = await request.json().catch(() => ({})); const name = typeof body.screenName === 'string' ? body.screenName.trim().replace(/\s+/g, ' ').slice(0, 40) : ''; if (!name) return NextResponse.json({ ok: false, error: 'A name is required.' }, { status: 400 }); const supabase = db(); const r = await supabase.from('spartan_jeeves_profiles').update({ preferred_name: name, introduced_at: new Date().toISOString() }).eq('auth_user_id', user.id).select('*').maybeSingle(); if (r.error) throw r.error; if (!r.data) throw new Error('Jeeves profile not found.'); return NextResponse.json({ ok: true, preferredName: r.data.preferred_name }) } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Jeeves save failed' }, { status: 400 }) } }
