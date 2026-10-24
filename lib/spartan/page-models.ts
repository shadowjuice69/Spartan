// Turns the text Spartan captures from Utopia pages into structured data for the dashboards.
// Pure functions: no React, no database. Everything here works on raw_text / grid JSON.

export type AnyRec = Record<string, any>

import { racePersonalityFromCells } from './intel-site'

export const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

export function toNum(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const m = String(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

// Intel-site grid values like "83.5k", "1.217m", "4,895", "117%"
export function gridNum(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const s = String(value).trim().replace(/,/g, '')
  const m = s.match(/^([-+]?\d*\.?\d+)\s*([kmb])?/i)
  if (!m) return null
  let n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const suffix = (m[2] || '').toLowerCase()
  if (suffix === 'k') n *= 1e3
  else if (suffix === 'm') n *= 1e6
  else if (suffix === 'b') n *= 1e9
  return n
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function firstNum(text: string, re: RegExp): number | null {
  const m = text.match(re)
  return m ? toNum(m[1]) : null
}

// The part of a Utopia page that matters: drops the chat/nav header and the footer.
function pageBody(text: string, startMarkers: string[] = ['Mystics History ']) {
  let t = clean(text)
  for (const marker of startMarkers) {
    const i = t.indexOf(marker)
    if (i >= 0) { t = t.slice(i + marker.length); break }
  }
  const c = t.indexOf(' Copyright ')
  if (c >= 0) t = t.slice(0, c)
  return t
}

/* ---------------------------------------------------------------- buildings */

export const BUILDINGS = [
  'Barren Land', 'Homes', 'Farms', 'Mills', 'Banks', 'Training Grounds', 'Armouries',
  'Military Barracks', 'Forts', 'Castles', 'Hospitals', 'Guilds', 'Towers', "Thieves' Dens",
  'Watch Towers', 'Universities', 'Libraries', 'Stables', 'Dungeons',
]

export const BUILDING_GROUPS: Record<string, string> = {
  'Barren Land': 'Land', Homes: 'Population', Farms: 'Economy', Mills: 'Economy', Banks: 'Economy',
  Towers: 'Arcane', Guilds: 'Arcane', 'Training Grounds': 'Military', Armouries: 'Military',
  'Military Barracks': 'Military', Forts: 'Military', Castles: 'Military', Hospitals: 'Military',
  Stables: 'Military', Dungeons: 'Military', "Thieves' Dens": 'Covert', 'Watch Towers': 'Covert',
  Universities: 'Science', Libraries: 'Science',
}

export function parseBuildings(text: string) {
  const b = pageBody(text)
  const stats = {
    workers: firstNum(b, /Available Workers ([\d,]+)/),
    efficiency: firstNum(b, /Building Efficiency ([\d.]+)%/),
    jobs: firstNum(b, /Available Jobs ([\d,]+)/),
    workersNeeded: firstNum(b, /Workers Needed for Max\. Efficiency ([\d,]+)/),
  }
  const start = b.indexOf('Building type Quantity')
  const end = b.indexOf('Exploration/Construction Schedules')
  let table = start >= 0 ? b.slice(start) : b
  if (start >= 0 && end > start) table = b.slice(start, end)
  table = table.replace(/^Building type Quantity % of Total Current Effects \(effect of next 1%\)\s*/, '')
  const names = [...BUILDINGS].sort((a, z) => z.length - a.length).map(esc).join('|')
  const re = new RegExp(`(${names}) (\\d[\\d,]*) ([\\d.]+)%`, 'g')
  const hits = [...table.matchAll(re)]
  const rows = hits.map((m, i) => {
    const from = (m.index ?? 0) + m[0].length
    const to = hits[i + 1]?.index ?? table.length
    return {
      name: m[1],
      qty: toNum(m[2]) ?? 0,
      pct: toNum(m[3]) ?? 0,
      group: BUILDING_GROUPS[m[1]] || 'Other',
      effects: clean(table.slice(from, to)),
    }
  })
  const totalAcres = rows.reduce((sum, r) => sum + r.qty, 0)
  return { stats, rows, totalAcres }
}

/* ------------------------------------------------------------------ science */

const SCIENCE_NAMES: Record<string, string[]> = {
  Economy: ['Alchemy', 'Tools', 'Housing', 'Production', 'Bookkeeping', 'Artisan'],
  Military: ['Strategy', 'Siege', 'Tactics', 'Valor', 'Heroism', 'Resilience'],
  'Arcane Arts': ['Crime', 'Channeling', 'Shielding', 'Cunning', 'Sorcery', 'Finesse'],
}

export function parseScience(text: string) {
  const b = pageBody(text)
  const marker = 'Science Type Number of books Effect'
  const start = b.indexOf(marker)
  let t = start >= 0 ? b.slice(start + marker.length) : b
  const end = t.indexOf('Science Book Recovery Schedule')
  if (end >= 0) t = t.slice(0, end)
  t = clean(t)
  const catRe = /(Economy|Military|Arcane Arts) - (\d+) scientists? - ([\d,]+) books available/g
  const cats = [...t.matchAll(catRe)]
  const categories = cats.map((c, i) => {
    const from = (c.index ?? 0) + c[0].length
    const to = cats[i + 1]?.index ?? t.length
    const seg = t.slice(from, to)
    const names = (SCIENCE_NAMES[c[1]] || []).map(esc).join('|')
    const itemRe = new RegExp(`(${names}) ([\\d,]+) ([+-]?[\\d.]+)%`, 'g')
    const hits = names ? [...seg.matchAll(itemRe)] : []
    const items = hits.map((h, j) => {
      const s = (h.index ?? 0) + h[0].length
      const e = hits[j + 1]?.index ?? seg.length
      return { name: h[1], books: toNum(h[2]) ?? 0, effect: toNum(h[3]) ?? 0, description: clean(seg.slice(s, e)) }
    })
    return {
      name: c[1],
      scientists: toNum(c[2]) ?? 0,
      booksAvailable: toNum(c[3]) ?? 0,
      totalBooks: items.reduce((sum, it) => sum + it.books, 0),
      items,
    }
  })
  return { categories }
}

/* ----------------------------------------------------------------- military */

export function parseMilitary(text: string) {
  const b = pageBody(text)
  const generals = firstNum(b, /we have (\d+) generals?/i)
  const wageRate = firstNum(b, /wage rate is ([\d.]+)% of normal/i)
  const efficiency = firstNum(b, /functioning at ([\d.]+)% efficiency/i)
  const nonPeasantPct = firstNum(b, /approximately ([\d.]+)% of our maximum population/i)
  const offEff = firstNum(b, /Offensive Military Effectiveness ([\d.]+)%/)
  const offPoints = firstNum(b, /Net Offensive Points at Home ([\d,]+)/)
  const defEff = firstNum(b, /Defensive Military Effectiveness ([\d.]+)%/)
  const defPoints = firstNum(b, /Net Defensive Points at Home ([\d,]+)/)

  const aStart = b.indexOf('Army Availability')
  const aEnd = b.indexOf('Military Training Estimates')
  let seg = aStart >= 0 ? b.slice(aStart, aEnd > aStart ? aEnd : undefined) : ''
  const gi = seg.indexOf(' Generals ')
  seg = gi >= 0 ? seg.slice(gi + 1) : ''
  seg = seg.replace(/\s*Captured Land.*$/, '')
  const unitRe = /([A-Z][A-Za-z']*(?: [A-Z][A-Za-z']*)*) ((?:[\d,]+)(?: [\d,]+)*)(?= [A-Z]|$)/g
  const units = [...seg.matchAll(unitRe)].map(m => {
    const counts = m[2].split(' ').map(v => toNum(v) ?? 0)
    return { name: m[1], home: counts[0] ?? 0, away: counts.slice(1).reduce((s, v) => s + v, 0) }
  })
  const generalsRow = units.find(u => u.name === 'Generals')
  const horses = units.find(u => /horse/i.test(u.name))
  const troops = units.filter(u => u !== generalsRow && u !== horses)
  const roles = ['Soldiers', 'Offensive specs', 'Defensive specs', 'Elites']
  const army = troops.map((u, i) => ({ ...u, role: roles[i] || 'Troops' }))
  return {
    generals: generals ?? generalsRow?.home ?? null,
    wageRate, efficiency, nonPeasantPct, offEff, offPoints, defEff, defPoints,
    army,
    horses: horses ? horses.home + horses.away : null,
  }
}

/* -------------------------------------------------------------------- state */

const TREND_LABELS = ['Our Income', 'Military Wages', 'Draft Costs', 'Net Change', 'Peasants', 'Food Grown', 'Food Needed', 'Food Decayed', 'Runes Produced', 'Runes Decayed']

export function parseState(text: string) {
  const b = pageBody(text, ['Affairs of the State '])
  const get = (re: RegExp) => firstNum(b, re)
  const land = b.match(/Land Rank (\d+) of (\d+)/)
  const nw = b.match(/Networth Rank (\d+) of (\d+)/)
  const visits = b.match(/sat on our throne for (\d+) of (\d+) days/)
  const protection = b.match(/Multi-Attack Protection (.*?) Recent Trends/)
  const tStart = b.indexOf('Recent Trends')
  const trendText = tStart >= 0 ? b.slice(tStart) : ''
  const trendRe = new RegExp(`(${TREND_LABELS.map(esc).join('|')}) (-?[\\d,]+)\\s?(?:gc|peasants|bushels|bush|runes)\\S* (-?[\\d,]+)\\s?(?:gc|peasants|bushels|runes)\\S* (-?[\\d,]+)\\s?(?:gc|peasants|bushels|runes)`, 'g')
  let netIndex = 0
  const netNames = ['Net Gold', 'Net Food', 'Net Runes']
  const trends = [...trendText.matchAll(trendRe)].map(m => {
    const label = m[1] === 'Net Change' ? netNames[Math.min(netIndex++, 2)] : m[1]
    return { label, yesterday: toNum(m[2]) ?? 0, month: toNum(m[3]) ?? 0, lastMonth: toNum(m[4]) ?? 0 }
  })
  return {
    throneVisits: visits ? { days: toNum(visits[1]), of: toNum(visits[2]) } : null,
    networth: get(/Current Networth ([\d,]+)/),
    land: get(/Current Land ([\d,]+) acres/),
    honor: get(/Current Honor ([\d,]+)/),
    landRank: land ? { rank: toNum(land[1]), of: toNum(land[2]) } : null,
    networthRank: nw ? { rank: toNum(nw[1]), of: toNum(nw[2]) } : null,
    protection: protection ? clean(protection[1]) : null,
    population: {
      peasants: get(/Our Population Our Economy Current Highlights Peasants ([\d,]+)/),
      army: get(/ Army ([\d,]+) /),
      thieves: get(/ Thieves ([\d,]+) /),
      wizards: get(/ Wizards ([\d,]+) /),
      total: get(/ Total ([\d,]+) /),
      max: get(/Max Population ([\d,]+)/),
    },
    economy: {
      unemployed: get(/Unemployed Peasants ([\d,]+)/),
      unfilledJobs: get(/Unfilled Jobs ([\d,]+)/),
      employment: get(/Employment ([\d.]+)%/),
      dailyIncome: get(/Daily Income ([\d,]+)/),
      dailyWages: get(/Daily Wages ([\d,]+)/),
    },
    trends,
  }
}

/* ------------------------------------------------------------------- throne */

export function parseThrone(text: string) {
  const t = pageBody(text, ['The Province of '])
  const whole = clean(text)
  const head = whole.match(/The Province of (.+?) \((\d+:\d+)\) (.+?) \(next tick: (\d+) minutes?\)/)
  const ritual = whole.match(/covered by the (.+?) ritual with ([\d.]+)% effectiveness left! The ritual will be lifted in (\d+) days?/)
  const spellsAt = whole.indexOf('Duration:')
  const spells: Array<{ name: string; days: number }> = []
  if (spellsAt >= 0) {
    const seg = whole.slice(spellsAt, whole.indexOf('Recent News') > spellsAt ? whole.indexOf('Recent News') : undefined)
    for (const m of seg.matchAll(/([A-Za-z' ]+?) \( ?(\d+) days? ?\)/g)) spells.push({ name: clean(m[1]), days: toNum(m[2]) ?? 0 })
  }
  const per = (re: RegExp) => firstNum(t, re)
  return {
    province: head ? clean(head[1]) : null,
    kingdom: head ? head[2] : null,
    date: head ? clean(head[3]) : null,
    nextTickMinutes: head ? toNum(head[4]) : null,
    race: (t.match(/Race (.+?) Soldiers/) || [])[1] ? clean((t.match(/Race (.+?) Soldiers/) as RegExpMatchArray)[1]) : null,
    ruler: (t.match(/Ruler (.+?) (?:Strongarms|[A-Z][a-z]+s) /) || [])[1] || null,
    buildingEfficiency: per(/Building Eff\. ([\d.]+)%/),
    acres: per(/Land ([\d,]+)/),
    networth: per(/Networth ([\d,]+)/),
    gold: per(/Money (-?[\d,]+)/),
    food: per(/Food (-?[\d,]+)/),
    runes: per(/Runes (-?[\d,]+)/),
    peons: per(/Peasants ([\d,]+)/),
    soldiers: per(/Soldiers ([\d,]+)/),
    offSpecs: per(/Offensive Specialists?\s*:?\s*([\d,]+)/i),
    defSpecs: per(/Defensive Specialists?\s*:?\s*([\d,]+)/i),
    elites: per(/Elites?\s*:?\s*([\d,]+)/i),
    thieves: per(/Thieves ([\d,]+)/),
    wizards: per(/Wizards ([\d,]+)/),
    war_horses: per(/War Horses ([\d,]+)/),
    prisoners: per(/Prisoners ([\d,]+)/),
    offense: per(/Off\. Points ([\d,]+)/),
    defense: per(/Def\. Points ([\d,]+)/),
    unitCounts: (() => {
      const excluded = new Set(['race','ruler','land','peasants','building eff.','money','food','runes','trade balance','networth','off. points','def. points'])
      const counts: Record<string, number> = {}
      for (const line of String(text || '').split(/\r?\n/)) {
        const cells = line.split(/\t+/).map(clean)
        for (let i = 0; i + 1 < cells.length; i += 2) {
          const name = cells[i].replace(/:$/, '').trim()
          if (!name || excluded.has(name.toLowerCase())) continue
          const value = toNum(cells[i + 1])
          if (value !== null && /[A-Za-z]/.test(name)) counts[name] = value
        }
      }
      return counts
    })(),
    tradeBalance: per(/Trade Balance (-?[\d,]+)/),
    ratios: {
      offSpa: per(/([\d.]+)\s*ospa\b/i), defSpa: per(/([\d.]+)\s*dspa\b/i), peasantsPerAcre: per(/([\d.]+)\s*ppa\b/i),
      elitesPerAcre: per(/([\d.]+)\s*epa\b/i), thievesPerAcre: per(/([\d.]+)\s*tpa\b/i), wizardsPerAcre: per(/([\d.]+)\s*wpa\b/i),
      goldPerAcreK: per(/([\d.]+)\s*k\s*gcpa\b/i),
    },
    thievesReady: per(/Thieves [\d,]+ \((\d+)%\)/),
    wizardsReady: per(/Wizards [\d,]+ \((\d+)%\)/),
    ritual: ritual ? { name: clean(ritual[1]), effectiveness: toNum(ritual[2]), days: toNum(ritual[3]) } : null,
    spells,
  }
}

/* ---------------------------------------------------------- kingdom details */

const RACES = ['Dark Elf', 'Avian', 'Dryad', 'Dwarf', 'Elf', 'Faery', 'Gnome', 'Halfling', 'Human', 'Orc', 'Undead']

export function parseKingdomDetails(text: string) {
  const b = pageBody(text, ['Kingdom Details Espionage '])
  const name = b.match(/kingdom of (.+?) \((\d+:\d+)\)/)
  const nwTotal = b.match(/Total Networth ([\d,]+)gc \(avg: ([\d,]+)gc\)/)
  const landTotal = b.match(/Total Land ([\d,]+) acres \(avg: ([\d,]+) acres\)/)
  const nwRank = b.match(/Net Worth Rank (\d+) of (\d+)/)
  const landRank = b.match(/Land Rank (\d+) of (\d+)/)
  const honorTotal = b.match(/Total Honor ([\d,]+) Honor Rank (\d+) of (\d+)/)
  const wars = b.match(/Wars Won \/ War Score (\d+) \/ ([\d.]+)/)
  const wStart = b.indexOf('War History')
  const wEnd = b.search(/ Open Relations| Relations /)
  const warSeg = wStart >= 0 ? b.slice(wStart + 'War History'.length, wEnd > wStart ? wEnd : undefined) : ''
  const warHistory = [...warSeg.matchAll(/([^()]+?) \((\d+:\d+)\) (Win|Loss|Lost|Draw|Ongoing)/g)].map(m => ({ name: clean(m[1]), kingdom: m[2], result: m[3] }))
  const theirs = b.match(/Their Attitude To Us (\w+) \(([\d.]+) points\)/)
  const ours = b.match(/Our Attitude To Them (\w+) \(([\d.]+) points\)/)

  const pStart = b.indexOf('Nobility Gains')
  const pEnd = b.indexOf('War Doctrines War Doctrines provide')
  const pSeg = pStart >= 0 ? b.slice(pStart + 'Nobility Gains'.length, pEnd > pStart ? pEnd : undefined) : ''
  const raceAlt = RACES.map(esc).join('|')
  const rowRe = new RegExp(`(\\d+) (.+?) (${raceAlt}) ([\\d,]+)a ([\\d,]+)gc ([\\d,]+)gc (.+?) (\\d+)(?= \\d+ [^ ]|$)`, 'g')
  const provinces = [...pSeg.matchAll(rowRe)].map(m => {
    const rawName = m[2]
    return {
      slot: toNum(m[1]) ?? 0,
      name: clean(rawName.replace(/\((?:M|S)\)|[*^]/g, '')),
      monarch: /\(M\)/.test(rawName), steward: /\(S\)/.test(rawName),
      online: /\*/.test(rawName), protection: /\^/.test(rawName),
      race: m[3], acres: toNum(m[4]) ?? 0, networth: toNum(m[5]) ?? 0, nwpa: toNum(m[6]) ?? 0,
      nobility: clean(m[7]), gains: toNum(m[8]) ?? 0,
    }
  })

  const dStart = b.indexOf('Race Provinces Effects')
  const dSeg = dStart >= 0 ? b.slice(dStart + 'Race Provinces Effects'.length) : ''
  const doctrineRe = new RegExp(`(${raceAlt}) (\\d+) (.*?)(?= (?:${raceAlt}) \\d+ |$)`, 'g')
  const doctrines = [...dSeg.matchAll(doctrineRe)].map(m => ({ race: m[1], provinces: toNum(m[2]) ?? 0, effects: clean(m[3]) }))

  return {
    name: name ? clean(name[1]) : null,
    code: name ? name[2] : null,
    totalProvinces: firstNum(b, /Total Provinces (\d+)/),
    stance: (b.match(/Stance (\w+)/) || [])[1] || null,
    networth: nwTotal ? { total: toNum(nwTotal[1]), avg: toNum(nwTotal[2]) } : null,
    networthRank: nwRank ? { rank: toNum(nwRank[1]), of: toNum(nwRank[2]) } : null,
    land: landTotal ? { total: toNum(landTotal[1]), avg: toNum(landTotal[2]) } : null,
    landRank: landRank ? { rank: toNum(landRank[1]), of: toNum(landRank[2]) } : null,
    honor: honorTotal ? { total: toNum(honorTotal[1]), rank: toNum(honorTotal[2]), of: toNum(honorTotal[3]) } : null,
    wars: wars ? { won: toNum(wars[1]), score: toNum(wars[2]) } : null,
    warHistory,
    attitude: { theirs: theirs ? { label: theirs[1], points: toNum(theirs[2]) } : null, ours: ours ? { label: ours[1], points: toNum(ours[2]) } : null },
    provinces,
    doctrines,
  }
}

/* --------------------------------------------------------------- intel grid */

const labelsOf = (v: any): string[] => (v && typeof v === 'object' && Array.isArray(v.labels) ? v.labels.map(String) : [])
const textOf = (v: any): string => (v && typeof v === 'object' ? clean(v.text) : clean(v))

export function parseGridRows(grid: AnyRec | null | undefined) {
  const rows = Array.isArray(grid?.rows) ? grid!.rows : []
  return rows
    .map((row: AnyRec) => {
      const c: AnyRec = row?.cells || row || {}
      const identity = racePersonalityFromCells(c)
      return {
        slot: toNum(c.slot),
        name: clean(c.name),
        location: clean(c.location),
        ruler: clean(c.ruler),
        race: identity.race,
        personality: identity.personality,
        combo: clean(c.combo),
        honor: clean(c.honor),
        group: clean(c.group),
        note: clean(c.note),
        acres: gridNum(c.land),
        networth: gridNum(c.nw),
        nwpa: gridNum(c.nwpa),
        popPct: gridNum(c.ovP),
        off: gridNum(c.off),
        def: gridNum(c.def),
        defHome: gridNum(c.defHome),
        peons: gridNum(c.peons),
        tpa: gridNum(c.tpa), wpa: gridNum(c.wpa),
        offTpa: gridNum(c.modOffTpa), defTpa: gridNum(c.modDefTpa),
        offWpa: gridNum(c.modOffWpa), defWpa: gridNum(c.modDefWpa),
        be: gridNum(c.be),
        map: clean(c.map),
        goodSpells: labelsOf(c.goodSpells).concat(typeof c.goodSpells === 'string' && c.goodSpells ? [clean(c.goodSpells)] : []),
        badSpells: labelsOf(c.badSpells).concat(typeof c.badSpells === 'string' && c.badSpells ? [clean(c.badSpells)] : []),
        requiredOps: labelsOf(c.requiredOps),
        intel: labelsOf(c.intelAge),
        intelAge: textOf(c.intelAge).split('|')[0]?.trim() || '',
      }
    })
    .filter((r: AnyRec) => r.name)
}

export type GridRow = ReturnType<typeof parseGridRows>[number]

export function pathOf(url: unknown) {
  return String(url || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/\d+\/\d+$/, '')
}
