import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  parseBuildings, parseScience, parseMilitary, parseState, parseThrone, parseKingdomDetails,
  parseGridRows, pathOf, toNum,
} from '@/lib/spartan/page-models'
import { mergeNews, findGameDate, realTimeOf, sideOf, dayIndex } from '@/lib/spartan/kingdom-news'
import { parseThroneText } from '@/lib/spartan/throne-text'
import { buildExplorationModel } from '@/lib/spartan/exploration-model'
import { buildMagicModel } from '@/lib/spartan/magic-model'
import { buildThieveryModel } from '@/lib/spartan/thievery-model'
import { mergeGrids, armiesFrom, parseStats, type GridCapture } from '@/lib/spartan/intel-site'

export const dynamic = 'force-dynamic'

// Lean on purpose: only small columns, never the full page capture (raw_payload).
// The old Intel query pulled ~18 MB per request and timed out.
const COLUMNS = 'id,user_id,visibility,page_kind,url,source,captured_at,created_at,age,parsed_payload,raw_text'
const CACHE = new Map<string, { at: number; body: any }>()
const TTL_MS = 12_000

const KINDS: Record<string, string[]> = {
  military: ['military', 'council_military'],
  science: ['science', 'council_science'],
  buildings: ['buildings', 'council_internal', 'survey'],
  province: ['throne', 'kingdom', 'province_state'],
  kingdom: ['kingdom'],
  'war-room': ['kingdom', 'military', 'council_military'],
  news: ['news'],
  throne: ['throne'],
  intel: ['intel'],
  exploration: ['exploration'],
  magic: ['magic', 'ritual', 'council_spells'],
  thievery: ['thievery'],
  command: [], // built by buildCommandModel below, not by the generic query
}

type Rec = {
  id: string; user_id?: string | null; visibility?: string | null; page_kind: string; url: string; source: string | null; captured_at: string | null
  created_at: string; age?: number | string | null; parsed_payload: any; raw_text: string | null
}

