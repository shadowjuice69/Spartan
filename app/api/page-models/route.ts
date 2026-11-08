import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  parseBuildings, parseScience, parseMilitary, parseState, parseThrone, parseKingdomDetails,
  parseGridRows, pathOf, toNum, parseTrainingUnits,
} from '@/lib/spartan/page-models'
import { mergeNews, findGameDate, realTimeOf, sideOf, dayIndex, party as parseNewsParty } from '@/lib/spartan/kingdom-news'
import { parseThroneText } from '@/lib/spartan/throne-text'
import { buildExplorationModel } from '@/lib/spartan/exploration-model'
import { buildMagicModel } from '@/lib/spartan/magic-model'
import { buildThieveryModel } from '@/lib/spartan/thievery-model'
import { mergeGrids, armiesFrom, parseStats, type GridCapture } from '@/lib/spartan/intel-site'

export const dynamic = 'force-dynamic'

// Lean on purpose: only small columns, never the full page capture (raw_payload).
// The old Intel query pulled ~18 MB per request and timed out.
const COLUMNS = 'id,user_id,province_id,kingdom_id,visibility,page_kind,url,source,captured_at,created_at,age,parsed_payload,raw_text'
const CACHE = new Map<string, { at: number; body: any }>()
const TTL_MS = 30_000

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
  id: string; user_id?: string | null; province_id?: string | null; kingdom_id?: string | null; visibility?: string | null; page_kind: string; url: string; source: string | null; captured_at: string | null
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
    /^\s*(?::dragon_face:|🐉)\s*__DRAGON__\s+.+\b(?:donated\s+(?:__|\*\*)?[\d,]+\s+gold coins?(?:(?:__|\*\*))?\s+to fund dragon|sent\s+(?:__|\*\*)?[\d,]+\s+troops?(?:__|\*\*)?\s+and weakened dragon by\s+(?:__|\*\*)?[\d,]+(?:__|\*\*)?|completed our dragon|begun development of the)\b/i,
    /\bDragon at us\s*[—-]\s*.+?\d[\d,]*\s+points of strength left\b/i
  ].some(pattern => pattern.test(text))
}


function attackTravelInfo(payload: any, rawText: unknown) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const candidates = [p, p.travel, p.attack, p.combat, p.return].filter((v: any) => v && typeof v === 'object')
  const read = (keys: string[]) => {
    for (const obj of candidates) for (const key of keys) {
      const value = obj[key]
      if (value == null || value === '') continue
      if (typeof value === 'number' && Number.isFinite(value)) return value
      const s = String(value).trim()
      if (s) return s
    }
    return null
  }
  const rawReturn = read(['returnAt','return_at','armyReturnAt','army_return_at','returns_at','expected_return_at'])
  const returnAt = rawReturn && Number.isFinite(Date.parse(String(rawReturn))) ? new Date(String(rawReturn)).toISOString() : null
  const rawHours = read(['travelHours','travel_hours','travel_time_hours','attackTimeHours','attack_time_hours','march_hours','return_hours'])
  let travelHours: number | null = typeof rawHours === 'number' ? rawHours : null
  if (travelHours == null && rawHours != null) {
    const match = String(rawHours).match(/(\d+(?:\.\d+)?)/)
    if (match) travelHours = Number(match[1])
  }
  if ((travelHours == null || !Number.isFinite(travelHours) || travelHours <= 0) && rawText) {
    const text = String(rawText)
    // Utopia attack reports commonly state the actual return duration as
    // "available again in X days". Convert that game-reported duration to hours
    // before the Return Tracker falls back to generic same-KD/inter-KD estimates.
    const availableAgain = text.match(/available\s+again\s+in\s+(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h)\b/i)
    if (availableAgain) {
      const amount = Number(availableAgain[1])
      const unit = availableAgain[2].toLowerCase()
      travelHours = /^d/.test(unit) ? amount * 24 : amount
    } else {
      const match = text.match(/(?:travel|attack|march|return)\s*time\s*[:=—-]?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i)
      if (match) travelHours = Number(match[1])
    }
  }
  if (travelHours != null && (!Number.isFinite(travelHours) || travelHours <= 0 || travelHours > 72)) travelHours = null
  return { returnAt, travelHours }
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
  // The full capture history remains stored in Supabase; the page only needs a compact recent activity list.
  return records.slice(0, 12).map(r => ({ id: r.id, kind: r.page_kind, path: pathOf(r.url), source: r.source, at: when(r) }))
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

