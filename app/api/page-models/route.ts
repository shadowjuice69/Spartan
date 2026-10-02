import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  parseBuildings, parseScience, parseMilitary, parseState, parseThrone, parseKingdomDetails,
  parseGridRows, pathOf, toNum,
} from '@/lib/spartan/page-models'

export const dynamic = 'force-dynamic'

// Lean on purpose: only small columns, never the full page capture (raw_payload).
// The old Intel query pulled ~18 MB per request and timed out.
const COLUMNS = 'id,page_kind,url,source,captured_at,created_at,parsed_payload,raw_text'
const CACHE = new Map<string, { at: number; body: any }>()
const TTL_MS = 12_000

const KINDS: Record<string, string[]> = {
  military: ['military', 'council_military'],
  science: ['science', 'council_science'],
  buildings: ['buildings', 'council_internal', 'survey'],
  province: ['throne', 'kingdom', 'province_state'],
  kingdom: ['kingdom'],
  command: [], // built by buildCommandModel below, not by the generic query
}

type Rec = {
  id: string; page_kind: string; url: string; source: string | null; captured_at: string | null
  created_at: string; parsed_payload: any; raw_text: string | null
}

function fail(error: any): never {
  throw new Error(error?.message || error?.details || 'Query failed')
}

function fields(record?: Rec | null) {
  const p = record?.parsed_payload
  if (!p || typeof p !== 'object') return []
  return Object.entries(p)
    .filter(([key]) => key !== 'pageSteward')
    .map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : value }))
}

function latestByPath(records: Rec[], path: string) {
  return records.find(r => pathOf(r.url) === path) || null
}
function allByPath(records: Rec[], path: string) {
  return records.filter(r => pathOf(r.url) === path)
}
const when = (r: Rec) => r.captured_at || r.created_at

function captureLog(records: Rec[]) {
  return records.slice(0, 30).map(r => ({ id: r.id, kind: r.page_kind, path: pathOf(r.url), source: r.source, at: when(r) }))
}

// Command Center: one lean model for the home page. Every section is fetched on its own (newest capture only),
// so a missing capture only blanks that section. Only parsed game numbers are returned: no raw page text,
// no capture log, no capture sources and no Discord/bot data.
async function latestOf(db: any, kinds: string[], like: string, path: string, scope: string, limit = 3): Promise<Rec[] | null> {
  const r = await db.from('spartan_intel_records').select(COLUMNS).in('page_kind', kinds).ilike('url', like).or(scope).order('created_at', { ascending: false }).limit(limit)
  if (r.error) return null
  return ((r.data || []) as Rec[]).filter(x => pathOf(x.url) === path)
}

