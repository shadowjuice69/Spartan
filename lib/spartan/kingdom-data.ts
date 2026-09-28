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
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\*+$/, '')
    .replace(/\s*\((?:M|S)\)$/i, '')
    .trim()
}

function num(value: unknown) {
  const n = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function coordinate(value: unknown) {
  const m = String(value ?? '').match(/\b(\d{1,3}:\d{1,3})\b/)
  return m?.[1] ?? null
}

function addRow(rows: KingdomProvince[], cells: unknown[]) {
  if (!Array.isArray(cells) || cells.length < 8) return
  const slot = num(cells[0])
  const name = clean(cells[1])
  const race = clean(cells[2])
  const land = num(cells[3])
  const nw = num(cells[4])
  const nwpa = num(cells[5])
  const nobility = clean(cells[6])
  const gains = num(cells[7])
  if (slot == null || !Number.isInteger(slot) || slot < 1 || slot > 25) return
  if (!name || !race || !nobility || land == null || nw == null || nwpa == null || gains == null) return
  rows.push({ slot, name, race, land, nw, nwpa, nobility, gains })
}

export function parseKingdomStructured(rawText: unknown, rawPayload: any, existing: any = {}): KingdomSnapshot {
  const text = String(rawText ?? '')
  const fields = existing && typeof existing === 'object' ? existing : {}
  const rows: KingdomProvince[] = []

  const tables = rawPayload?.structured?.tables
  if (Array.isArray(tables)) {
    for (const table of tables) {
      for (const row of Array.isArray(table?.rows) ? table.rows : []) addRow(rows, row)
    }
  }

  const unique = new Map<number, KingdomProvince>()
  for (const row of rows) unique.set(row.slot, row)
  const provinces = [...unique.values()].sort((a, b) => a.slot - b.slot).slice(0, 25)

  const kdCode = coordinate(fields.kingdom_code ?? fields.kd_code ?? fields.coordinates) ?? coordinate(text)
  const nameMatch = text.match(/The\s+(?:[A-Za-z]+\s+)*kingdom of\s+(.+?)\s*\((\d{1,3}:\d{1,3})\)/i)
  const totalMatch = text.match(/Total\s+Provinces\s*[:\t]?\s*([\d,]+)/i)
  const nwMatch = text.match(/Total\s+Networth\s*[:\t]?\s*([\d,]+)/i)
  const landMatch = text.match(/Total\s+Land\s*[:\t]?\s*([\d,]+)/i)
  const nwRankMatch = text.match(/Networth\s+Rank\s*[:\t]?\s*(\d+)\s+of\s+(\d+)/i)
  const landRankMatch = text.match(/Land\s+Rank\s*[:\t]?\s*(\d+)\s+of\s+(\d+)/i)

  const parsedTotalProvinces = num(fields.total_provinces ?? fields.totalProvinces ?? totalMatch?.[1])
  const totalProvinces = Math.min(25, parsedTotalProvinces ?? (provinces.length || 0))

  return {
    kdCode,
    kingdomName: fields.kingdom_name ?? fields.kd_name ?? nameMatch?.[1]?.trim() ?? null,
    totalProvinces,
    totalNw: num(fields.total_nw ?? fields.totalNw ?? nwMatch?.[1]),
    totalLand: num(fields.total_land ?? fields.totalLand ?? landMatch?.[1]),
    nwRank: num(fields.nw_rank ?? nwRankMatch?.[1]),
    landRank: num(fields.land_rank ?? landRankMatch?.[1]),
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
