// Parses the Kingdom News page text (the "Kingdom Reporter" feed) into attack events.
// The same feed is captured over and over, so callers should dedupe with eventKey().

export type Party = { name: string; kd: string | null; known: boolean }
export type NewsEvent = {
  gameDate: string
  month: string
  day: number
  year: number
  type: 'invade' | 'capture' | 'recapture' | 'ambush' | 'plunder' | 'pillage' | 'other'
  attacker: Party | null
  defender: Party | null
  acres: number
  books: number
  text: string
}

const DATE = '(?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2} of YR\\d+'
const PARTY = '(An unknown province from .+?|\\d+ - .+?)'
const KD = ' \\((\\d+:\\d+)\\)'
const num = (s: string) => Number(String(s).replace(/,/g, ''))

export function party(raw: string): Party {
  const s = raw.trim()
  const kd = s.match(/\\((\\d+:\\d+)\\)\\s*$/)?.[1] ?? null
  const unknown = s.match(/^An unknown province from (.+?)\\s*(?:\\(\\d+:\\d+\\))?$/)
  if (unknown) return { name: unknown[1].trim(), kd, known: false }
  const named = s.match(/^\\d+ - (.+?)\\s*(?:\\(\\d+:\\d+\\))?$/)
  return { name: (named ? named[1] : s).trim(), kd, known: true }
}

const RULES: { type: NewsEvent['type']; re: RegExp; a: number; d: number; acres?: number; books?: number }[] = [
  { type: 'invade', re: new RegExp(`^${PARTY}${KD} invaded ${PARTY}${KD} and captured ([\\\\d,]+) acres of land$`), a: 1, d: 3, acres: 5 },
  { type: 'recapture', re: new RegExp(`^${PARTY}${KD} recaptured ([\\\\d,]+) acres of land from ${PARTY}${KD}$`), a: 1, d: 4, acres: 3 },
  { type: 'capture', re: new RegExp(`^${PARTY}${KD} captured ([\\\\d,]+) acres of land from ${PARTY}${KD}$`), a: 1, d: 4, acres: 3 },
  { type: 'ambush', re: new RegExp(`^${PARTY}${KD} ambushed armies from ${PARTY}${KD} and took ([\\\\d,]+) acres of land$`), a: 1, d: 3, acres: 5 },
  { type: 'plunder', re: new RegExp(`^${PARTY}${KD} attacked and looted ([\\\\d,]+) books from ${PARTY}${KD}$`), a: 1, d: 4, books: 3 },
  { type: 'pillage', re: new RegExp(`^${PARTY}${KD} invaded and pillaged ${PARTY}${KD}$`), a: 1, d: 3 },
]

export function parseKingdomNews(text: string): NewsEvent[] {
  const flat = String(text || '').replace(/\\s+/g, ' ')
  const start = flat.search(new RegExp(DATE))
  if (start < 0) return []
  const body = flat.slice(start).split(/ Copyright \\d{4}/)[0]
  const chunks = body.split(new RegExp(`(?= ${DATE} )`)).map((c) => c.trim()).filter(Boolean)
  const events: NewsEvent[] = []
  for (const chunk of chunks) {
    const head = chunk.match(new RegExp(`^(${DATE}) (.*)$`))
    if (!head) continue
    const [, gameDate, rest] = head
    const dm = gameDate.match(/^([A-Za-z]+) (\\d{1,2}) of YR(\\d+)$/)!
    const line = rest.replace(/\\.$/, '').trim()
    let ev: NewsEvent | null = null
    for (const r of RULES) {
      const m = line.match(r.re)
      if (!m) continue
      const kdOf = (i: number) => m[i + 1]
      const a = party(`${m[r.a]} (${kdOf(r.a)})`)
      const d = party(`${m[r.d]} (${kdOf(r.d)})`)
      ev = { gameDate, month: dm[1], day: Number(dm[2]), year: Number(dm[3]), type: r.type, attacker: a, defender: d,
        acres: r.acres ? num(m[r.acres]) : 0, books: r.books ? num(m[r.books]) : 0, text: `${gameDate} ${line}.` }
      break
    }
    if (!ev && /\\b(invaded|captured|ambushed|looted|pillaged|raided)\\b/.test(line) && line.length < 220) {
      ev = { gameDate, month: dm[1], day: Number(dm[2]), year: Number(dm[3]), type: 'other', attacker: null, defender: null, acres: 0, books: 0, text: `${gameDate} ${line}.` }
    }
    if (ev) events.push(ev)
  }
  return events
}
export const eventKey = (e: NewsEvent) => e.text
export function mergeNews(texts: string[]): NewsEvent[] {
  const best = new Map<string, { ev: NewsEvent; count: number; order: number }>()
  let order = 0
  for (const t of texts) {
    const counts = new Map<string, { ev: NewsEvent; n: number }>()
    for (const e of parseKingdomNews(t)) {
      const k = eventKey(e)
      const c = counts.get(k)
      if (c) c.n += 1; else counts.set(k, { ev: e, n: 1 })
    }
    for (const [k, c] of counts) {
      const prev = best.get(k)
      if (!prev) best.set(k, { ev: c.ev, count: c.n, order: order++ })
      else if (c.n > prev.count) prev.count = c.n
    }
  }
  const out: NewsEvent[] = []
  for (const { ev, count } of [...best.values()].sort((a, b) => a.order - b.order)) for (let i = 0; i < count; i++) out.push(ev)
  return out
}
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july']
export const DAY_MS = 86_400_000
export const dayIndex = (month: string, day: number, year: number) => {
  const m = MONTHS.indexOf(month.toLowerCase())
  return m < 0 ? null : (year - 1) * 168 + m * 24 + (day - 1)
}
export function findGameDate(text: string | null | undefined): { month: string; day: number; year: number } | null {
  const m = String(text || '').replace(/\\s+/g, ' ').match(/\\b(January|February|March|April|May|June|July) (\\d{1,2})(?:st|nd|rd|th)?,? (?:of )?YR ?(\\d+)/i)
  return m ? { month: m[1], day: Number(m[2]), year: Number(m[3]) } : null
}
export function realTimeOf(e: NewsEvent, anchor: { at: string; month: string; day: number; year: number } | null): string | null {
  if (!anchor) return null
  const a = dayIndex(anchor.month, anchor.day, anchor.year)
  const b = dayIndex(e.month, e.day, e.year)
  const t = Date.parse(anchor.at)
  if (a === null || b === null || !Number.isFinite(t)) return null
  return new Date(t - (a - b) * DAY_MS).toISOString()
}
const key = (s: string | null | undefined) => String(s || '').toLowerCase().replace(/\\s+/g, ' ').trim()
export function sideOf(e: NewsEvent, own: { name: string; kd: string | null }): 'out' | 'in' | 'other' {
  const is = (p: Party | null) => !!p && p.known && key(p.name) === key(own.name) && (!p.kd || !own.kd || p.kd === own.kd)
  if (is(e.attacker)) return 'out'
  if (is(e.defender)) return 'in'
  return 'other'
}