async function buildCommandModel(db: any, userId: string, account: { province_name: string; province_location: string }, scope: string) {
  const unavailable: string[] = []
  const grab = async (label: string, kinds: string[], like: string, path: string, limit = 3) => {
    const rows = await latestOf(db, kinds, like, path, scope, limit)
    if (rows === null) { unavailable.push(label); return [] as Rec[] }
    return rows
  }
  const [throneRows, stateRows, militaryRows, scienceRows, buildingRows, kingdomRows, historyRes, eventRes] = await Promise.all([
    grab('throne', KINDS.province, '%/wol/game/throne%', '/wol/game/throne'),
    grab('state', KINDS.province, '%/wol/game/council_state%', '/wol/game/council_state'),
    grab('military', KINDS.military, '%/wol/game/council_military%', '/wol/game/council_military'),
    grab('science', KINDS.science, '%/wol/game/council_science%', '/wol/game/council_science'),
    grab('buildings', KINDS.buildings, '%/wol/game/council_internal%', '/wol/game/council_internal'),
    grab('kingdom', KINDS.kingdom, '%/wol/game/kingdom_details%', '/wol/game/kingdom_details', 8),
    db.from('spartan_province_history')
      .select('observed_at,acres,networth,population,peons,soldiers,off_specs,def_specs,elites,thieves,wizards,generals,war_horses,offense,defense,defense_home,build_efficiency,wages')
      .eq('user_id', userId).order('observed_at', { ascending: true }).limit(240),
    db.from('spartan_event_history')
      .select('occurred_at,event_type,source,attacker,defender,target_kingdom,acres_change,troops_lost,thieves_lost,wizards_lost,gold_change,food_change,runes_change')
      .eq('user_id', userId).order('occurred_at', { ascending: false }).limit(30),
  ])

  const t = throneRows[0] || null
  const st = stateRows[0] || null
  const mil = militaryRows[0] || null
  const sci = scienceRows[0] || null
  const bld = buildingRows[0] || null

  let kingdom: any = null
  let kingdomAt: string | null = null
  for (const r of kingdomRows) {
    const d = parseKingdomDetails(r.raw_text || '')
    if (d.code === account.province_location) { kingdom = d; kingdomAt = when(r); break }
  }

  const num = (v: unknown) => toNum(v) ?? 0
  const events = (eventRes.error ? [] : eventRes.data || [])
    .filter((e: any) => !/discord|bot/i.test(String(e.source || '')))
    .slice(0, 12)
    .map((e: any) => ({
      at: e.occurred_at, type: e.event_type, attacker: e.attacker || null, defender: e.defender || null, targetKingdom: e.target_kingdom || null,
      acres: num(e.acres_change), troops: num(e.troops_lost), thieves: num(e.thieves_lost), wizards: num(e.wizards_lost),
      gold: num(e.gold_change), food: num(e.food_change), runes: num(e.runes_change),
    }))

  return {
    ok: true, page: 'command',
    province: account.province_name, kingdom: account.province_location,
    generatedAt: new Date().toISOString(),
    history: historyRes.error ? [] : historyRes.data || [],
    unavailable,
    model: {
      throne: t?.raw_text ? parseThrone(t.raw_text) : null,
      throneFields: t?.parsed_payload || null,
      state: st?.raw_text ? parseState(st.raw_text) : null,
      military: mil?.raw_text ? parseMilitary(mil.raw_text) : null,
      science: sci?.raw_text ? parseScience(sci.raw_text) : null,
      buildings: bld?.raw_text ? parseBuildings(bld.raw_text) : null,
      kingdom,
      events,
      freshness: [
        { label: 'Throne', at: t ? when(t) : null }, { label: 'State', at: st ? when(st) : null },
        { label: 'Military', at: mil ? when(mil) : null }, { label: 'Science', at: sci ? when(sci) : null },
        { label: 'Buildings', at: bld ? when(bld) : null }, { label: 'Kingdom', at: kingdomAt },
      ],
    },
  }
}

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(request.url).searchParams
    const page = params.get('page') || ''
    if (!KINDS[page]) return NextResponse.json({ error: 'Unknown page' }, { status: 400 })
    const kdParam = params.get('kd') || ''
    const provinceParam = params.get('province') || ''

    const cacheKey = `${user.id}|${page}|${kdParam}|${provinceParam}`
    const hit = CACHE.get(cacheKey)
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body)

    const db = createServiceClient()
    const accountResult = await db.from('spartan_accounts').select('province_name,province_location').eq('auth_user_id', user.id).maybeSingle()
    if (accountResult.error) fail(accountResult.error)
    const account = accountResult.data
    if (!account?.province_name || !account?.province_location) {
      return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })
    }
    const scope = `kingdom_id.eq.${account.province_location},kingdom_id.is.null`

    if (page === 'command') {
      const commandBody = await buildCommandModel(db, user.id, { province_name: account.province_name, province_location: account.province_location }, scope)
      CACHE.set(cacheKey, { at: Date.now(), body: commandBody })
      return NextResponse.json(commandBody)
    }

    const recordsResult = await db.from('spartan_intel_records').select(COLUMNS).in('page_kind', KINDS[page]).or(scope).order('created_at', { ascending: false }).limit(90)
    if (recordsResult.error) fail(recordsResult.error)
    const records = (recordsResult.data || []) as Rec[]

    // Time series of the province's own numbers (one row per throne visit).
    const historyResult = await db
      .from('spartan_province_history')
      .select('observed_at,acres,networth,population,peons,soldiers,off_specs,def_specs,elites,thieves,wizards,generals,war_horses,offense,defense,defense_home,build_efficiency,wages')
      .eq('user_id', user.id).order('observed_at', { ascending: true }).limit(240)
    const history = historyResult.error ? [] : historyResult.data || []

    const body: any = {
      ok: true, page,
      province: account.province_name, kingdom: account.province_location,
      generatedAt: new Date().toISOString(), history,
    }

    if (page === 'military') {
      const councils = allByPath(records, '/wol/game/council_military')
      const latest = councils[0] || null
      const train = latestByPath(records, '/wol/game/train_army')
      body.model = {
        current: latest?.raw_text ? parseMilitary(latest.raw_text) : null,
        capturedAt: latest ? when(latest) : null,
        acres: toNum(latest?.parsed_payload?.acres) ?? toNum(train?.parsed_payload?.acres),
        networth: toNum(latest?.parsed_payload?.networth) ?? toNum(train?.parsed_payload?.networth),
        training: train ? { ...train.parsed_payload, capturedAt: when(train) } : null,
        series: councils.slice().reverse().map(r => {
          const m = parseMilitary(r.raw_text || '')
          return { at: when(r), offPoints: m.offPoints, defPoints: m.defPoints, offEff: m.offEff, defEff: m.defEff, troops: m.army.reduce((s, u) => s + u.home + u.away, 0) }
        }),
      }
      body.fields = fields(latest || train)
    }

    if (page === 'science') {
      const councils = allByPath(records, '/wol/game/council_science')
      const latest = councils[0] || null
      const sciencePage = latestByPath(records, '/wol/game/science')
      body.model = {
        current: latest?.raw_text ? parseScience(latest.raw_text) : null,
        capturedAt: latest ? when(latest) : null,
        nextScientist: sciencePage?.parsed_payload?.category_for_next_scientist || null,
        series: councils.slice().reverse().map(r => {
          const s = parseScience(r.raw_text || '')
          return { at: when(r), categories: s.categories.map(c => ({ name: c.name, books: c.totalBooks })) }
        }),
      }
      body.fields = fields(sciencePage || latest)
    }

    if (page === 'buildings') {
      const councils = allByPath(records, '/wol/game/council_internal')
      const latest = councils[0] || null
      const construction = latestByPath(records, '/wol/game/build')
      body.model = {
        current: latest?.raw_text ? parseBuildings(latest.raw_text) : null,
        capturedAt: latest ? when(latest) : null,
        construction: construction ? { ...construction.parsed_payload, capturedAt: when(construction) } : null,
        series: councils.slice().reverse().map(r => {
          const b = parseBuildings(r.raw_text || '')
          return { at: when(r), rows: b.rows.map(x => ({ name: x.name, pct: x.pct, qty: x.qty })) }
        }),
      }
      body.fields = fields(construction || latest)
    }

    if (page === 'province') {
      const throneRec = records.find(r => r.page_kind === 'throne' && pathOf(r.url) === '/wol/game/throne') || null
      const stateRec = latestByPath(records, '/wol/game/council_state')
      body.model = {
        throne: throneRec?.raw_text ? parseThrone(throneRec.raw_text) : null,
        throneFields: throneRec?.parsed_payload || null,
        throneAt: throneRec ? when(throneRec) : null,
        state: stateRec?.raw_text ? parseState(stateRec.raw_text) : null,
        stateAt: stateRec ? when(stateRec) : null,
      }
      body.fields = fields(throneRec || stateRec)
    }

    let logRecords = records

    if (page === 'kingdom') {
      const detailRecs = allByPath(records, '/wol/game/kingdom_details')
      const byCode = new Map<string, any>()
      for (const r of detailRecs) {
        const d = parseKingdomDetails(r.raw_text || '')
        if (d.code && !byCode.has(d.code)) byCode.set(d.code, { ...d, capturedAt: when(r) })
      }
      const gridResult = await db.from('spartan_intel_records').select('id,created_at,url,grid:raw_payload->grid').eq('page_kind', 'intel').or(scope).order('created_at', { ascending: false }).limit(40)
      const gridRecs = gridResult.error ? [] : gridResult.data || []
      const roster = new Map<string, any>()
      for (const g of gridRecs as any[]) {
        const rows = parseGridRows(g.grid)
        for (const row of rows) {
          const key = `${row.location}|${row.name}`
          if (!roster.has(key)) roster.set(key, { ...row, seenAt: g.created_at, seenOn: pathOf(g.url) })
        }
      }
      const codes = new Set<string>([...byCode.keys(), ...[...roster.values()].map(r => r.location).filter(Boolean)])
      const kd = kdParam || (codes.has(account.province_location) ? account.province_location : [...codes][0] || account.province_location)
      body.model = {
        selected: kd,
        available: [...codes].sort(),
        details: byCode.get(kd) || null,
        roster: [...roster.values()].filter(r => r.location === kd),
        allRoster: [...roster.values()],
      }
      body.fields = fields(detailRecs[0])
      logRecords = detailRecs.length ? detailRecs : records
    }

    if (provinceParam) {
      body.spotlight = provinceParam
    }

    body.captures = captureLog(logRecords)
    CACHE.set(cacheKey, { at: Date.now(), body })
    if (CACHE.size > 200) CACHE.clear()
    return NextResponse.json(body)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Page data query failed' }, { status: 500 })
  }
}
