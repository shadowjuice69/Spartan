// Front Line: turns the kingdom's Discord attack feeds into hit records and derives war analytics.
// Pure functions only (no React, no Supabase). The API route parses rows with parseFrontLineRows(),
// the page runs analyze() in the browser so the time-window and front switches are instant.

export type HitKind = 'invade' | 'recapture' | 'raze' | 'learn' | 'ambush' | 'massacre' | 'pillage'
export type Side = 'out' | 'in'

export type FrontHit = {
  id: string
  at: string
  side: Side
  kind: HitKind
  attacker: string
  attackerKd: string
  defender: string
  defenderKd: string
  acres: number // land gained by the attacker (0 for raze, learn and massacre)
  razed: number // acres destroyed without being taken
  books: number // books taken by a learn attack
  killed: number // people killed by a massacre
  op: number | null // offense sent (our own attacks only)
  gens: number | null
  returnHours: number | null
  lost: number // own units lost, horses excluded (our own attacks only)
  horsesLost: number
  kills: number | null // enemy units killed
  prisoners: number | null
  plague: boolean
  detailed: boolean // true when it came from the attacker-log report (carries OP, losses and return time)
}

export type FrontRow = { id: string; captured_at?: string | null; created_at?: string | null; raw_text?: string | null }

const HOUR = 3_600_000
const MIN = 60_000

const toNum = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[ ,\s\u00a0]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const clean = (v: string) => v.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()

function stripLine(raw: string) {
  return clean(raw)
    .replace(/^(?::[a-z0-9_+-]+:\s*)+/i, '')
    .replace(/^NEW KDNEWS:\s*/i, '')
    .replace(/\s*\[[^\]\n]{1,40}\]\s*$/, '')
    .trim()
}

