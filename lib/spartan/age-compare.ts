// Age comparison: parse two Utopia age rule write-ups and diff them.
//
// Handles both text shapes seen so far:
//  - "116 style": wiki/patch-note paragraphs. Items are separated by [cite: n] tags,
//    races read "Avian Bonuses: ... War Doctrine (In War): ... Units: ...",
//    personalities are "• The Artisan: ..., Passive: ...".
//  - "117 style": markdown-ish. "Avian — tagline" headers, bare labels (Bonuses, Penalties,
//    Doctrine, Military, ...) and bullet lists, with doubled dashes ("- - x") left over from copy/paste.
//
// Both are normalised into the same Item rows, matched per entity, and compared.

export type Category = 'Race' | 'Personality' | 'Ritual' | 'Dragon'
export type Status = 'buff' | 'nerf' | 'changed' | 'added' | 'removed' | 'unchanged'
export type Pool = 'traits' | 'doctrine' | 'spells' | 'ability' | 'units'

export interface Item {
  pool: Pool
  group: string // Bonus, Penalty, Starting, Effect, Doctrine, Spell, Ability, Military
  key: string // match key
  label: string // short row label
  display: string // text shown in the compare column
  value?: number
  unit?: string // '%', '', 'gc'
  polarity: 1 | -1 | 0 // +1 = higher number is better, -1 = lower number is better, 0 = unknown/neutral
  tokens: string[]
  body?: string // ability description
}

export interface Entity {
  category: Category
  name: string
  tagline?: string
  items: Item[]
}

export interface ParsedAge {
  entities: Entity[]
  notes: string[]
  warnings: string[]
  unrecognized: string[]
}

export interface DiffRow {
  group: string
  label: string
  oldText?: string
  newText?: string
  status: Status
  delta?: string
  note?: string
}

export interface EntityDiff {
  category: Category
  name: string
  tagline?: string
  status: Status
  rows: DiffRow[]
  counts: Record<Status, number>
}

export interface Comparison {
  entities: EntityDiff[]
  totals: Record<Status, number>
  oldParsed: ParsedAge
  newParsed: ParsedAge
}

export const STATUSES: Status[] = ['buff', 'nerf', 'changed', 'added', 'removed', 'unchanged']
const CATEGORY_RANK: Record<Category, number> = { Race: 0, Personality: 1, Ritual: 2, Dragon: 3 }
const POOL_RANK: Record<Pool, number> = { traits: 0, doctrine: 1, spells: 2, ability: 3, units: 4 }

function emptyCounts(): Record<Status, number> {
  return { buff: 0, nerf: 0, changed: 0, added: 0, removed: 0, unchanged: 0 }
}

/* ------------------------------------------------------------------ */
/* text helpers                                                        */
/* ------------------------------------------------------------------ */

function prepare(input: string): string[] {
  return input
    .replace(/\r/g, '')
    .replace(/\[cite:[^\]]*\]/gi, '\n') // every cite tag ends an item
    .split('\n')
    .map((l) => l.replace(/[\u00a0\u200b]/g, ' ').replace(/\u2212/g, '-').trim())
}

// Removes list bullets, including the doubled "- - x" and mangled "-+20%" / "++15%" / "+Destroys" forms.
function stripBullets(line: string): string {
  let s = line.replace(/^(?:[•·*]\s*|[-–—]\s+)+/, '')
  s = s.replace(/^[-+]([-+]\d)/, '$1').replace(/^[-+](?=[A-Za-z])/, '')
  return s.trim()
}

function canonKey(name: string): string {
  return name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '')
}

function cleanName(name: string): string {
  const n = name.replace(/^the\s+/i, '').replace(/\s+/g, ' ').trim()
  return /^all dragons$/i.test(n) ? 'All dragons' : n.replace(/\s+dragons?$/i, '')
}

