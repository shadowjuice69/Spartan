// Helpers for the kingdom intel site grids (rows scraped as cells) and its Stats page text.

export type Cells = Record<string, any>
export type GridRow = { id?: string | number; cells?: Cells }
export type GridCapture = { kd: string; at: string; url: string; rows: GridRow[] }

export function val(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/,/g, '')
  if (!s || s === '-' || s === '—') return null
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([kKmMbB]?)%?$/)
  if (!m) return null
  const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'b']
  return Number(m[1]) * mult
}

export function ageHours(s: unknown): number | null {
  const m = String(s ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([mhd])$/i)
  if (!m) return null
  return Number(m[1]) * ({ m: 1 / 60, h: 1, d: 24 }[m[2].toLowerCase() as 'm' | 'h' | 'd'])
}

export type Ages = { SOT: number | null; SOM: number | null; Survey: number | null; SOS: number | null }
function parseAges(cell: any): Ages {
  const out: Ages = { SOT: null, SOM: null, Survey: null, SOS: null }
  const labels: string[] = Array.isArray(cell?.labels) ? cell.labels : []
  const parts = String(cell?.text ?? '').split(/[\s|]+/).filter(Boolean)
  labels.forEach((l, i) => { if (l in out) (out as any)[l] = ageHours(parts[i]) })
  return out
}

export type Prov = {
  key: string; kd: string; slot: string; name: string; ruler: string; race: string; personality: string; combo: string
  honor: string; group: string
  acres: number | null; nw: number | null; nwpa: number | null; off: number | null; def: number | null; defHome: number | null
  peons: number | null; tpa: number | null; wpa: number | null; be: number | null; overpop: number | null
  ages: Ages; capturedAt: string; cells: Cells
}

const text = (v: unknown) => String(v ?? '').trim()

// intel.utopia.site's kingdom grid stores race/personality together in combo
// (for example "Av/Cl") rather than as separate cell fields. Decode it once
// for every page model that consumes this grid.
const RACE_CODES: Record<string, string> = {
  av: 'Avian', de: 'Dark Elf', da: 'Dark Elf', dr: 'Dryad', dw: 'Dwarf',
  el: 'Elf', fa: 'Faery', gn: 'Gnome', ha: 'Halfling', hu: 'Human',
  or: 'Orc', un: 'Undead',
}
const PERSONALITY_CODES: Record<string, string> = {
  ar: 'Artisan', cl: 'Cleric', ge: 'General', he: 'Heretic', my: 'Mystic',
  ne: 'Necromancer', ro: 'Rogue', sa: 'Sage', ta: 'Tactician',
  wh: 'War Hero', wa: 'Warrior',
}
function decodeName(value: unknown, codes: Record<string, string>): string {
  const raw = text(value)
  if (!raw) return ''
  const decoded = codes[raw.toLowerCase()]
  return decoded || raw
}
export function racePersonalityFromCells(cells: Cells): { race: string; personality: string } {
  const [raceCode = '', personalityCode = ''] = text(cells.combo).split('/').map(part => part.trim())
  return {
    race: decodeName(cells.race, RACE_CODES) || decodeName(raceCode, RACE_CODES),
    personality: decodeName(cells.personality, PERSONALITY_CODES) || decodeName(personalityCode, PERSONALITY_CODES),
  }
}

export const isArmyRow = (r: GridRow) => /_/.test(String(r.id ?? r.cells?.id ?? ''))