const DETAILED = /^(.+?)\s+\[\*\*(.+?)\*\*\]\s+attacked\s+__(.+?)__\s+\((\d+:\d+)\)\s*\|\s*(captured|recaptured|razed|learn)\s*:\s*[\*\s]*([\d,]+)[\*\s]*\|\s*loss\s*:\s*[\*\s]*(.*?)[\*\s]*\|\s*kills\s*:\s*[\*\s]*([\d,]+)(?:\s*\(\+\s*([\d,]+)\s*prisoners?\))?[\*\s]*\|\s*return\s*:\s*([\d.]+)(.*)$/i
const INVADED = /^(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+invaded\s+(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+and\s+(captured|killed)\s+([\d,]+)\s+(?:acres|people)/i
const CAPTURED_FROM = /^(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+(recaptured|captured)\s+([\d,]+)\s+acres(?: of land)?\s+from\s+(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)/i
const AMBUSHED = /^(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+ambushed\s+armies\s+from\s+(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+and\s+took\s+([\d,]+)\s+acres/i
const LOOTED = /^(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+attacked\s+and\s+looted\s+([\d,]+)\s+books\s+from\s+(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)/i
const RAZED = /^(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+razed\s+([\d,]+)\s+acres\s+of\s+(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)/i
const PILLAGED = /^(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+attacked\s+and\s+pillaged\s+the\s+lands\s+of\s+(?:\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)/i

function blank(over: Partial<FrontHit>): FrontHit {
  return {
    id: '', at: '', side: 'out', kind: 'invade', attacker: '', attackerKd: '', defender: '', defenderKd: '',
    acres: 0, razed: 0, books: 0, killed: 0, op: null, gens: null, returnHours: null, lost: 0, horsesLost: 0,
    kills: null, prisoners: null, plague: false, detailed: false, ...over,
  }
}

function parseLosses(text: string) {
  let lost = 0
  let horses = 0
  for (const part of text.split(/\s*(?:,|\band\b)\s*/i)) {
    const m = part.match(/^([\d,]+)\s+(.+)$/)
    if (!m) continue
    if (/horse/i.test(m[2])) horses += toNum(m[1])
    else lost += toNum(m[1])
  }
  return { lost, horses }
}

type Parsed = Omit<FrontHit, 'id' | 'at' | 'side'>

function parseLine(raw: string, ownKd: string): Parsed | null {
  const line = stripLine(raw)
  if (!line) return null

  const d = line.match(DETAILED)
  if (d) {
    const word = d[5].toLowerCase()
    const tail = d[11] || ''
    const off = tail.match(/([\d,]+)\s*off\b(?:\s*\((\d+)\s*gens?\))?/i)
    const amount = toNum(d[6])
    const loss = parseLosses(d[7])
    const ret = Number(d[10])
    return blank({
      kind: word === 'recaptured' ? 'recapture' : word === 'razed' ? 'raze' : word === 'learn' ? 'learn' : 'invade',
      attacker: clean(d[1]), attackerKd: ownKd, defender: clean(d[3]), defenderKd: d[4],
      acres: word === 'captured' || word === 'recaptured' ? amount : 0,
      razed: word === 'razed' ? amount : 0,
      books: word === 'learn' ? amount : 0,
      op: off ? toNum(off[1]) : null, gens: off && off[2] ? toNum(off[2]) : null,
      returnHours: Number.isFinite(ret) && ret > 0 && ret <= 72 ? ret : null,
      lost: loss.lost, horsesLost: loss.horses, kills: toNum(d[8]), prisoners: d[9] ? toNum(d[9]) : null,
      plague: /SPREAD PLAGUE/i.test(tail), detailed: true,
    })
  }

  let m = line.match(INVADED)
  if (m) {
    const massacre = m[5].toLowerCase() === 'killed'
    return blank({
      kind: massacre ? 'massacre' : 'invade', attacker: clean(m[1]), attackerKd: m[2], defender: clean(m[3]), defenderKd: m[4],
      acres: massacre ? 0 : toNum(m[6]), killed: massacre ? toNum(m[6]) : 0,
    })
  }
  m = line.match(CAPTURED_FROM)
  if (m) {
    return blank({
      kind: m[3].toLowerCase() === 'recaptured' ? 'recapture' : 'invade', attacker: clean(m[1]), attackerKd: m[2],
      defender: clean(m[5]), defenderKd: m[6], acres: toNum(m[4]),
    })
  }
  m = line.match(AMBUSHED)
  if (m) return blank({ kind: 'ambush', attacker: clean(m[1]), attackerKd: m[2], defender: clean(m[3]), defenderKd: m[4], acres: toNum(m[5]) })
  m = line.match(LOOTED)
  if (m) return blank({ kind: 'learn', attacker: clean(m[1]), attackerKd: m[2], books: toNum(m[3]), defender: clean(m[4]), defenderKd: m[5] })
  m = line.match(RAZED)
  if (m) return blank({ kind: 'raze', attacker: clean(m[1]), attackerKd: m[2], razed: toNum(m[3]), defender: clean(m[4]), defenderKd: m[5] })
  m = line.match(PILLAGED)
  if (m) return blank({ kind: 'pillage', attacker: clean(m[1]), attackerKd: m[2], defender: clean(m[3]), defenderKd: m[4] })
  return null
}

function fnv(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

export type ParseCoverage = { rows: number; lines: number; parsed: number; unparsed: number; duplicates: number; detailed: number; incoming: number; first: string | null; last: string | null }

/** Parse captured Discord rows into deduplicated hits. Only hits that involve the own kingdom are kept. */
export function parseFrontLineRows(rows: FrontRow[], ownKd: string): { hits: FrontHit[]; coverage: ParseCoverage } {
  const found: Array<FrontHit & { occ: number }> = []
  let lines = 0
  let unparsed = 0
  for (const row of rows) {
    const at = row.captured_at || row.created_at || ''
    if (!at || !Number.isFinite(Date.parse(at)) || !row.raw_text) continue
    const seen = new Map<string, number>()
    for (const rawLine of String(row.raw_text).split(/\r?\n/)) {
      if (!/attacked\s+__|\binvaded\b|\bcaptured\b|\bambushed\b|\blooted\b|\brazed\b|\bpillaged\b/i.test(rawLine)) continue
      if (/^\s*Attempted to send message/i.test(rawLine)) continue
      lines++
      const p = parseLine(rawLine, ownKd)
      if (!p) { unparsed++; continue }
      const side: Side | null = p.attackerKd === ownKd ? 'out' : p.defenderKd === ownKd ? 'in' : null
      if (!side) continue
      const sig = [side, p.kind, p.attacker, p.defender, p.acres, p.books, p.killed, p.op ?? '', p.returnHours ?? ''].join('|').toLowerCase()
      const occ = (seen.get(sig) || 0) + 1
      seen.set(sig, occ)
      found.push({ ...p, id: '', at, side, occ })
    }
  }
  found.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const kept: FrontHit[] = []
  const lastSeen = new Map<string, number>()
  let duplicates = 0
  for (const h of found) {
    const t = Date.parse(h.at)
    const sig = [h.side, h.kind, h.attacker, h.defender, h.acres, h.books, h.killed, h.op ?? '', h.returnHours ?? '', h.occ].join('|').toLowerCase()
    const prev = lastSeen.get(sig)
    // The same announcement captured again a few minutes later is one hit, not two.
    if (prev != null && t - prev <= (h.detailed ? 2 : 6) * MIN) { duplicates++; continue }
    lastSeen.set(sig, t)
    const { occ: _occ, ...hit } = h
    void _occ
    kept.push({ ...hit, id: fnv(`${sig}|${Math.floor(t / (6 * MIN))}`) + '-' + kept.length.toString(36) })
  }

  // A hit of ours announced in both feeds keeps the detailed report.
  const detailedOut = kept.filter(h => h.side === 'out' && h.detailed)
  const hits = kept.filter(h => {
    if (h.side !== 'out' || h.detailed) return true
    const t = Date.parse(h.at)
    return !detailedOut.some(d => d.attacker === h.attacker && d.defender === h.defender && d.acres === h.acres && Math.abs(Date.parse(d.at) - t) <= 10 * MIN)
  })

  const times = hits.map(h => Date.parse(h.at))
  return {
    hits,
    coverage: {
      rows: rows.length, lines, parsed: lines - unparsed, unparsed, duplicates,
      detailed: hits.filter(h => h.detailed).length, incoming: hits.filter(h => h.side === 'in').length,
      first: times.length ? new Date(Math.min(...times)).toISOString() : null,
      last: times.length ? new Date(Math.max(...times)).toISOString() : null,
    },
  }
}

/* ------------------------------------------------------------------ analytics */

export type H = FrontHit & { t: number }
export const withTime = (hits: FrontHit[]): H[] => hits.map(h => ({ ...h, t: Date.parse(h.at) })).filter(h => Number.isFinite(h.t)).sort((a, b) => a.t - b.t)

export type AnalyzeOptions = { now: number; windowMs: number | null; enemyKd: string | null }

const foeOf = (h: FrontHit) => (h.side === 'out' ? h.defenderKd : h.attackerKd)
const sum = (list: number[]) => list.reduce((s, v) => s + v, 0)
const WASTE_WINDOW = 3 * HOUR
const WASTE_MARGIN = 1.1
const RECENT_BREAK = 12 * HOUR

/** OP sent above what an earlier army already proved enough against the same province within 3 hours. */
function wasteByHit(outHits: H[]) {
  const byTarget = new Map<string, H[]>()
  for (const h of outHits) {
    if (h.op == null) continue
    const key = `${h.defender}|${h.defenderKd}`
    const list = byTarget.get(key) || []
    list.push(h)
    byTarget.set(key, list)
  }
  const waste = new Map<string, number>()
  for (const list of byTarget.values()) {
    list.sort((a, b) => a.t - b.t)
    list.forEach((h, i) => {
      let ref: number | null = null
      for (let j = 0; j < i; j++) {
        if (h.t - list[j].t <= WASTE_WINDOW && list[j].op != null) ref = ref == null ? list[j].op! : Math.min(ref, list[j].op!)
      }
      waste.set(h.id, ref == null ? 0 : Math.max(0, (h.op as number) - ref * WASTE_MARGIN))
    })
  }
  return waste
}

export type Totals = {
  outHits: number; inHits: number; acresTaken: number; acresLost: number; net: number
  opSent: number; acresPerKop: number | null; wasteOp: number; wastePct: number | null; wasteHits: number | null
  unitsLost: number; kills: number; killedPeople: number; razedIn: number; razedOut: number
}

export type TargetRow = {
  name: string; kd: string; hits: number; acres: number; lastAt: number; firstAt: number
  minOp: number | null; ceiling: number | null; ceilingAt: number | null; avgOp: number | null; maxOp: number | null; lastOp: number | null
  hits6h: number; attackers: number; wasteOp: number; avgAcres: number
  readyToBreak: number; soonToBreak: number
  hitsList: Array<{ t: number; attacker: string; op: number | null; acres: number; kind: HitKind }>
}

export type AttackerRow = {
  name: string; hits: number; acres: number; opTotal: number; opAvg: number | null; gensAvg: number | null
  acresPerKop: number | null; lost: number; lostPerAcre: number | null; wasteOp: number; wastePct: number | null
  best: number; lastAt: number; returnAt: number | null; plague: number
}

export type AggressorRow = { name: string; kd: string; hits: number; acres: number; killed: number; victims: number; lastAt: number; hits1h: number }
export type SiegeRow = { name: string; hits: number; acres: number; killed: number; razed: number; lastAt: number; hits1h: number; hits6h: number; attackers: number }
export type FrontRowSummary = { kd: string; out: number; in: number; taken: number; lost: number; net: number; lastAt: number }
export type ForceRow = { name: string; lastOp: number; gens: number | null; returnAt: number | null; home: boolean; lastAt: number }
export type TempoBucket = { t0: number; t1: number; out: number; in: number; acresOut: number; acresIn: number }

export type FrontAnalysis = {
  totals: Totals
  previous: { net: number; acresTaken: number; acresLost: number; hits: number }
  tempo: TempoBucket[]
  clock: Array<{ hour: number; out: number; in: number }>
  targets: TargetRow[]
  attackers: AttackerRow[]
  aggressors: AggressorRow[]
  siege: SiegeRow[]
  fronts: FrontRowSummary[]
  force: ForceRow[]
  waves: Array<{ attacker: string; target: string; op: number; gens: number | null; hitAt: number; returnAt: number }>
  forecast: Array<{ hour: number; op: number; armies: number }>
  yieldCurve: Array<{ prior: number; ratio: number; n: number }>
  windowStart: number | null
}

const BUCKETS: Array<[maxWindow: number, size: number]> = [
  [6 * HOUR, 10 * MIN], [24 * HOUR, HOUR], [3 * 24 * HOUR, 3 * HOUR], [8 * 24 * HOUR, 6 * HOUR], [Infinity, 12 * HOUR],
]

export function analyze(all: FrontHit[], opts: AnalyzeOptions): FrontAnalysis {
  const { now, windowMs, enemyKd } = opts
  const timed = withTime(all)
  const inFront = (h: H) => !enemyKd || foeOf(h) === enemyKd
  const start = windowMs == null ? null : now - windowMs
  const inWin = (h: H) => (start == null || h.t >= start) && h.t <= now + MIN
  const scoped = timed.filter(inFront)
  const win = scoped.filter(inWin)
  const outHits = win.filter(h => h.side === 'out')
  const inHits = win.filter(h => h.side === 'in')
  const waste = wasteByHit(scoped.filter(h => h.side === 'out'))

  const acresTaken = sum(outHits.map(h => h.acres))
  const acresLost = sum(inHits.map(h => h.acres))
  const opHits = outHits.filter(h => h.op != null)
  const opSent = sum(opHits.map(h => h.op as number))
  const acresWithOp = sum(opHits.map(h => h.acres))
  const wasteOp = sum(opHits.map(h => waste.get(h.id) || 0))
  const avgOp = opHits.length ? opSent / opHits.length : null
  const totals: Totals = {
    outHits: outHits.length, inHits: inHits.length, acresTaken, acresLost, net: acresTaken - acresLost,
    opSent, acresPerKop: opSent > 0 ? acresWithOp / (opSent / 1000) : null,
    wasteOp, wastePct: opSent > 0 ? (wasteOp / opSent) * 100 : null, wasteHits: avgOp ? wasteOp / avgOp : null,
    unitsLost: sum(outHits.map(h => h.lost)), kills: sum(outHits.map(h => h.kills || 0)),
    killedPeople: sum(inHits.map(h => h.killed)),
    razedIn: sum(inHits.map(h => h.razed)), razedOut: sum(outHits.map(h => h.razed)),
  }

  let previous = { net: 0, acresTaken: 0, acresLost: 0, hits: 0 }
  if (windowMs != null) {
    const before = scoped.filter(h => h.t >= now - 2 * windowMs && h.t < now - windowMs)
    const a = sum(before.filter(h => h.side === 'out').map(h => h.acres))
    const l = sum(before.filter(h => h.side === 'in').map(h => h.acres))
    previous = { net: a - l, acresTaken: a, acresLost: l, hits: before.length }
  }

  // Tempo: hits per time bucket, ending now.
  const span = windowMs ?? (scoped.length ? Math.max(HOUR, now - scoped[0].t) : 24 * HOUR)
  const size = (BUCKETS.find(([max]) => span <= max) || BUCKETS[BUCKETS.length - 1])[1]
  const count = Math.max(1, Math.min(96, Math.ceil(span / size)))
  const tempo: TempoBucket[] = Array.from({ length: count }, (_, i) => {
    const t1 = now - (count - 1 - i) * size
    return { t0: t1 - size, t1, out: 0, in: 0, acresOut: 0, acresIn: 0 }
  })
  for (const h of win) {
    const idx = tempo.findIndex(b => h.t > b.t0 && h.t <= b.t1)
    if (idx < 0) continue
    if (h.side === 'out') { tempo[idx].out++; tempo[idx].acresOut += h.acres } else { tempo[idx].in++; tempo[idx].acresIn += h.acres }
  }

  const clock = Array.from({ length: 24 }, (_, hour) => ({ hour, out: 0, in: 0 }))
  for (const h of win) clock[new Date(h.t).getHours()][h.side]++

  // Strike force: each attacker's newest army (from all data, not just the window or the front filter).
  const newestByAttacker = new Map<string, H>()
  for (const h of timed.filter(x => x.side === 'out' && x.op != null)) newestByAttacker.set(h.attacker, h)
  const force: ForceRow[] = [...newestByAttacker.values()]
    .filter(h => now - h.t <= 48 * HOUR)
    .map(h => {
      const returnAt = h.returnHours != null ? h.t + h.returnHours * HOUR : null
      return { name: h.attacker, lastOp: h.op as number, gens: h.gens, returnAt, home: returnAt == null || returnAt <= now, lastAt: h.t }
    })
    .sort((a, b) => Number(b.home) - Number(a.home) || (a.returnAt ?? 0) - (b.returnAt ?? 0))

  // Targets: enemy provinces we hit in the window.
  const groups = new Map<string, H[]>()
  for (const h of outHits) {
    const key = `${h.defender}|${h.defenderKd}`
    const list = groups.get(key) || []
    list.push(h)
    groups.set(key, list)
  }
  const targets: TargetRow[] = [...groups.entries()].map(([key, list]) => {
    const [name, kd] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)]
    const withOp = list.filter(h => h.op != null)
    const recent = withOp.filter(h => now - h.t <= RECENT_BREAK)
    const pool = recent.length ? recent : withOp
    const lowest = pool.reduce<H | null>((m, h) => (m == null || (h.op as number) < (m.op as number) ? h : m), null)
    const ceiling = lowest ? (lowest.op as number) : null
    return {
      name, kd, hits: list.length, acres: sum(list.map(h => h.acres)),
      lastAt: Math.max(...list.map(h => h.t)), firstAt: Math.min(...list.map(h => h.t)),
      minOp: withOp.length ? Math.min(...withOp.map(h => h.op as number)) : null,
      ceiling, ceilingAt: lowest ? lowest.t : null,
      avgOp: withOp.length ? sum(withOp.map(h => h.op as number)) / withOp.length : null,
      maxOp: withOp.length ? Math.max(...withOp.map(h => h.op as number)) : null,
      lastOp: withOp.length ? (withOp[withOp.length - 1].op as number) : null,
      hits6h: list.filter(h => now - h.t <= 6 * HOUR).length,
      attackers: new Set(list.map(h => h.attacker)).size,
      wasteOp: sum(list.map(h => waste.get(h.id) || 0)),
      avgAcres: list.length ? sum(list.map(h => h.acres)) / list.length : 0,
      readyToBreak: ceiling == null ? 0 : force.filter(f => f.home && f.lastOp >= ceiling).length,
      soonToBreak: ceiling == null ? 0 : force.filter(f => !f.home && f.returnAt != null && f.returnAt - now <= 3 * HOUR && f.lastOp >= ceiling).length,
      hitsList: list.map(h => ({ t: h.t, attacker: h.attacker, op: h.op, acres: h.acres, kind: h.kind })).sort((a, b) => b.t - a.t),
    }
  }).sort((a, b) => b.lastAt - a.lastAt)

  // Our attackers.
  const byAttacker = new Map<string, H[]>()
  for (const h of outHits) { const list = byAttacker.get(h.attacker) || []; list.push(h); byAttacker.set(h.attacker, list) }
  const attackers: AttackerRow[] = [...byAttacker.entries()].map(([name, list]) => {
    const withOp = list.filter(h => h.op != null)
    const opTotal = sum(withOp.map(h => h.op as number))
    const acres = sum(list.map(h => h.acres))
    const acresOp = sum(withOp.map(h => h.acres))
    const lost = sum(list.map(h => h.lost))
    const w = sum(withOp.map(h => waste.get(h.id) || 0))
    const gens = list.filter(h => h.gens != null)
    const newest = list[list.length - 1]
    const returnAt = newest.returnHours != null ? newest.t + newest.returnHours * HOUR : null
    return {
      name, hits: list.length, acres, opTotal, opAvg: withOp.length ? opTotal / withOp.length : null,
      gensAvg: gens.length ? sum(gens.map(h => h.gens as number)) / gens.length : null,
      acresPerKop: opTotal > 0 ? acresOp / (opTotal / 1000) : null, lost, lostPerAcre: acres > 0 ? lost / acres : null,
      wasteOp: w, wastePct: opTotal > 0 ? (w / opTotal) * 100 : null, best: Math.max(0, ...list.map(h => h.acres)),
      lastAt: newest.t, returnAt: returnAt != null && returnAt > now ? returnAt : null, plague: list.filter(h => h.plague).length,
    }
  }).sort((a, b) => b.acres - a.acres)

  // Enemy aggressors and our provinces under fire.
  const byAggressor = new Map<string, H[]>()
  const bySiege = new Map<string, H[]>()
  for (const h of inHits) {
    const ak = `${h.attacker}|${h.attackerKd}`
    byAggressor.set(ak, [...(byAggressor.get(ak) || []), h])
    bySiege.set(h.defender, [...(bySiege.get(h.defender) || []), h])
  }
  const aggressors: AggressorRow[] = [...byAggressor.values()].map(list => ({
    name: list[0].attacker, kd: list[0].attackerKd, hits: list.length, acres: sum(list.map(h => h.acres)), killed: sum(list.map(h => h.killed)),
    victims: new Set(list.map(h => h.defender)).size, lastAt: Math.max(...list.map(h => h.t)), hits1h: list.filter(h => now - h.t <= HOUR).length,
  })).sort((a, b) => b.acres - a.acres || b.hits - a.hits)
  const siege: SiegeRow[] = [...bySiege.entries()].map(([name, list]) => ({
    name, hits: list.length, acres: sum(list.map(h => h.acres)), killed: sum(list.map(h => h.killed)), razed: sum(list.map(h => h.razed)),
    lastAt: Math.max(...list.map(h => h.t)), hits1h: list.filter(h => now - h.t <= HOUR).length,
    hits6h: list.filter(h => now - h.t <= 6 * HOUR).length, attackers: new Set(list.map(h => h.attacker)).size,
  })).sort((a, b) => b.acres - a.acres || b.hits - a.hits)

  // Fronts: every enemy kingdom, ignoring the front filter so the picker always shows all of them.
  const everyWin = timed.filter(inWin)
  const frontMap = new Map<string, FrontRowSummary>()
  for (const h of everyWin) {
    const kd = foeOf(h)
    const row = frontMap.get(kd) || { kd, out: 0, in: 0, taken: 0, lost: 0, net: 0, lastAt: 0 }
    if (h.side === 'out') { row.out++; row.taken += h.acres } else { row.in++; row.lost += h.acres }
    row.net = row.taken - row.lost
    row.lastAt = Math.max(row.lastAt, h.t)
    frontMap.set(kd, row)
  }
  const fronts = [...frontMap.values()].sort((a, b) => b.out + b.in - (a.out + a.in))

  // Armies still out (everything, regardless of the window) and when they land.
  const waves = timed
    .filter(h => inFront(h) && h.side === 'out' && h.returnHours != null && h.op != null && h.t + (h.returnHours as number) * HOUR > now)
    .map(h => ({ attacker: h.attacker, target: h.defender, op: h.op as number, gens: h.gens, hitAt: h.t, returnAt: h.t + (h.returnHours as number) * HOUR }))
    .sort((a, b) => a.returnAt - b.returnAt)
  const forecast = Array.from({ length: 16 }, (_, hour) => ({ hour, op: 0, armies: 0 }))
  for (const w of waves) {
    const hour = Math.min(15, Math.max(0, Math.floor((w.returnAt - now) / HOUR)))
    forecast[hour].op += w.op
    forecast[hour].armies++
  }

  // Yield curve: how much a hit gives relative to the best hit on that same province, by hits taken in the prior 12h.
  const yieldBuckets = new Map<number, number[]>()
  for (const list of groups.values()) {
    const land = list.filter(h => h.acres > 0 && (h.kind === 'invade' || h.kind === 'recapture')).sort((a, b) => a.t - b.t)
    if (land.length < 3) continue
    const top = Math.max(...land.map(h => h.acres))
    land.forEach((h, i) => {
      const prior = Math.min(4, land.slice(0, i).filter(p => h.t - p.t <= 12 * HOUR).length)
      yieldBuckets.set(prior, [...(yieldBuckets.get(prior) || []), h.acres / top])
    })
  }
  const yieldCurve = [...yieldBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([prior, ratios]) => ({ prior, ratio: sum(ratios) / ratios.length, n: ratios.length }))

  return { totals, previous, tempo, clock, targets, attackers, aggressors, siege, fronts, force, waves, forecast, yieldCurve, windowStart: start }
}