function splitTop(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

const STOP = new Set(['for', 'and', 'the', 'of', 'a', 'an', 'to', 'in', 'per', 'on', 'at', 'by', 'with', 'when'])

const ALIASES: Array<[RegExp, string]> = [
  [/\battack travel time\b/g, 'attack time'],
  [/\bmilitary wage cost\b|\bmilitary wages\b|\bwage cost\b/g, 'wages'],
  [/\b(?:training|specialist) credits?\b/g, 'specialist credits'],
  [/\bdamage (?:taken|received)(?: from)?\b/g, 'damage received'],
  [/\bdme\b/g, 'defensive military efficiency'],
  [/\bome\b/g, 'offensive military efficiency'],
  [/\bextra\s+/g, ''],
  [/\bmaximum population\b/g, 'population'],
  [/\bcombat (?=instant)/g, ''],
]

function canonStat(s: string): string {
  let t = s.toLowerCase().replace(/[’']/g, '').replace(/[()]/g, ' ')
  for (const [re, rep] of ALIASES) t = t.replace(re, rep)
  return t.replace(/[^a-z0-9%./ -]/g, ' ').replace(/\s+/g, ' ').trim()
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('sses')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ses')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function tokensOf(c: string): string[] {
  return c
    .split(/[\s/]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w && !STOP.has(w))
    .map(stem)
}

const NEGATIVE_WORDS = new Set(['casualty', 'loss', 'wage', 'cost', 'time', 'consumption', 'desertion'])

// +1 when a bigger number is good for the player, -1 when a bigger number is bad (costs, losses, times, damage taken).
function polarityOf(c: string): 1 | -1 {
  if (/\bdamage (?:received|from)\b|\breceived\b/.test(c)) return -1
  const t = tokensOf(c)
  let p: 1 | -1 = t.some((w) => NEGATIVE_WORDS.has(w)) ? -1 : 1
  if (t.includes('enemy')) p = p === 1 ? -1 : 1
  return p
}

function tidy(s: string): string {
  const t = s.replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function makeItem(pool: Pool, group: string, rawIn: string): Item {
  const raw = rawIn.replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim()
  let value: number | undefined
  let unit: string | undefined
  let stat = raw
  let forcedPolarity: 1 | -1 | undefined

  const m = raw.match(/^([+-]?)(\d+(?:\.\d+)?)\s*(%?)\s+(\D.*)$/)
  const dm = m ? null : raw.match(/^destroys\s+(\d+(?:\.\d+)?)\s*%/i)
  if (m) {
    value = parseFloat(m[2]) * (m[1] === '-' ? -1 : 1)
    unit = m[3]
    stat = m[4]
  } else if (dm) {
    value = parseFloat(dm[1])
    unit = '%'
    stat = 'destroys on arrival'
    forcedPolarity = -1 // more destruction is worse for the target
  }

  const c = canonStat(stat)
  if (c === 'per province' && value !== undefined) {
    value = Math.abs(value)
    forcedPolarity = 1
  }
  const polarity: 1 | -1 | 0 = value === undefined ? 0 : (forcedPolarity ?? polarityOf(c))
  return {
    pool,
    group,
    key: pool + ':' + c,
    label: value === undefined ? tidy(raw).slice(0, 60) : tidy(stat),
    display: raw,
    value,
    unit,
    polarity,
    tokens: tokensOf(c),
  }
}

function spellItem(name: string): Item {
  return { pool: 'spells', group: 'Spell', key: 'spell:' + canonKey(name), label: 'Spell', display: name, polarity: 0, tokens: [] }
}

function abilityItem(name: string, text: string): Item {
  return {
    pool: 'ability',
    group: 'Ability',
    key: 'ability:' + canonKey(name),
    label: name,
    display: text ? `${name}: ${text}` : name,
    body: text,
    polarity: 0,
    tokens: [],
  }
}

function unitItem(key: string, label: string, value: number, unit: string, polarity: 1 | -1 | 0, display: string): Item {
  return { pool: 'units', group: 'Military', key: 'unit:' + key, label, display, value, unit, polarity, tokens: [] }
}

/* ------------------------------------------------------------------ */
/* parser                                                              */
/* ------------------------------------------------------------------ */

interface Draft {
  category: Category
  name: string
  tagline?: string
  style: '116' | '117'
  items: Item[]
  abilities: Array<{ name: string; text: string }>
}

interface State {
  zone: Category | 'General' | null
  cur: Draft | null
  skipping: boolean
  pool: Pool | null
  group: string
}

const ZONES = new Map<string, Category | 'General'>([
  ['races', 'Race'],
  ['personalities', 'Personality'],
  ['rituals', 'Ritual'],
  ['dragons', 'Dragon'],
  ['general changes', 'General'],
])

// Patch-note headings that are not part of the ruleset sections.
const IGNORE = new Set([
  'schedule',
  'core mechanics & system changes',
  'war doctrine updates',
  'buildings',
  'science',
  'spells',
  'thievery',
  'attacking and defending',
  'relations & hostility',
])

const BARE_LABELS: Array<[RegExp, Pool, string]> = [
  [/^bonuses$/i, 'traits', 'Bonus'],
  [/^penalties$/i, 'traits', 'Penalty'],
  [/^starting units$/i, 'traits', 'Starting'],
  [/^unique spells?$/i, 'spells', 'Spell'],
  [/^doctrines?$/i, 'doctrine', 'Doctrine'],
  [/^military$/i, 'units', 'Military'],
  [/^unique abilit(?:y|ies)$/i, 'ability', 'Ability'],
]

function isBareLabel(s: string): boolean {
  return BARE_LABELS.some(([re]) => re.test(s))
}

interface InlineLabel {
  pool: Pool
  group: string
  rest: string
  ability?: { name: string; text: string }
}

function inlineLabel(line: string): InlineLabel | null {
  let m: RegExpMatchArray | null
  if ((m = line.match(/^bonuses:\s*(.*)$/i))) return { pool: 'traits', group: 'Bonus', rest: m[1] }
  if ((m = line.match(/^penalties:\s*(.*)$/i))) return { pool: 'traits', group: 'Penalty', rest: m[1] }
  if ((m = line.match(/^war doctrine(?:\s*\([^)]*\))?:\s*(.*)$/i))) return { pool: 'doctrine', group: 'Doctrine', rest: m[1] }
  if ((m = line.match(/^unique passive\s*[-–]\s*([^:]+):\s*(.*)$/i)))
    return { pool: 'ability', group: 'Ability', rest: '', ability: { name: m[1].trim(), text: m[2].trim() } }
  if ((m = line.match(/^passive:\s*(.*)$/i))) {
    const am = m[1].match(/^([^(]+?)\s*\((.*)\)\s*\.?$/)
    return {
      pool: 'ability',
      group: 'Ability',
      rest: '',
      ability: am ? { name: am[1].trim(), text: am[2].trim() } : { name: 'Passive', text: m[1].trim() },
    }
  }
  if ((m = line.match(/^spells?:\s*(.*)$/i))) return { pool: 'spells', group: 'Spell', rest: m[1] }
  if ((m = line.match(/^units:\s*(.*)$/i))) return { pool: 'units', group: 'Military', rest: m[1] }
  return null
}

// "+35% Offensive TPA/WPA" or "-35% WPA and TPA" -> two items
function splitAcronyms(q: string): string[] {
  const m = q.match(/^([+-]?\d+(?:\.\d+)?%)\s+((?:[A-Za-z]+\s+)?)([A-Z]{2,4})\s*(?:\/|and)\s*([A-Z]{2,4})$/)
  if (!m) return [q]
  return [`${m[1]} ${m[2]}${m[3]}`.replace(/\s+/g, ' '), `${m[1]} ${m[2]}${m[4]}`.replace(/\s+/g, ' ')]
}

function doctrineSchedule(lines: string[]): { base: number | null; exceptions: Map<string, number> } {
  let base: number | null = null
  const exceptions = new Map<string, number>()
  for (const l of lines) {
    const b = l.match(/each additional province:\s*\+?\s*(\d+(?:\.\d+)?)\s*%/i)
    if (b) base = parseFloat(b[1])
    const e = l.match(/^(.+?)\s+war doctrines?\s+gain\s+\+?\s*(\d+(?:\.\d+)?)\s*%[^.]*each additional province/i)
    if (e) {
      e[1]
        .split(/,|\band\b/i)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((n) => exceptions.set(canonKey(n), parseFloat(e[2])))
    }
  }
  return { base, exceptions }
}

export function parseAge(input: string): ParsedAge {
  const lines = prepare(input)
  const S: State = { zone: null, cur: null, skipping: false, pool: null, group: '' }
  const drafts: Draft[] = []
  const notes: string[] = []
  const warnings: string[] = []
  const unrecognized: string[] = []
  const seen = new Set<string>()
  const dupes: string[] = []

  const reset = () => {
    S.cur = null
    S.skipping = false
    S.pool = null
    S.group = ''
  }
  const unrec = (l: string) => {
    if (unrecognized.length < 60) unrecognized.push(l)
  }

  const start = (category: Category, rawName: string, style: '116' | '117', tagline?: string) => {
    const name = cleanName(rawName)
    const key = category + ':' + canonKey(name)
    S.pool = null
    S.group = ''
    if (seen.has(key)) {
      const label = `${category} ${name}`
      if (!dupes.includes(label)) dupes.push(label)
      S.cur = null
      S.skipping = true
      return
    }
    seen.add(key)
    S.skipping = false
    const d: Draft = { category, name, tagline, style, items: [], abilities: [] }
    drafts.push(d)
    S.cur = d
    if (category === 'Dragon' || category === 'Ritual') {
      S.pool = 'traits'
      S.group = 'Effect'
    }
  }

  const addTraits = (d: Draft, text: string, commaSplit: boolean, group: string) => {
    let starting = group === 'Starting'
    for (const part of commaSplit ? splitTop(text, ',') : [text]) {
      let t = part.trim().replace(/[.;]+$/, '')
      if (!t) continue
      const sw = t.match(/^starts?\s+with\s+(.*)$/i)
      if (sw) {
        starting = true
        t = sw[1]
      }
      const g = starting ? 'Starting' : group
      for (const q of t.split(/\s+and\s+(?=[+-]\d)/i)) {
        for (const r of splitAcronyms(q.trim())) if (r) d.items.push(makeItem('traits', g, r))
      }
    }
  }

  const addDoctrine116 = (d: Draft, text: string) => {
    const body = text.replace(/^provides\s+(?:up to\s+)?/i, '')
    const re = /([+-]?\d+(?:\.\d+)?)\s*%\s+([A-Za-z' ]+?)(?=\s+and\s+[+-]?\d|\s+(?:to|for)\s+you|[.,;]|$)/g
    let m: RegExpExecArray | null
    let any = false
    while ((m = re.exec(body))) {
      any = true
      d.items.push(makeItem('doctrine', 'Doctrine', `${m[1]}% ${m[2].trim()}`))
    }
    if (!any) d.items.push(makeItem('doctrine', 'Doctrine', text))
  }

  const addUnits = (d: Draft, text: string) => {
    let hit = false
    let m: RegExpMatchArray | null
    if ((m = text.match(/offensive specialists?\s*:?\s*\(?\s*(\d+)\s*\/\s*(\d+)/i))) {
      hit = true
      d.items.push(unitItem('offspec_off', 'Off spec offense', +m[1], '', 1, m[1]))
      d.items.push(unitItem('offspec_def', 'Off spec defense', +m[2], '', 1, m[2]))
    }
    if ((m = text.match(/defensive specialists?\s*:?\s*\(?\s*(\d+)\s*\/\s*(\d+)/i))) {
      hit = true
      d.items.push(unitItem('defspec_off', 'Def spec offense', +m[1], '', 1, m[1]))
      d.items.push(unitItem('defspec_def', 'Def spec defense', +m[2], '', 1, m[2]))
      if (+m[1] > 0) warnings.push(`${d.name}: "Defensive Specialist" reads ${m[1]}/${m[2]} (has offense). That looks like an Elite line.`)
    }
    if ((m = text.match(/elite unit\s*\(\s*(\d+)\s*\/\s*(\d+)\s*,\s*([\d,]+)\s*gc\s*,\s*([\d.]+)\s*nw/i))) {
      hit = true
      d.items.push(unitItem('elite_off', 'Elite offense', +m[1], '', 1, m[1]))
      d.items.push(unitItem('elite_def', 'Elite defense', +m[2], '', 1, m[2]))
      d.items.push(unitItem('elite_cost', 'Elite cost', +m[3].replace(/,/g, ''), 'gc', -1, `${m[3]}gc`))
      d.items.push(unitItem('elite_nw', 'Elite networth', +m[4], '', 0, `${m[4]} NW`))
    } else if ((m = text.match(/^elites?\s*:?\s*(\d+)\s*\/\s*(\d+)/i))) {
      hit = true
      d.items.push(unitItem('elite_off', 'Elite offense', +m[1], '', 1, m[1]))
      d.items.push(unitItem('elite_def', 'Elite defense', +m[2], '', 1, m[2]))
    }
    if ((m = text.match(/elite cost\s*:?\s*([\d,]+)/i))) {
      hit = true
      d.items.push(unitItem('elite_cost', 'Elite cost', +m[1].replace(/,/g, ''), 'gc', -1, `${m[1]}gc`))
    }
    if ((m = text.match(/elite networth\s*:?\s*([\d.]+)/i))) {
      hit = true
      d.items.push(unitItem('elite_nw', 'Elite networth', +m[1], '', 0, `${m[1]} NW`))
    }
    if ((m = text.match(/war horse\s*\(\s*(?:(\d+)\s*\/\s*\d+|n\/a)/i))) {
      hit = true
      const v = m[1] ? +m[1] : 0
      d.items.push(unitItem('horse', 'War horse offense', v, '', 1, String(v)))
    } else if ((m = text.match(/^horses?\s*:?\s*(\d+)/i))) {
      hit = true
      d.items.push(unitItem('horse', 'War horse offense', +m[1], '', 1, m[1]))
    }
    if (!hit && !/^(soldier|mercenary|prisoner)/i.test(text)) unrec(`${d.name}: ${text}`)
  }

  const addContent = (d: Draft, line: string, pool: Pool | null, group: string) => {
    const isBullet = /^(?:[•·*]|[-–—]\s)/.test(line)
    const text = stripBullets(line)
    if (!text) return
    const inline = d.style === '116'
    switch (pool) {
      case 'traits':
        addTraits(d, text, inline, group)
        break
      case 'spells':
        for (const s of splitTop(text, ',')) {
          const n = s.trim().replace(/[.;]+$/, '')
          if (n) d.items.push(spellItem(n))
        }
        break
      case 'doctrine':
        if (inline) addDoctrine116(d, text)
        else d.items.push(makeItem('doctrine', 'Doctrine', text))
        break
      case 'ability': {
        const last = d.abilities[d.abilities.length - 1]
        const nm = isBullet ? null : text.match(/^([A-Z][A-Za-z' ]{2,40}):\s*(.*)$/)
        if (nm) d.abilities.push({ name: nm[1].trim(), text: nm[2].trim() })
        else if (last) last.text = (last.text + ' ' + text).trim()
        else d.abilities.push({ name: 'Unique ability', text })
        break
      }
      case 'units':
        addUnits(d, text)
        break
      default:
        unrec(`${d.name}: ${line}`)
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/^[.\s]+(?=[A-Za-z•])/, '')
    if (!line || /^[-–—_=*.\s]+$/.test(line)) continue

    const head = line.replace(/[:.]+$/, '').toLowerCase()
    const z = ZONES.get(head)
    if (z) {
      S.zone = z
      reset()
      continue
    }
    if (IGNORE.has(head)) {
      S.zone = null
      reset()
      continue
    }
    if (!S.zone) continue
    if (S.zone === 'General') {
      notes.push(stripBullets(line))
      continue
    }
    const zone: Category = S.zone

    // "Dragons started outside War cost 15% more..." is a rule for all dragons
    if (zone === 'Dragon' && /^dragons\s+\w/i.test(line)) {
      start('Dragon', 'All dragons', '117')
      if (S.cur) S.cur.items.push(makeItem('traits', 'Effect', stripBullets(line)))
      continue
    }

    if (zone === 'Race' || zone === 'Personality') {
      const h = line.match(/^(?![-•*·])([A-Z][A-Za-z' ]{1,28}?)\s+[—–]\s+(.+)$/)
      if (h) {
        start(zone, h[1], '117', h[2].trim())
        continue
      }
      if (zone === 'Race') {
        const r = line.match(/^([A-Z][A-Za-z' ]{1,24}?)\s+Bonuses:\s*(.*)$/)
        if (r) {
          start('Race', r[1], '116')
          S.pool = 'traits'
          S.group = 'Bonus'
          if (S.cur && r[2]) addTraits(S.cur, r[2], true, 'Bonus')
          continue
        }
      } else if (line.startsWith('•')) {
        const p = line.replace(/^•\s*/, '').match(/^(?:The\s+)?([A-Z][A-Za-z' ]{2,24}?):\s*(.*)$/)
        if (p) {
          start('Personality', p[1], '116')
          S.pool = 'traits'
          S.group = 'Bonus'
          if (S.cur) addTraits(S.cur, p[2], true, 'Bonus')
          continue
        }
      }
    } else {
      const nm = line.match(/^([A-Z][A-Za-z']+(?: [A-Z][A-Za-z']+)?)$/)
      if (nm && !isBareLabel(nm[1])) {
        start(zone, nm[1], '117')
        continue
      }
    }

    if (S.skipping) continue
    const d = S.cur
    if (!d) {
      unrec(line)
      continue
    }

    const bare = line.replace(/:$/, '')
    const bl = BARE_LABELS.find(([re]) => re.test(bare))
    if (bl) {
      S.pool = bl[1]
      S.group = bl[2]
      continue
    }

    const il = inlineLabel(line)
    if (il) {
      S.pool = il.pool
      S.group = il.group
      if (il.ability) d.abilities.push(il.ability)
      else if (il.rest) addContent(d, il.rest, il.pool, il.group)
      continue
    }

    addContent(d, line, S.pool, S.group)
  }

  // 116 states the per-province doctrine rate once, globally. Give each race its own row so it can be compared.
  const sched = doctrineSchedule(lines)
  if (sched.base !== null) {
    for (const d of drafts) {
      if (d.category !== 'Race' || d.style !== '116' || !d.items.some((i) => i.pool === 'doctrine')) continue
      const rate = sched.exceptions.get(canonKey(d.name)) ?? sched.base
      d.items.push(makeItem('doctrine', 'Doctrine', `+${rate}% per province`))
    }
  }

  if (dupes.length) warnings.push(`Repeated block ignored (kept the first): ${dupes.join(', ')}`)
  if (!drafts.length) warnings.push('No races, personalities, rituals or dragons found. Check that the section headings are present.')
  for (const d of drafts) if (!d.items.length && !d.abilities.length) warnings.push(`${d.name}: nothing parsed under this heading.`)

  const entities: Entity[] = drafts.map((d) => ({
    category: d.category,
    name: d.name,
    tagline: d.tagline,
    items: [...d.items, ...d.abilities.map((a) => abilityItem(a.name, a.text))],
  }))
  return { entities, notes, warnings, unrecognized }
}

/* ------------------------------------------------------------------ */
/* diff                                                                */
/* ------------------------------------------------------------------ */

interface Pair {
  o?: Item
  n?: Item
  fuzzy: boolean
}

function similarity(a: Item, b: Item): number {
  const A = new Set(a.tokens)
  const B = new Set(b.tokens)
  if (!A.size || !B.size) return 0
  let inter = 0
  A.forEach((x) => {
    if (B.has(x)) inter++
  })
  const small = Math.min(A.size, B.size)
  const large = Math.max(A.size, B.size)
  if (inter === small && large <= 3) return Math.max(0.6, inter / (A.size + B.size - inter))
  return inter / (A.size + B.size - inter)
}

function pairItems(oldItems: Item[], newItems: Item[]): Pair[] {
  const pairs: Pair[] = []
  const usedO = new Set<number>()
  const usedN = new Set<number>()

  newItems.forEach((n, ni) => {
    const oi = oldItems.findIndex((o, i) => !usedO.has(i) && o.key === n.key)
    if (oi >= 0) {
      usedO.add(oi)
      usedN.add(ni)
      pairs.push({ o: oldItems[oi], n, fuzzy: false })
    }
  })

  const cands: Array<{ oi: number; ni: number; s: number }> = []
  oldItems.forEach((o, oi) => {
    if (usedO.has(oi) || (o.pool !== 'traits' && o.pool !== 'doctrine')) return
    newItems.forEach((n, ni) => {
      if (usedN.has(ni) || n.pool !== o.pool) return
      const s = similarity(o, n)
      if (s >= 0.6) cands.push({ oi, ni, s })
    })
  })
  cands.sort((a, b) => b.s - a.s)
  for (const c of cands) {
    if (usedO.has(c.oi) || usedN.has(c.ni)) continue
    usedO.add(c.oi)
    usedN.add(c.ni)
    pairs.push({ o: oldItems[c.oi], n: newItems[c.ni], fuzzy: true })
  }

  // a single leftover ability on each side is the same slot with a different ability
  const leftO = oldItems.map((o, i) => ({ o, i })).filter((x) => !usedO.has(x.i) && x.o.pool === 'ability')
  const leftN = newItems.map((n, i) => ({ n, i })).filter((x) => !usedN.has(x.i) && x.n.pool === 'ability')
  for (let k = 0; k < Math.min(leftO.length, leftN.length); k++) {
    usedO.add(leftO[k].i)
    usedN.add(leftN[k].i)
    pairs.push({ o: leftO[k].o, n: leftN[k].n, fuzzy: true })
  }

  newItems.forEach((n, ni) => {
    if (!usedN.has(ni)) pairs.push({ n, fuzzy: false })
  })
  oldItems.forEach((o, oi) => {
    if (!usedO.has(oi)) pairs.push({ o, fuzzy: false })
  })
  return pairs
}

function fmtNum(v: number): string {
  return String(Math.round(v * 100) / 100)
}

function normText(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9%.]+/g, ' ').trim()
}

function rowFor(p: Pair): DiffRow & { pool: Pool } {
  const ref = (p.n ?? p.o) as Item
  const group = p.o && p.n && p.o.group !== p.n.group ? `${p.o.group} → ${p.n.group}` : ref.group
  const base = { pool: ref.pool, group, label: ref.label }
  if (!p.o) return { ...base, newText: p.n?.display, status: 'added' }
  if (!p.n) return { ...base, oldText: p.o.display, status: 'removed' }

  const o = p.o
  const n = p.n
  let status: Status = 'unchanged'
  let delta: string | undefined
  let note: string | undefined

  if (o.value !== undefined && n.value !== undefined && o.unit === n.unit) {
    const d = n.value - o.value
    const pol = n.polarity || o.polarity
    if (d === 0) {
      if (p.fuzzy && o.key !== n.key) {
        status = 'changed'
        note = 'Same number, different wording'
      }
    } else {
      status = pol === 0 ? 'changed' : d * pol > 0 ? 'buff' : 'nerf'
      delta = `${d > 0 ? '+' : ''}${fmtNum(d)}${n.unit ?? ''}`
    }
  } else if (o.pool === 'ability') {
    if (p.fuzzy) note = 'Different ability in this slot'
    status = p.fuzzy || normText(o.body) !== normText(n.body) ? 'changed' : 'unchanged'
  } else if (o.value !== undefined && n.value !== undefined) {
    status = 'changed'
    note = 'Units differ'
  } else {
    status = o.display === n.display ? 'unchanged' : 'changed'
  }
  return { ...base, oldText: o.display, newText: n.display, status, delta, note }
}

function abilityOwners(ents: Entity[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const e of ents)
    for (const i of e.items)
      if (i.pool === 'ability') {
        const arr = m.get(i.key) ?? []
        arr.push(e.name)
        m.set(i.key, arr)
      }
  return m
}

export function compareAges(oldText: string, newText: string): Comparison {
  const oldParsed = parseAge(oldText)
  const newParsed = parseAge(newText)
  const ek = (e: Entity) => e.category + ':' + canonKey(e.name)
  const oMap = new Map(oldParsed.entities.map((e) => [ek(e), e] as const))
  const nMap = new Map(newParsed.entities.map((e) => [ek(e), e] as const))
  const keys = [...nMap.keys(), ...[...oMap.keys()].filter((k) => !nMap.has(k))]
  const oOwners = abilityOwners(oldParsed.entities)
  const nOwners = abilityOwners(newParsed.entities)

  const out: EntityDiff[] = []
  for (const k of keys) {
    const oe = oMap.get(k)
    const ne = nMap.get(k)
    const ref = (ne ?? oe) as Entity
    const pairs = pairItems(oe?.items ?? [], ne?.items ?? [])
    const rows = pairs
      .map((p, idx) => {
        const r = rowFor(p)
        if ((p.n ?? p.o)?.pool === 'ability') {
          const parts: string[] = r.note ? [r.note] : []
          if (p.n) {
            const was = (oOwners.get(p.n.key) ?? []).filter((x) => x !== ref.name)
            if (was.length) parts.push(`${p.n.label} was on ${was.join(', ')} in the old age`)
          }
          if (p.o) {
            const now = (nOwners.get(p.o.key) ?? []).filter((x) => x !== ref.name)
            if (now.length) parts.push(`${p.o.label} is now on ${now.join(', ')}`)
          }
          if (parts.length) r.note = parts.join('. ')
        }
        return { r, idx }
      })
      .sort((a, b) => POOL_RANK[a.r.pool] - POOL_RANK[b.r.pool] || a.idx - b.idx)
      .map(({ r }) => {
        const { pool: _pool, ...row } = r
        void _pool
        return row as DiffRow
      })

    const counts = emptyCounts()
    for (const r of rows) counts[r.status]++
    const status: Status = !oe ? 'added' : !ne ? 'removed' : rows.some((r) => r.status !== 'unchanged') ? 'changed' : 'unchanged'
    out.push({ category: ref.category, name: ref.name, tagline: ne?.tagline ?? oe?.tagline, status, rows, counts })
  }
  out.sort((a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category])

  const totals = emptyCounts()
  for (const e of out) for (const s of STATUSES) totals[s] += e.counts[s]
  return { entities: out, totals, oldParsed, newParsed }
}