export function mergeGrids(captures: GridCapture[]): Record<string, Prov[]> {
  const byKd: Record<string, Map<string, { cells: Cells; at: string }>> = {}
  for (const cap of [...captures].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const map = (byKd[cap.kd] ||= new Map())
    for (const row of cap.rows) {
      if (isArmyRow(row)) continue
      const c = row.cells || {}
      const slot = text(c.slot || row.id)
      if (!slot) continue
      const cur = map.get(slot) || { cells: {}, at: cap.at }
      // Fill decoded race/personality only when an explicit value was not captured.
      const decoded = racePersonalityFromCells(c)
      const cells = { ...c, race: text(c.race) || decoded.race, personality: text(c.personality) || decoded.personality }
      for (const [k, v] of Object.entries(cells)) {
        const empty = v === '' || v === null || v === undefined || (typeof v === 'object' && !text((v as any).text))
        if (!empty && !(k in cur.cells)) cur.cells[k] = v
      }
      map.set(slot, cur)
    }
  }
  const out: Record<string, Prov[]> = {}
  for (const [kd, map] of Object.entries(byKd)) {
    out[kd] = [...map.entries()].map(([slot, { cells: c, at }]) => ({
      key: kd + ':' + slot, kd, slot, name: text(c.name), ruler: text(c.ruler), race: text(c.race), personality: text(c.personality),
      combo: text(c.combo), honor: text(c.honor), group: text(c.group),
      acres: val(c.acres ?? c.land), nw: val(c.nw), nwpa: val(c.nwpa), off: val(c.modOff ?? c.off), def: val(c.modDef ?? c.def), defHome: val(c.defHome),
      peons: val(c.peons), tpa: val(c.tpa), wpa: val(c.wpa), be: val(c.be), overpop: val(c.ovP),
      ages: parseAges(c.intelAge), capturedAt: at, cells: c,
    })).sort((a, b) => Number(a.slot) - Number(b.slot))
  }
  return out
}

export type Army = { id: string; name: string; acres: number | null; gens: number | null; off: number | null; secondsRemaining: number | null; capturedAt: string }
export function armiesFrom(captures: GridCapture[]): Army[] {
  const seen = new Map<string, Army>()
  for (const cap of [...captures].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    for (const row of cap.rows) {
      if (!isArmyRow(row)) continue
      const c = row.cells || {}
      const id = String(row.id ?? c.id)
      if (seen.has(id)) continue
      seen.set(id, { id, name: text(c.name), acres: val(c.acres), gens: val(c.generals ?? c.gen), off: val(c.modOff ?? c.rawOff), secondsRemaining: val(c.secondsRemaining), capturedAt: cap.at })
    }
  }
  return [...seen.values()]
}

export type KdStats = { name: string; kd: string; metrics: Record<string, { total: number | null; avg: number | null; perAcre: number | null }>; be: number | null; ome: number | null; dme: number | null }

export function parseStats(raw: string | null | undefined): { our: KdStats | null; enemy: KdStats | null } {
  const flat = String(raw || '').replace(/\s+/g, ' ')
  const section = (label: 'Our KD' | 'Enemy KD'): KdStats | null => {
    const start = flat.indexOf(label + ' - ')
    if (start < 0) return null
    const rest = flat.slice(start + label.length + 3)
    const end = Math.min(...['Our KD - ', 'Enemy KD - ', 'Networth and Land'].map((s) => { const i = rest.indexOf(s); return i < 0 ? Infinity : i }))
    const body = rest.slice(0, end === Infinity ? undefined : end)
    const head = body.match(/^(.+?),\s*(\d+:\d+)/)
    const metrics: KdStats['metrics'] = {}
    for (const m of body.matchAll(/\b(Land|NW|Off|Def|Peons|Units|Solds|GCs|Runes|Food|TPA) Tot: ([\d,.]+)(?: Avg: ([\d,.]+))?(?: p\/a: ([\d,.]+))?/g)) {
      metrics[m[1]] = { total: val(m[2]), avg: m[3] ? val(m[3]) : null, perAcre: m[4] ? val(m[4]) : null }
    }
    const eff = (k: string) => { const m = body.match(new RegExp(k + ': ([\\d.]+)%')); return m ? Number(m[1]) : null }
    return { name: head ? head[1].trim() : label, kd: head ? head[2] : '', metrics, be: eff('BE'), ome: eff('OME'), dme: eff('DME') }
  }
  return { our: section('Our KD'), enemy: section('Enemy KD') }
}