function isStructuredBotIntelText(value: unknown) {
  const text = String(value || '').replace(/\u00a0/g, ' ').trim()
  if (!text) return false
  return [
    /(?:^|\n)\s*(?::[a-z0-9_]+:\s*)?.{1,100}\[\*\*.+?\*\*\]\s+attacked\s+__.+?__\s+\(\d+:\d+\)\s*\|\s*(?:captured|recaptured):\s*\*\*?[\d,]+/i,
    /<<__[^_]{2,80}__\s*(?:\*\*)?\|[^|]{1,100}\(\d+:\d+\)(?:\*\*)?>>\s*\|.{0,180}\b(?:sent|success|fail|failed|resist|immune)\b/i,
    /\bNEW KDNEWS:\s*.+\(\d+:\d+\).*\b(?:invaded|captured|ambushed|pillaged|looted|attempted an invasion)\b/i,
    /\bForces from .+?\(\d+:\d+\) came through and ravaged our lands! They captured [\d,]+ acres!/i,
    /\bWe lost .{1,180} in this battle\.?/i,
    /\bYour forces arrive at .+?\(\d+:\d+\).{0,220}\b(?:taken|captured|recaptured|repelled)\b/i,
    /\bYour wizards gather .{0,180}\b(?:the spell succeeds|the spell fails)\b/i,
    /(?:—|-)\s*Ritual:\s*.+\bcast\s+\*\*\d+\/\d+\*\*/i,
    /^\s*#?\d+\s*-\s*.+?:\s*We have sent\s+[\d,]+\s+.+?\s+to\s+.+?\(\d+:\d+\)\./i,
    /^\s*(?::dragon_face:|🐉)\s*__DRAGON__\s+.+\b(?:donated\s+[\d,]+\s+gold coins?\s+to fund dragon|sent\s+[\d,]+\s+troops?\s+and weakened dragon by\s+[\d,]+|completed our dragon|begun development of the)\b/i,
    /\bDragon at us\s*[—-]\s*.+?\d[\d,]*\s+points of strength left\b/i
  ].some(pattern => pattern.test(text))
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

// The newest Throne capture that shows the current game date. News events only carry game dates, so this is
// what lets us place them on a real day (24 game ticks = one game day).
async function gameAnchor(db: any, scope: string) {
  const r = await db.from('spartan_intel_records').select('captured_at,created_at,raw_text').eq('page_kind', 'throne').or(scope).order('created_at', { ascending: false }).limit(8)
  if (r.error) return null
  for (const row of r.data || []) {
    const d = findGameDate(row.raw_text)
    if (d) return { at: row.captured_at || row.created_at, ...d }
  }
  return null
}

// Kingdom News captures (the same feed repeated), merged into one list of events with sides worked out for this province.
async function newsEvents(db: any, scope: string, own: { name: string; kd: string | null }, records?: Rec[]) {
  let rows = records
  if (!rows) {
    const r = await db.from('spartan_intel_records').select(COLUMNS).eq('page_kind', 'news').neq('source', 'discord-bot').or(scope).order('created_at', { ascending: false }).limit(100)
    rows = r.error ? [] : (r.data || []) as Rec[]
  }
  const anchor = await gameAnchor(db, scope)
  const merged = mergeNews(rows.map(r => r.raw_text || ''), own.name)
  const newest = rows.find(r => (r.raw_text || '').length > 0)
  const events = merged.map(e => ({
    at: realTimeOf(e, anchor) || (newest ? newest.captured_at || newest.created_at : null),
    approx: !anchor,
    gameDate: e.gameDate, type: e.type, attacker: e.attacker, defender: e.defender,
    acres: e.acres, books: e.books, troopsLost: e.troopsLost, thievesLost: e.thievesLost, wizardsLost: e.wizardsLost,
    side: sideOf(e, own), text: e.text,
    order: dayIndex(e.month, e.day, e.year) ?? 0,
  })).sort((a, b) => b.order - a.order)
  return { events, anchor, captures: rows.length }
}

// Discord's NEW KDNEWS notifications are already stored as bot news captures, but have no game-date prefix.
 // Parse only attack lines from that format; ignore unrelated delivery errors and bot notifications.
async function discordAttackNews(db: any, scope: string, ownName: string) {
  const result = await db.from('spartan_intel_records').select('created_at,captured_at,raw_text')
    .eq('page_kind', 'news').eq('source', 'discord-bot').or(scope)
    .order('created_at', { ascending: false }).limit(100)
  if (result.error) return []
  const own = ownName.trim().toLowerCase()
  const counts = new Map<string, { event: any; count: number }>()
  for (const row of result.data || []) {
    const text = String(row.raw_text || '')
    const perCapture = new Map<string, { event: any; count: number }>()
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*:[a-z0-9_]+:\s*(?:NEW KDNEWS:\s*)?/i, '').trim()
      const at = row.captured_at || row.created_at
      const m = line.match(/^(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+invaded\s+(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+and captured\s+([\d,]+) acres of land\.?/i)
      if (m) {
        const attacker = m[1].replace(/^\d+\s*-\s*/, '').trim()
        const defender = m[3].replace(/^\d+\s*-\s*/, '').trim()
        const acres = Number(m[5].replace(/,/g, ''))
        const direction = attacker.toLowerCase() === own ? 'out' : defender.toLowerCase() === own ? 'in' : 'other'
        if (direction === 'other' || !Number.isFinite(acres)) continue
        const event = {
          at, type: 'invade', attacker, defender,
          targetKingdom: direction === 'out' ? m[4] : m[2],
          direction, acres, troops: 0, thieves: 0, wizards: 0,
          gold: 0, food: 0, runes: 0, source: 'discord-bot',
        }
        const key = [direction, attacker.toLowerCase(), defender.toLowerCase(), acres].join('|')
        const prior = perCapture.get(key)
        if (prior) prior.count += 1
        else perCapture.set(key, { event, count: 1 })
        continue
      }

      // Detailed bot attack reports include the province's own troop losses.
      const detail = line.match(/^(.+?)\s+\[\*\*(.+?)\*\*\]\s+attacked\s+__(.+?)__\s+\((\d+:\d+)\)\|(?:captured|recaptured):\s*[*\u00a0\s]*(\d+)[*\u00a0\s]*\|loss:\s*[*\u00a0\s]*(.+?)[*\u00a0\s]*\|/i)
      if (!detail) continue
      const attacker = detail[1].trim()
      const defender = detail[3].trim()
      const acres = Number(detail[5])
      const direction = attacker.toLowerCase() === own ? 'out' : defender.toLowerCase() === own ? 'in' : 'other'
      if (direction === 'other' || !Number.isFinite(acres)) continue
      const losses = [...detail[6].matchAll(/([\d,]+)\s+([a-z][a-z -]*)/gi)]
      let troops = 0, thieves = 0, wizards = 0
      for (const loss of losses) {
        const count = Number(loss[1].replace(/,/g, ''))
        const unit = loss[2].toLowerCase()
        if (/thief/.test(unit)) thieves += count
        else if (/wizard/.test(unit)) wizards += count
        else troops += count
      }
      const event = {
        at, type: /recaptured/i.test(line) ? 'recapture' : 'invade', attacker, defender,
        targetKingdom: detail[4], direction, acres, troops, thieves, wizards,
        gold: 0, food: 0, runes: 0, source: 'discord-bot',
      }
      const key = [direction, attacker.toLowerCase(), defender.toLowerCase(), acres].join('|')
      // If the same attack already appeared as NEW KDNEWS in this capture, keep that one.
      if (!perCapture.has(key)) perCapture.set(key, { event, count: 1 })
    }
    for (const [key, value] of perCapture) {
      const prior = counts.get(key)
      if (!prior) counts.set(key, value)
      else if (value.count > prior.count) prior.count = value.count
    }
  }
  return [...counts.values()].flatMap(({ event, count }) => Array.from({ length: count }, () => event))
}

// Command Center: one lean model for the home page. Every section is fetched on its own (newest capture only),
// so a missing capture only blanks that section. Only parsed game numbers are returned: no raw page text,
// no capture log, no capture sources and no Discord/bot data.
async function latestOf(db: any, kinds: string[], like: string, path: string, scope: string, limit = 3): Promise<Rec[] | null> {
  const r = await db.from('spartan_intel_records').select(COLUMNS).in('page_kind', kinds).ilike('url', like).or(scope).order('created_at', { ascending: false }).limit(limit)
  if (r.error) return null
  return ((r.data || []) as Rec[]).filter(x => pathOf(x.url) === path)
}

async function buildCommandModel(db: any, userId: string, account: { id: string; province_name: string; province_location: string }, ownScope: string, kingdomScope: string) {
  const unavailable: string[] = []
  const grab = async (label: string, kinds: string[], like: string, path: string, limit = 3) => {
    const rows = await latestOf(db, kinds, like, path, ownScope, limit)
    if (rows === null) { unavailable.push(label); return [] as Rec[] }
    return rows
  }
  const [throneRows, stateRows, militaryRows, scienceRows, buildingRows, kingdomRows, historyRes, eventRes] = await Promise.all([
    grab('throne', KINDS.province, '%/wol/game/throne%', '/wol/game/throne'),
    grab('state', KINDS.province, '%/wol/game/council_state%', '/wol/game/council_state'),
    grab('military', KINDS.military, '%/wol/game/council_military%', '/wol/game/council_military'),
    grab('science', KINDS.science, '%/wol/game/council_science%', '/wol/game/council_science'),
    grab('buildings', KINDS.buildings, '%/wol/game/council_internal%', '/wol/game/council_internal'),
    latestOf(db, KINDS.kingdom, '%/wol/game/kingdom_details%', '/wol/game/kingdom_details', kingdomScope, 8).then(rows => rows || []),
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
    const accountResult = await db.from('spartan_accounts').select('id,auth_user_id,province_name,province_location').eq('auth_user_id', user.id).maybeSingle()
    if (accountResult.error) fail(accountResult.error)
    const account = accountResult.data
    if (!account?.province_name || !account?.province_location) {
      return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })
    }
    const kingdomScope = `kingdom_id.eq.${account.province_location},kingdom_id.is.null`
    const ownScope = `province_id.eq.${account.id},user_id.eq.${account.id},user_id.eq.${user.id}`
    // Personal pages are account-scoped. Only explicitly shared pages read the kingdom-wide feed.
    const sharedPages = new Set(['kingdom', 'intel', 'news'])
    const scope = sharedPages.has(page) ? kingdomScope : ownScope

    if (page === 'command') {
      const commandBody = await buildCommandModel(db, user.id, { id: account.id, province_name: account.province_name, province_location: account.province_location }, ownScope, kingdomScope)
      CACHE.set(cacheKey, { at: Date.now(), body: commandBody })
      return NextResponse.json(commandBody)
    }

    // Science books reset each age. Never let a previous-age council capture feed live totals.
    // Explicit record ages must match current_age. Untagged captures are usable only if captured
    // after the recorded start of that age; if the age/reset marker is unavailable, fail closed.
    let currentAge: number | null = null
    let ageStartedAt: string | null = null
    if (page === 'science') {
      const [ageSetting, latestAgeLog] = await Promise.all([
        db.from('bot_settings').select('value').eq('key', 'current_age').maybeSingle(),
        db.from('spartan_age_log').select('new_age,created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (ageSetting.error) fail(ageSetting.error)
      if (latestAgeLog.error) fail(latestAgeLog.error)
      const configuredAge = Number(ageSetting.data?.value)
      const loggedAge = Number(latestAgeLog.data?.new_age)
      currentAge = Number.isInteger(configuredAge) && configuredAge > 0
        ? configuredAge
        : Number.isInteger(loggedAge) && loggedAge > 0 ? loggedAge : null

      if (currentAge !== null) {
        const ageLog = await db.from('spartan_age_log').select('created_at').eq('new_age', currentAge).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (ageLog.error) fail(ageLog.error)
        ageStartedAt = ageLog.data?.created_at
          || (loggedAge === currentAge ? latestAgeLog.data?.created_at : null)
          || null
      }
    }

    const recordsResult = await db.from('spartan_intel_records').select(COLUMNS).in('page_kind', KINDS[page]).or(scope).order('created_at', { ascending: false }).limit(90)
    if (recordsResult.error) fail(recordsResult.error)
    let records = ((recordsResult.data || []) as Rec[]).filter(r =>
      !(sharedPages.has(page) && r.visibility === 'own' && r.user_id !== user.id) &&
      (r.source !== 'discord-bot' || isStructuredBotIntelText(r.raw_text))
    )
    if (page === 'science') {
      const startMs = ageStartedAt ? Date.parse(ageStartedAt) : NaN
      records = currentAge === null ? [] : records.filter((r) => {
        const capturedMs = Date.parse(when(r))
        if (r.age != null && Number.isFinite(Number(r.age))) return Number(r.age) === currentAge && Number.isFinite(startMs) && Number.isFinite(capturedMs) && capturedMs >= startMs
        return Number.isFinite(startMs) && Number.isFinite(capturedMs) && capturedMs >= startMs
      })
    }

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
      body.scienceStatus = { currentAge, hasCurrentAgeData: Boolean(latest), message: latest ? null : 'No current-age science data' }
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

    if (page === 'intel') {
      // Grids scraped from the kingdom intel site. Each capture carries its kingdom code, and viewers pick
      // different columns, so recent captures of the same kingdom are merged into one row per province.
      const g = await db.from('spartan_intel_records')
        .select('id,url,created_at,captured_at,parsed_payload,raw_text,grid:raw_payload->grid')
        .eq('page_kind', 'intel').or(scope).order('created_at', { ascending: false }).limit(60)
      if (g.error) fail(g.error)
      const rows: any[] = g.data || []
      const captures: GridCapture[] = rows
        .filter(r => Array.isArray(r.grid?.rows) && r.parsed_payload?.kingdom_code)
        .map(r => ({ kd: String(r.parsed_payload.kingdom_code), at: r.captured_at || r.created_at, url: String(r.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '') || '/', rows: r.grid.rows }))
      const byKd: Record<string, GridCapture[]> = {}
      for (const c of captures) (byKd[c.kd] ||= []).push(c)
      const ownKd = String(account.province_location || '')
      const kingdoms = Object.entries(byKd).map(([kd, caps]) => {
        const recent = caps.slice(0, 15)
        const provinces = mergeGrids(recent)[kd] || []
        return { kd, own: kd === ownKd, source: recent[0].url, capturedAt: recent[0].at, captures: recent.length, provinces }
      }).sort((a, b) => Number(b.own) - Number(a.own) || Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      const statsRow = rows.find(r => /Our KD\s*-|Enemy KD\s*-/.test(String(r.raw_text || '')))
      const armies = armiesFrom(byKd[ownKd] || []).filter(a => (a.secondsRemaining ?? 0) > 0)
      body.model = { kingdoms, stats: parseStats(statsRow?.raw_text), statsAt: statsRow ? statsRow.captured_at || statsRow.created_at : null, armies, ownKd, ownName: account.province_name }
      body.fields = []
    }

    if (page === 'throne') {
      // Every Throne capture in scope: numbers from the payload, spells/armies/ritual/dragon from the page text.
      const NUMS = ['acres', 'networth', 'gold', 'food', 'runes', 'peons', 'soldiers', 'off_specs', 'def_specs', 'elites', 'thieves', 'wizards', 'war_horses', 'prisoners', 'offense', 'defense', 'off_available', 'tpa', 'wpa', 'build_efficiency'] as const
      const snaps = records
        .filter(r => /\/throne/.test(String(r.url || '')) && (r.parsed_payload?.acres != null || /(?:^|\s)Land\s+[\d,]+/.test(String(r.raw_text || ''))))
        .map(r => {
          const pp: any = r.parsed_payload
          const x = parseThroneText(r.raw_text)
          const nums: Record<string, number | null> = {}
          const parsedThrone = parseThrone(r.raw_text || '')
          for (const k of NUMS) nums[k] = toNum(pp[k]) ?? toNum((parsedThrone as any)[k])
          return {
            id: r.id, at: when(r), province: String(pp.province_name || x.province || ''), kd: String(pp.kingdom_code || x.kd || ''),
            nums, armiesDaysLeft: toNum(pp.armies_days_left), armiesLastAcres: toNum(pp.armies_last_acres), extras: { ...x, unitCounts: parsedThrone.unitCounts },
          }
        })
        .filter(sn => sn.province)
      const byProv = new Map<string, typeof snaps>()
      for (const sn of snaps) { const list = byProv.get(sn.province) || []; list.push(sn); byProv.set(sn.province, list) }
      const provinces = [...byProv.entries()].map(([name, list]) => {
        const sorted = [...list].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        return { name, own: name === account.province_name, kd: sorted[0].kd, latest: sorted[0], series: sorted.slice(0, 40).reverse().map(sn => ({ at: sn.at, ...sn.nums })), captures: list.length }
      }).sort((a, b) => Number(b.own) - Number(a.own) || Date.parse(b.latest.at) - Date.parse(a.latest.at))
      body.model = { provinces, own: account.province_name }
      body.fields = []
    }

    if (page === 'news') {
      const own = { name: account.province_name, kd: account.province_location || null }
      const n = await newsEvents(db, scope, own, records)
      body.model = { events: n.events, anchor: n.anchor, captures: n.captures, own }
      body.fields = []
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
      if (gridResult.error) fail(gridResult.error)
      const gridRecs = gridResult.data || []
      const roster = new Map<string, any>()
      const missing = (value: any) => value == null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'number' && !Number.isFinite(value))
      for (const g of gridRecs as any[]) {
        const rows = parseGridRows(g.grid)
        for (const row of rows) {
          const key = String(row.location) + '|' + String(row.name)
          const current = roster.get(key)
          if (!current) {
            roster.set(key, { ...row, seenAt: g.created_at, seenOn: pathOf(g.url) })
            continue
          }
          // Captures are often partial: the newest UtopiaIntel roster may have
          // names/races only, while an Intel-site grid has combat/personality
          // columns. Merge newest-first, filling only fields it did not provide.
          const merged = { ...current }
          for (const [field, value] of Object.entries(row)) {
            if (missing(merged[field]) && !missing(value)) merged[field] = value
          }
          roster.set(key, merged)
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

    if (page === 'magic') {
      body.model = buildMagicModel(records)
      body.fields = []
    }

    if (page === 'thievery') {
      body.model = buildThieveryModel(records)
      body.fields = []
    }

    if (page === 'exploration') {
      body.model = buildExplorationModel(records)
      body.fields = []
    }

    if (page === 'war-room') {
      // Combat picture: your own recorded events (attacks, ops, losses) plus war record and military posture.
      // Discord/bot-sourced events are left out on purpose; this page only shows game data.
      const eventsResult = await db
        .from('spartan_event_history')
        .select('occurred_at,event_type,source,attacker,defender,target_kingdom,acres_change,troops_lost,thieves_lost,wizards_lost,gold_change,food_change,runes_change')
        .eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(300)
      const own = String(account.province_name).trim().toLowerCase()
      const n = (v: unknown) => toNum(v) ?? 0
      const events: any[] = (eventsResult.error ? [] : eventsResult.data || [])
        .filter((e: any) => !/discord|bot/i.test(String(e.source || '')))
        .map((e: any) => {
          const attacker = e.attacker || null
          const defender = e.defender || null
          const direction = attacker && String(attacker).trim().toLowerCase() === own ? 'out'
            : defender && String(defender).trim().toLowerCase() === own ? 'in' : 'other'
          return {
            at: e.occurred_at, type: e.event_type, attacker, defender, targetKingdom: e.target_kingdom || null, direction,
            acres: n(e.acres_change), troops: n(e.troops_lost), thieves: n(e.thieves_lost), wizards: n(e.wizards_lost),
            gold: n(e.gold_change), food: n(e.food_change), runes: n(e.runes_change),
          }
        })
      // Hits from the Kingdom News feed, including Province Reporter casualties.
      const own2 = { name: account.province_name, kd: account.province_location || null }
      const fromNews = (await newsEvents(db, kingdomScope, own2)).events
        .filter(e => e.side !== 'other' && e.at)
        .map(e => ({
          at: e.at, type: e.type, attacker: e.attacker?.name || null, defender: e.defender?.name || null,
          targetKingdom: (e.side === 'out' ? e.defender?.kd : e.attacker?.kd) || null, direction: e.side,
          acres: e.acres, troops: e.troopsLost || 0, thieves: e.thievesLost || 0, wizards: e.wizardsLost || 0, gold: 0, food: 0, runes: 0,
        }))
      // Bot notifications contain attacks the web news feed may not have captured. Avoid adding
      // a bot duplicate when the same attacker/defender/acres event already came from game news.
      const botNews = await discordAttackNews(db, kingdomScope, account.province_name)
      const signature = (e: any) => [String(e.attacker || '').toLowerCase(), String(e.defender || '').toLowerCase(), Number(e.acres || 0)].join('|')
      const siteSignatures = new Set(fromNews.map(signature))
      events.push(...fromNews, ...botNews.filter((e: any) => !siteSignatures.has(signature(e))))
      events.sort((a: any, b: any) => Date.parse(b.at) - Date.parse(a.at))
      const militaryRec = allByPath(records, '/wol/game/council_military')[0] || null
      let kingdom: any = null
      const sharedKingdomRows = await db.from('spartan_intel_records').select(COLUMNS).eq('page_kind', 'kingdom').or(kingdomScope).order('created_at', { ascending: false }).limit(20)
      for (const r of ((sharedKingdomRows.data || []) as Rec[]).filter(x => pathOf(x.url) === '/wol/game/kingdom_details')) {
        const d = parseKingdomDetails(r.raw_text || '')
        if (d.code === account.province_location) { kingdom = { ...d, capturedAt: when(r) }; break }
      }
      body.model = {
        events,
        military: militaryRec?.raw_text ? { ...parseMilitary(militaryRec.raw_text), capturedAt: when(militaryRec) } : null,
        kingdom,
      }
      body.fields = fields(militaryRec)
    }

    if (provinceParam) {
      body.spotlight = provinceParam
    }

    body.captures = captureLog(logRecords)
    CACHE.set(cacheKey, { at: Date.now(), body })
    while (CACHE.size > 40) { const oldest = CACHE.keys().next().value; if (oldest === undefined) break; CACHE.delete(oldest) }
    return NextResponse.json(body)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Page data query failed' }, { status: 500 })
  }
}
