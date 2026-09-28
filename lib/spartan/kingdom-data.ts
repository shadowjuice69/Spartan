export type KingdomProvince = {
  slot: number
  name: string
  race: string
  land: number
  nw: number
  nwpa: number
  nobility: string
  gains: number
}

export type KingdomSnapshot = {
  kdCode: string | null
  kingdomName: string | null
  totalProvinces: number | null
  totalNw: number | null
  totalLand: number | null
  nwRank: number | null
  landRank: number | null
  provinces: KingdomProvince[]
}

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\s*\*+$/, '').trim()
}

function num(value: unknown) {
  const s = clean(value).replace(/,/g, '')
  if (!s) return null
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([kmb])?$/i)
  if (!m) {
    const n = Number(s.replace(/[^0-9.+-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const multiplier = m[2]?.toLowerCase() === 'b' ? 1e9 : m[2]?.toLowerCase() === 'm' ? 1e6 : m[2]?.toLowerCase() === 'k' ? 1e3 : 1
  return n * multiplier
}

function coordinate(value: unknown) {
  return clean(value).match(/\b(\d{1,3}:\d{1,3})\b/)?.[1] ?? null
}

function headerIndex(headers: string[], names: string[]) {
  const normalized = headers.map((h) => clean(h).toLowerCase().replace(/[^a-z0-9]/g, ''))
  for (const name of names) {
    const i = normalized.indexOf(name.replace(/[^a-z0-9]/g, '').toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

function addMappedRow(rows: KingdomProvince[], cells: unknown[], indexes: Record<string, number>) {
  const get = (key: string) => indexes[key] >= 0 ? cells[indexes[key]] : null
  const slot = num(get('slot'))
  const name = clean(get('name'))
  const race = clean(get('race'))
  const land = num(get('land'))
  const nw = num(get('nw'))
  const nwpa = num(get('nwpa'))
  const nobility = clean(get('nobility')) || 'Unknown'
  const gains = num(get('gains')) ?? 0
  if (slot == null || !Number.isInteger(slot) || slot < 1 || slot > 25) return
  if (!name || !race || land == null || nw == null || nwpa == null) return
  rows.push({ slot, name, race, land, nw, nwpa, nobility, gains })
}

function addFallbackRow(rows: KingdomProvince[], cells: unknown[]) {
  if (!Array.isArray(cells) || cells.length < 8) return
  addMappedRow(rows, cells, { slot: 0, name: 1, race: 2, land: 3, nw: 4, nwpa: 5, nobility: 6, gains: 7 })
}

function parseRowsFromTables(rawPayload: any) {
  const rows: KingdomProvince[] = []
  const tables = rawPayload?.structured?.tables
  if (!Array.isArray(tables)) return rows

  for (const table of tables) {
    const headers = Array.isArray(table?.headers) ? table.headers.map(clean) : []
    const tableRows = Array.isArray(table?.rows) ? table.rows : []
    if (!tableRows.length) continue

    const indexes = {
      slot: headerIndex(headers, ['#', 'slot', 'province']),
      name: headerIndex(headers, ['name', 'province name']),
      race: headerIndex(headers, ['race']),
      land: headerIndex(headers, ['acres', 'land']),
      nw: headerIndex(headers, ['nw', 'networth']),
      nwpa: headerIndex(headers, ['nwpa', 'nw/acre']),
      nobility: headerIndex(headers, ['honor', 'nobility']),
      gains: headerIndex(headers, ['gains', 'gains/acres', 'gains acres']),
    }

    if (indexes.slot >= 0 && indexes.name >= 0 && indexes.race >= 0 && indexes.land >= 0 && indexes.nw >= 0 && indexes.nwpa >= 0) {
      for (const row of tableRows) addMappedRow(rows, row, indexes)
    } else {
      for (const row of tableRows) addFallbackRow(rows, row)
    }
  }
  return rows
}

function parseRowsFromText(text: string) {
  const rows: KingdomProvince[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    const m = trimmed.match(/^(\d{1,2})\s+.*?\b(Human|Undead|Elf|Orc|Halfling|Dwarf|Faery|Avian|Gnome|Dark Elf)\b.*$/i)
    if (!m) continue
    const slot = Number(m[1])
    if (slot < 1 || slot > 25) continue
  }
  return rows
}

function parseTotal(text: string, label: string) {
  const m = text.match(new RegExp(label + '\s*[:=]?\s*([0-9.,]+\s*[KMB]?)', 'i'))
  return m ? num(m[1]) : null
}

export function parseKingdomStructured(rawText: unknown, rawPayload: any, existing: any = {}): KingdomSnapshot {
  const text = String(rawText ?? '')
  const fields = existing && typeof existing === 'object' ? existing : {}
  const rows = parseRowsFromTables(rawPayload)

  const unique = new Map<number, KingdomProvince>()
  for (const row of rows) unique.set(row.slot, row)
  const provinces = [...unique.values()].sort((a, b) => a.slot - b.slot).slice(0, 25)

  const kdCode = coordinate(fields.kingdom_code ?? fields.kd_code ?? fields.coordinates) ?? coordinate(text)
  const nameMatch = text.match(/(?:kingdom|kingdom of)[^\n]{0,100}?(?:of\s+)?(.+?)\s*\((\d{1,3}:\d{1,3})\)/i)
  const totalProvinces = Math.min(25, num(fields.total_provinces ?? fields.totalProvinces ?? fields.province_count) ?? (provinces.length || 0))
  const totalNw = num(fields.total_nw ?? fields.totalNw) ?? parseTotal(text, 'NW|Networth|Total Networth')
  const totalLand = num(fields.total_land ?? fields.totalLand) ?? parseTotal(text, 'Land|Total Land')
  const nwRank = num(fields.nw_rank ?? fields.nwRank)
  const landRank = num(fields.land_rank ?? fields.landRank)

  return {
    kdCode: kdCode ?? nameMatch?.[2] ?? null,
    kingdomName: fields.kingdom_name ?? fields.kd_name ?? nameMatch?.[1]?.trim() ?? null,
    totalProvinces,
    totalNw,
    totalLand,
    nwRank,
    landRank,
    provinces
  }
}

export function enrichKingdomPayload(rawText: unknown, rawPayload: any, parsedPayload: any) {
  const snapshot = parseKingdomStructured(rawText, rawPayload, parsedPayload)
  return {
    ...(parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : {}),
    kingdom_details: snapshot
  }
}