// Discord's NEW KDNEWS messages are structured attack reports too. Include them in News
// when the browser-captured Kingdom News page is absent, and collapse repeated captures.
function discordKingdomEvents(rows: Rec[], own: { name: string; kd: string | null }) {
  const best = new Map<string, { event: any; count: number }>()
  for (const row of rows) {
    if (row.source !== 'discord-bot' || !row.raw_text) continue
    const perCapture = new Map<string, { event: any; count: number }>()
    for (const rawLine of row.raw_text.split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*:[a-z0-9_]+:\s*/i, '').replace(/^NEW KDNEWS:\s*/i, '').trim()
      let type: string = 'invade'
      let attackerText = ''
      let attackerKd = ''
      let defenderText = ''
      let defenderKd = ''
      let amount = 0
      let amountKind: 'acres' | 'books' = 'acres'
      let match = line.match(/^(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+invaded\s+(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+and captured\s+([\d,]+) acres of land\.?/i)
      if (match) {
        [, attackerText, attackerKd, defenderText, defenderKd] = match
        amount = Number(match[5].replace(/,/g, ''))
      } else {
        match = line.match(/^(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+(recaptured|captured)\s+([\d,]+) acres of land from\s+(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)/i)
        if (match) {
          attackerText = match[1]; attackerKd = match[2]; type = match[3].toLowerCase()
          amount = Number(match[4].replace(/,/g, '')); defenderText = match[5]; defenderKd = match[6]
        } else {
          match = line.match(/^(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+ambushed armies from\s+(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+and took\s+([\d,]+) acres of land/i)
          if (match) {
            [, attackerText, attackerKd, defenderText, defenderKd] = match
            type = 'ambush'; amount = Number(match[5].replace(/,/g, ''))
          } else {
            match = line.match(/^(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+attacked and looted\s+([\d,]+) books from\s+(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)/i)
            if (match) {
              attackerText = match[1]; attackerKd = match[2]; amount = Number(match[3].replace(/,/g, ''))
              amountKind = 'books'; type = 'plunder'; defenderText = match[4]; defenderKd = match[5]
            } else continue
          }
        }
      }
      if (!Number.isFinite(amount) || amount < 0) continue
      const attacker = parseNewsParty(`${attackerText} (${attackerKd})`)
      const defender = parseNewsParty(`${defenderText} (${defenderKd})`)
      const at = row.captured_at || row.created_at
      const timestamp = Date.parse(at || '')
      const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now())
      const gameDate = `Captured ${date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}`
      const event = {
        at: at || null, approx: true, gameDate, type, attacker, defender,
        acres: amountKind === 'acres' ? amount : 0, books: amountKind === 'books' ? amount : 0,
        troopsLost: 0, thievesLost: 0, wizardsLost: 0, side: sideOf({ attacker, defender } as any, own),
        text: line, order: Number.isFinite(timestamp) ? timestamp : 0,
      }
      const key = [type, attacker.name.toLowerCase(), attacker.kd || '', defender.name.toLowerCase(), defender.kd || '', event.acres, event.books].join('|')
      const prior = perCapture.get(key)
      if (prior) prior.count += 1
      else perCapture.set(key, { event, count: 1 })
    }
    for (const [key, value] of perCapture) {
      const prior = best.get(key)
      if (!prior) best.set(key, value)
      else if (value.count > prior.count) prior.count = value.count
    }
  }
  return [...best.values()].flatMap(({ event, count }) => Array.from({ length: count }, () => event))
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
          gold: 0, food: 0, runes: 0, source: 'discord-bot', returnAt: null, travelHours: null,
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
      const returnMatch = line.match(/\breturn\s*:\s*(\d+(?:\.\d+)?)/i)
      const returnHours = returnMatch ? Number(returnMatch[1]) : null
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
        returnAt: null, travelHours: returnHours != null && Number.isFinite(returnHours) && returnHours > 0 && returnHours <= 72 ? returnHours : null,
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
      .select('observed_at,acres,networth,population,peons,soldiers,off_specs,def_specs,elites,thieves,wizards,generals,war_horses,offense,defense,defense_home,build_efficiency,wages,r_tpa,o_tpa,d_tpa,r_wpa,o_wpa,d_wpa')
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
    if (['science', 'province', 'military', 'war-room', 'magic', 'thievery', 'throne'].includes(page)) {
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

    // The Intel grid has its own compact grid query below. Avoid fetching the same
    // 90 raw-text/parsed-payload records twice for that page.
    let records: Rec[] = []
    if (page !== 'intel') {
      const recordsResult = await db.from('spartan_intel_records').select(COLUMNS).in('page_kind', KINDS[page]).or(scope).order('created_at', { ascending: false }).limit(90)
      if (recordsResult.error) fail(recordsResult.error)
      records = ((recordsResult.data || []) as Rec[]).filter(r =>
        !(sharedPages.has(page) && r.visibility === 'own' && r.user_id !== user.id && r.user_id !== account.id) &&
        (r.source !== 'discord-bot' || isStructuredBotIntelText(r.raw_text))
      )
    }
    if (['science', 'province', 'military', 'war-room', 'magic', 'thievery', 'throne'].includes(page)) {
      const startMs = ageStartedAt ? Date.parse(ageStartedAt) : NaN
      records = currentAge === null ? [] : records.filter((r) => {
        const capturedMs = Date.parse(when(r))
        if (r.age != null && Number.isFinite(Number(r.age))) return Number(r.age) === currentAge && Number.isFinite(startMs) && Number.isFinite(capturedMs) && capturedMs >= startMs
        return Number.isFinite(startMs) && Number.isFinite(capturedMs) && capturedMs >= startMs
      })
    }

    // Magic, Thievery and Military also need the province's latest Throne counts for the
    // wiki-defined raw per-acre ratios. Fetch a bounded, separate series so
    // thousands of Throne captures cannot crowd out spell/operation captures
    // from the normal 90-record page query.
    if (['magic', 'thievery', 'military'].includes(page)) {
      // Fail closed when the current-age reset marker is unavailable. Never let
      // an unbounded Throne fallback pull prior-age ratios into a live page.
      const ageStartMs = ageStartedAt ? Date.parse(ageStartedAt) : NaN
      if (Number.isFinite(ageStartMs)) {
        const throneResult = await db.from('spartan_intel_records').select(COLUMNS)
          .eq('page_kind', 'throne').ilike('url', '%/wol/game/throne%').or(scope)
          .gte('created_at', ageStartedAt!)
          .order('created_at', { ascending: false }).limit(40)
        if (throneResult.error) fail(throneResult.error)
        const throneRows = ((throneResult.data || []) as Rec[])
          .filter(r => r.raw_text && pathOf(r.url) === '/wol/game/throne'
            && Number.isFinite(Date.parse(when(r))) && Date.parse(when(r)) >= ageStartMs)
        records.push(...throneRows)
      }
    }

    // Time series of the province's own numbers. UtopiaIntel receipts are retained
    // in the capture vault but do not create spartan_province_history rows, so derive
    // missing snapshots from those saved Throne captures at read-time. This is a
    // display-only bridge: it does not change the capture or processing pipeline.
    // Age scoping prevents old-age captures from leaking into the current chart.
    let history: any[] = []
    if (['province', 'military', 'war-room'].includes(page)) {
      const historyQuery = db.from('spartan_province_history')
        .select('observed_at,acres,networth,population,peons,soldiers,off_specs,def_specs,elites,thieves,wizards,generals,war_horses,offense,defense,defense_home,build_efficiency,wages')
        .eq('user_id', user.id)
      const scopedHistoryQuery = ageStartedAt ? historyQuery.gte('observed_at', ageStartedAt) : historyQuery
      const [historyResult, throneCaptureResult] = await Promise.all([
        scopedHistoryQuery
          .order('observed_at', { ascending: page !== 'war-room' })
          .limit(page === 'war-room' ? 1 : 300),
        ageStartedAt
          ? db.from('spartan_capture_vault')
              .select('captured_at,raw_text,parsed_payload')
              .eq('user_id', account.id)
              .eq('province_id', account.id)
              .eq('kingdom_id', account.province_location)
              .eq('page_kind', 'throne')
              .gte('captured_at', ageStartedAt)
              .order('captured_at', { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [], error: null }),
      ])
      const storedHistory = historyResult.error ? [] : historyResult.data || []
      const trainingDefs = page === 'military'
        ? parseTrainingUnits(latestByPath(records, '/wol/game/train_army')?.raw_text || '')
        : []
      const derivedHistory: any[] = (throneCaptureResult.error ? [] : throneCaptureResult.data || [])
        .map((capture: any) => {
          const parsed = parseThrone(String(capture.raw_text || capture.parsed_payload?.data_simple || ''))
          if (parsed.acres == null && parsed.networth == null) return null
          const countForRole = (role: string) => {
            const units = trainingDefs.filter(unit => unit.role === role)
            const counts = units.map(unit => toNum(parsed.unitCounts?.[unit.name]))
            return units.length > 0 && counts.every(value => value != null)
              ? counts.reduce((sum, value) => sum + (value ?? 0), 0)
              : null
          }
          const offSpecs = parsed.offSpecs ?? (trainingDefs.length ? countForRole('Offensive specs') : null)
          const defSpecs = parsed.defSpecs ?? (trainingDefs.length ? countForRole('Defensive specs') : null)
          const elites = parsed.elites ?? (trainingDefs.length ? countForRole('Elites') : null)
          return {
            observed_at: capture.captured_at,
            acres: parsed.acres,
            networth: parsed.networth,
            peons: parsed.peons,
            soldiers: parsed.soldiers,
            off_specs: offSpecs,
            def_specs: defSpecs,
            elites,
            thieves: parsed.thieves,
            wizards: parsed.wizards,
            war_horses: parsed.war_horses,
            prisoners: parsed.prisoners,
            offense: parsed.offense,
            defense: parsed.defense,
            // Throne reports troop counts and home combat points. Derive raw TPA/WPA
            // and OSPA/DSPA (reported offense/defense points per acre) separately;
            // keep specialist counts distinct from combat-strength ratios.
            r_tpa: parsed.ratios?.thievesPerAcre ?? (parsed.acres != null && parsed.acres > 0 && parsed.thieves != null ? parsed.thieves / parsed.acres : null),
            r_wpa: parsed.ratios?.wizardsPerAcre ?? (parsed.acres != null && parsed.acres > 0 && parsed.wizards != null ? parsed.wizards / parsed.acres : null),
            off_spa: parsed.ratios?.offSpa ?? (parsed.acres != null && parsed.acres > 0 && parsed.offense != null ? parsed.offense / parsed.acres : null),
            def_spa: parsed.ratios?.defSpa ?? (parsed.acres != null && parsed.acres > 0 && parsed.defense != null ? parsed.defense / parsed.acres : null),
            off_specs_per_acre: parsed.acres != null && parsed.acres > 0 && offSpecs != null ? offSpecs / parsed.acres : null,
            def_specs_per_acre: parsed.acres != null && parsed.acres > 0 && defSpecs != null ? defSpecs / parsed.acres : null,
            build_efficiency: parsed.buildingEfficiency,
            source: 'spartan_capture_vault',
          }
        })
        .filter((row: any) => row && row.observed_at)
      const byTimestamp = new Map<string, any>()
      for (const row of storedHistory) byTimestamp.set(String(row.observed_at), { ...row })
      for (const snapshot of derivedHistory) {
        const key = String(snapshot.observed_at)
        const existing = byTimestamp.get(key)
        if (!existing) {
          byTimestamp.set(key, snapshot)
          continue
        }
        for (const [field, value] of Object.entries(snapshot)) {
          if (existing[field] == null && value != null) existing[field] = value
        }
      }
      const mergedHistory = [...byTimestamp.values()]
        .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
      history = page === 'war-room' ? mergedHistory.slice(-1) : mergedHistory.slice(-300)
    }

    const body: any = {
      ok: true, page,
      province: account.province_name, kingdom: account.province_location,
      generatedAt: new Date().toISOString(), history,
    }

    if (page === 'military') {
      const councils = allByPath(records, '/wol/game/council_military')
      const latest = councils[0] || null
      const train = latestByPath(records, '/wol/game/train_army')
      const throneRec = allByPath(records, '/wol/game/throne')[0] || null
      const throne = throneRec?.raw_text ? parseThrone(throneRec.raw_text) : null
      const trainingUnits = train?.raw_text ? parseTrainingUnits(train.raw_text) : []
      const countForRole = (role: string) => {
        const units = trainingUnits.filter(unit => unit.role === role)
        const counts = units.map(unit => toNum(throne?.unitCounts?.[unit.name]))
        return units.length > 0 && counts.every(value => value != null)
          ? counts.reduce((sum, value) => sum + (value ?? 0), 0)
          : null
      }
      const offSpecs = throne ? (throne.offSpecs ?? (trainingUnits.length ? countForRole('Offensive specs') : null)) : null
      const defSpecs = throne ? (throne.defSpecs ?? (trainingUnits.length ? countForRole('Defensive specs') : null)) : null
      const elites = throne ? (throne.elites ?? (trainingUnits.length ? countForRole('Elites') : null)) : null
      const acresNow = throne?.acres ?? null
      const armyFromThrone = throne ? [
        ...(throne.soldiers != null ? [{ name: 'Soldiers', home: throne.soldiers, away: null, role: 'Soldiers' }] : []),
        ...trainingUnits
          .filter(unit => throne.unitCounts?.[unit.name] != null)
          .map(unit => ({
            name: unit.name,
            home: toNum(throne.unitCounts?.[unit.name]) ?? 0,
            away: null,
            role: unit.role,
          })),
      ] : []
      // Throne reports current home Off./Def. Points. Training-page unit stats
      // classify raw specialist counts; no modified ME/OME/DME is inferred.
      const parsedCurrent = latest?.raw_text ? parseMilitary(latest.raw_text) : null
      const throneIsNewer = Boolean(throne && throneRec && (!latest || Date.parse(when(throneRec)) >= Date.parse(when(latest))))
      const throneCurrent = throne ? {
        source: 'throne', generals: null, wageRate: null, efficiency: null, nonPeasantPct: null,
        offEff: null, offPoints: throne.offense, defEff: null, defPoints: throne.defense,
        army: armyFromThrone, horses: throne.war_horses, offSpecs, defSpecs, elites,
        offSpa: acresNow && throne.offense != null ? throne.offense / acresNow : null,
        defSpa: acresNow && throne.defense != null ? throne.defense / acresNow : null,
      } : null
      const current = throneIsNewer ? throneCurrent : parsedCurrent
        ? { ...parsedCurrent, offSpecs, defSpecs, elites,
            offSpa: parsedCurrent.offPoints != null && acresNow ? parsedCurrent.offPoints / acresNow : null,
            defSpa: parsedCurrent.defPoints != null && acresNow ? parsedCurrent.defPoints / acresNow : null }
        : throneCurrent
      body.model = {
        current,
        capturedAt: throneIsNewer ? when(throneRec!) : latest ? when(latest) : throneRec ? when(throneRec) : null,
        acres: throneIsNewer ? throne?.acres ?? toNum(latest?.parsed_payload?.acres) ?? toNum(train?.parsed_payload?.acres) : toNum(latest?.parsed_payload?.acres) ?? toNum(train?.parsed_payload?.acres) ?? throne?.acres,
        networth: throneIsNewer ? throne?.networth ?? toNum(latest?.parsed_payload?.networth) ?? toNum(train?.parsed_payload?.networth) : toNum(latest?.parsed_payload?.networth) ?? toNum(train?.parsed_payload?.networth) ?? throne?.networth,
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
      const source = latest || sciencePage
      body.scienceStatus = { currentAge, hasCurrentAgeData: Boolean(source), message: source ? null : 'No current-age science data' }
      body.model = {
        current: source?.raw_text ? parseScience(source.raw_text) : null,
        capturedAt: source ? when(source) : null,
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
      const [g, statsResult] = await Promise.all([
        db.from('spartan_intel_records')
          .select('id,url,created_at,captured_at,parsed_payload,grid:raw_payload->grid')
          .eq('page_kind', 'intel').or(scope).order('created_at', { ascending: false }).limit(60),
        db.from('spartan_intel_records')
          .select('raw_text,captured_at,created_at')
          .eq('page_kind', 'intel').or(scope)
          .or('raw_text.ilike.%Our KD%,raw_text.ilike.%Enemy KD%')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (g.error) fail(g.error)
      if (statsResult.error) fail(statsResult.error)
      const rows: any[] = g.data || []
      const captures: GridCapture[] = rows
        .filter(r => Array.isArray(r.grid?.rows))
        .map(r => {
          const url = String(r.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '') || '/'
          // The captured page URL is the authoritative kingdom identity. Some older
          // records were assigned the logged-in kingdom even while viewing an enemy KD.
          const fromUrl = url.match(/\/kingdom_intel\/(\d+)\/(\d+)(?:\/|$)/i)
          const kd = fromUrl ? fromUrl[1] + ':' + fromUrl[2] : String(r.parsed_payload?.kingdom_code || '')
          return { kd, at: r.captured_at || r.created_at, url, rows: r.grid.rows }
        })
        .filter(c => /^\d{1,3}:\d{1,3}$/.test(c.kd))
      const byKd: Record<string, GridCapture[]> = {}
      for (const c of captures) (byKd[c.kd] ||= []).push(c)
      const ownKd = String(account.province_location || '')
      const kingdoms = Object.entries(byKd).map(([kd, caps]) => {
        const recent = caps.slice(0, 15)
        const provinces = mergeGrids(recent)[kd] || []
        return { kd, own: kd === ownKd, source: recent[0].url, capturedAt: recent[0].at, captures: recent.length, provinces }
      }).sort((a, b) => Number(b.own) - Number(a.own) || Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      const statsRow = statsResult.data || null
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
      // Keep Province Reporter captures in the feed even when recent Discord KDNEWS
      // reports occupy the generic page-model query's 90-row window.
      const provinceNewsResult = await db.from('spartan_intel_records').select(COLUMNS)
        .eq('page_kind', 'news').neq('source', 'discord-bot').or(scope)
        .order('created_at', { ascending: false }).limit(180)
      if (provinceNewsResult.error) fail(provinceNewsResult.error)
      const provinceNewsRows = ((provinceNewsResult.data || []) as Rec[]).filter(r =>
        !(r.visibility === 'own' && r.user_id !== user.id && r.user_id !== account.id)
      )
      const newsRowMap = new Map<string, Rec>()
      for (const r of [...records, ...provinceNewsRows]) newsRowMap.set(r.id, r)
      const newsRows = [...newsRowMap.values()]
      const n = await newsEvents(db, scope, own, newsRows)
      const botEvents = discordKingdomEvents(records, own)
      // Province Reporter / MPNEWS may also arrive on the bot_event stream.
      // Read that stream separately without changing ingestion.
      const mpResult = await db.from('spartan_intel_records').select(COLUMNS)
        .eq('page_kind', 'bot_event').or(`province_id.eq.${account.id},user_id.eq.${account.id},user_id.eq.${user.id},kingdom_id.eq.${account.province_location}`)
        .order('created_at', { ascending: false }).limit(180)
      if (mpResult.error) fail(mpResult.error)
      const mpRows = ((mpResult.data || []) as Rec[]).filter(r =>
        !(r.visibility === 'own' && r.user_id !== user.id && r.user_id !== account.id) &&
        /Forces from .+?\(\d+:\d+\) came through and ravaged our lands! They captured [\d,]+ acres!/i.test(String(r.raw_text || ''))
      )
      const mpByReport = new Map<string, any>()
      for (const r of mpRows) {
        const text = String(r.raw_text || '').replace(/\s+/g, ' ').trim()
        const hit = text.match(/Forces from (.+?)\s*\((\d+:\d+)\) came through and ravaged our lands! They captured ([\d,]+) acres!(?:\s*We lost (.+?) in this battle\.?)?/i)
        if (!hit) continue
        const attacker = parseNewsParty(`${hit[1]} (${hit[2]})`)
        const losses = hit[4] || ''
        let troopsLost = 0, thievesLost = 0, wizardsLost = 0
        for (const loss of losses.matchAll(/([\d,]+)\s+([a-z][a-z -]*)/gi)) {
          const amount = Number(loss[1].replace(/,/g, ''))
          const unit = loss[2].toLowerCase()
          if (/thief/.test(unit)) thievesLost += amount
          else if (/wizard/.test(unit)) wizardsLost += amount
          else troopsLost += amount
        }
        const at = when(r)
        const stamp = Date.parse(at || '')
        const event = {
          at: at || null, approx: true, gameDate: `MPNEWS · ${new Date(Number.isFinite(stamp) ? stamp : Date.now()).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} UTC`,
          type: 'invade', attacker, defender: { name: own.name, kd: own.kd, known: true },
          acres: Number(hit[3].replace(/,/g, '')), books: 0, troopsLost, thievesLost, wizardsLost,
          side: 'in', text, order: Number.isFinite(stamp) ? stamp : 0, source: 'MPNEWS',
        }
        // Same raw report captured repeatedly = one event; separate reports remain separate.
        const reportKey = [text.toLowerCase(), attacker.name.toLowerCase(), attacker.kd || '', event.acres, troopsLost, thievesLost, wizardsLost].join('|')
        if (!mpByReport.has(reportKey)) mpByReport.set(reportKey, event)
      }
      const normalizedResult = await db.from('spartan_event_history')
        .select('occurred_at,event_type,attacker,defender,target_kingdom,acres_change,troops_lost,thieves_lost,wizards_lost,payload,raw_text')
        .eq('user_id', user.id).eq('source', 'spartan-event-normalizer')
        .order('occurred_at', { ascending: false }).limit(250)
      if (normalizedResult.error) fail(normalizedResult.error)
      const normalizedEvents = (normalizedResult.data || []).map((row: any) => {
        const payload = row.payload || {}
        const attackerOwn = String(row.attacker || '').toLowerCase() === own.name.toLowerCase()
        const defenderOwn = String(row.defender || '').toLowerCase() === own.name.toLowerCase()
        const attackerKd = payload.attacker_kingdom || (attackerOwn ? own.kd : null)
        const defenderKd = payload.defender_kingdom || (defenderOwn ? own.kd : row.target_kingdom || null)
        const attacker = row.attacker ? parseNewsParty(attackerKd ? `${row.attacker} (${attackerKd})` : row.attacker) : null
        const defender = row.defender ? parseNewsParty(defenderKd ? `${row.defender} (${defenderKd})` : row.defender) : null
        const rawType = String(row.event_type || '').toLowerCase()
        const typeMap: Record<string, 'invade' | 'recapture' | 'ambush' | 'pillage' | 'other' | 'capture' | 'plunder'> = { attack: 'invade', incoming_attack: 'invade', invaded: 'invade', ambushed: 'ambush', pillaged: 'pillage', looted: 'plunder', recaptured: 'recapture', captured: 'capture', attempted_an_invasion: 'invade' }
        const type = typeMap[rawType] || 'other'
        const side: 'out' | 'in' | 'other' = attackerOwn || (Boolean(own.kd) && attackerKd === own.kd && defenderKd !== own.kd) ? 'out'
          : defenderOwn || (Boolean(own.kd) && defenderKd === own.kd && attackerKd !== own.kd) ? 'in' : 'other'
        const stamp = Date.parse(row.occurred_at || '')
        return {
          at: row.occurred_at || null, approx: true,
          gameDate: Number.isFinite(stamp) ? `Captured ${new Date(stamp).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}` : 'Captured event',
          type, attacker, defender, acres: Number(row.acres_change || 0), books: Number(payload.books || 0),
          troopsLost: Number(row.troops_lost || 0), thievesLost: Number(row.thieves_lost || 0), wizardsLost: Number(row.wizards_lost || 0),
          side, text: row.raw_text || `${row.attacker || 'Unknown'} ${type} ${row.defender || 'Unknown'}`,
          order: Number.isFinite(stamp) ? stamp : 0, source: 'Normalized event history',
        }
      })
      const signature = (e: any) => [
        String(e.type || '').toLowerCase(),
        String(e.attacker?.name || '').toLowerCase().replace(/\s+/g, ' ').trim(),
        String(e.attacker?.kd || ''),
        String(e.defender?.name || '').toLowerCase().replace(/\s+/g, ' ').trim(),
        String(e.defender?.kd || ''),
        Number(e.acres || 0), Number(e.books || 0),
      ].join('|')
      const kingdomEvents = n.events.map(e => ({ ...e, source: /Forces from .+? came through and ravaged our lands/i.test(e.text) ? 'MPNEWS' : 'KDNEWS', order: e.at ? Date.parse(e.at) : e.order }))
      // Cross-source dedupe is date-aware: repeat captures collapse, but an attacker
      // landing the same-sized hit on another day still counts as a separate attack.
      const datedSignature = (e: any) => {
        const stamp = e.at ? Date.parse(e.at) : NaN
        const day = Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : String(e.gameDate || '')
        return `${signature(e)}|${day}`
      }
      const kingdomKeys = new Set(kingdomEvents.map(datedSignature))
      const botAdditions = botEvents.filter(event => !kingdomKeys.has(datedSignature(event))).map(event => ({ ...event, source: 'KDNEWS' }))
      const mpAdditions = [...mpByReport.values()].filter(event => !kingdomKeys.has(datedSignature(event))).map(event => ({ ...event, source: 'MPNEWS' }))
      const existingKeys = new Set([...kingdomEvents, ...botEvents, ...mpByReport.values()].map(datedSignature))
      const events = [...kingdomEvents, ...botAdditions, ...mpAdditions]
      // Preserve repeated identical reports inside a single normalized capture,
      // while suppressing normalized rows already represented by a raw-feed event.
      for (const event of normalizedEvents) {
        if (!existingKeys.has(datedSignature(event))) events.push(event)
      }
      events.sort((a, b) => b.order - a.order)
      const latestAt = [...newsRows, ...mpRows, ...(normalizedResult.data || [])].map((row: any) => row.occurred_at || when(row)).filter(Boolean).sort((a: string, b: string) => Date.parse(b) - Date.parse(a))[0] || null
      body.model = { events, anchor: n.anchor, captures: n.captures + mpRows.length, latestAt, own }
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
        .select('occurred_at,event_type,source,attacker,defender,target_kingdom,acres_change,troops_lost,thieves_lost,wizards_lost,gold_change,food_change,runes_change,payload,raw_text')
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
          const travel = attackTravelInfo(e.payload, e.raw_text)
          return {
            at: e.occurred_at, type: e.event_type, attacker, defender, targetKingdom: e.target_kingdom || null, direction,
            acres: n(e.acres_change), troops: n(e.troops_lost), thieves: n(e.thieves_lost), wizards: n(e.wizards_lost),
            gold: n(e.gold_change), food: n(e.food_change), runes: n(e.runes_change),
            returnAt: travel.returnAt, travelHours: travel.travelHours,
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
          ...attackTravelInfo(null, e.text),
        }))
      // Bot notifications contain attacks the web news feed may not have captured. Avoid adding
      // a bot duplicate when the same attacker/defender/acres event already came from game news.
      const botNews = await discordAttackNews(db, kingdomScope, account.province_name)
      const signature = (e: any) => [String(e.attacker || '').toLowerCase(), String(e.defender || '').toLowerCase(), Number(e.acres || 0)].join('|')
      const siteSignatures = new Set(fromNews.map(signature))
      // Keep Kingdom News as the canonical event/timestamp, but retain the bot report's
      // explicit return duration when both sources describe the same attack.
      const mergedNews = fromNews.map((event: any) => {
        const report = botNews.find((bot: any) =>
          signature(bot) === signature(event) &&
          Number.isFinite(Number(bot.travelHours)) &&
          Number(bot.travelHours) > 0
        )
        return report
          ? { ...event, travelHours: Number(report.travelHours), returnAt: report.returnAt || event.returnAt || null }
          : event
      })
      events.push(...mergedNews, ...botNews.filter((e: any) => !siteSignatures.has(signature(e))))
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
