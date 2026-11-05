'use strict'
/**
 * Shared target ranking for Spartan.
 *
 * Used by the site (Best Gains and Intel pages, through PayoffPanel) and by the Discord bot
 * (/spartan-war target). It is CommonJS on purpose so both can require the same file; the
 * TypeScript typings live next to it in target-ranker.d.ts.
 *
 * How a province is scored:
 *   gain      Estimated land from a traditional march (the same formula Best Gains always used).
 *   hardness  How heavy the province is compared with the median province of its own kingdom.
 *             Uses defense per acre when a defense is known, otherwise networth per acre (NWPA).
 *   value     gain divided by hardness, scaled so the best province in the list is 100.
 *
 * NWPA is a proxy. Treat the ranking as a shortlist and confirm with a SOT/SOM before sending.
 */

const MIN_SAMPLE = 3 // a kingdom needs this many provinces to supply its own median
const H_MIN = 0.25 // clamp so one odd capture cannot dominate the list
const H_MAX = 4

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function median(list) {
  if (!list.length) return null
  const s = list.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Exact formula PayoffPanel used before.
function estimateGain(yNW, yAcres, tNW, tAcres, map, war) {
  let a = tNW / yNW - 0.05
  if (a >= 1) a = 1 / a
  const magic = Math.max(0.67, a < 0.9 ? a + 0.1 : a)
  const gf = Math.min(1.35, Math.max(0.01, 3 * magic))
  const mapf = war ? (1 - map / 100 + 3) / 4 : 1 - map / 100
  const warf = war ? 1.1 : 1
  const raw = 0.12 * tAcres * gf * mapf * warf
  const cap = 0.2 * Math.min(yAcres, tAcres)
  return { gain: Math.min(raw, cap), capped: raw >= cap }
}

// Smaller targets must meet both NW and land limits; larger targets may meet either.
function inRange(yNW, yAcres, tNW, tAcres) {
  const nwIn = tNW / yNW >= 0.85 && tNW / yNW <= 1.1765
  const landIn = tAcres / yAcres >= 0.85 && tAcres / yAcres <= 1.1765
  const smaller = tNW < yNW || tAcres < yAcres
  return smaller ? nwIn && landIn : nwIn || landIn
}

function gradeValue(value) {
  if (value >= 80) return { letter: 'S', emoji: '🟢' }
  if (value >= 60) return { letter: 'A', emoji: '🟢' }
  if (value >= 40) return { letter: 'B', emoji: '🟡' }
  if (value >= 20) return { letter: 'C', emoji: '🟠' }
  return { letter: 'D', emoji: '🔴' }
}

/**
 * rankTargets({ targets, you, map, war, rangeOnly, mode, kd, limit })
 *   targets   provinces: { name, kd, acres, nw, def?, defHome? } (extra fields are passed through)
 *   you       { nw, acres } of the attacking province. Without both, no gain is estimated and the
 *             list is ranked by softness alone. With only nw, the range filter uses networth only.
 *   map       your MAP percent (0-100), only used for the gain estimate
 *   war       true when at war (+10% gains, war MAP formula)
 *   rangeOnly keep only provinces you can legally hit
 *   mode      'value' (default), 'gain' (most acres first) or 'soft' (lightest first)
 *   kd        limit the output to one kingdom code; medians still use the whole grid
 *   limit     rows to return (default 15)
 */
function rankTargets(opts) {
  const o = opts || {}
  const targets = Array.isArray(o.targets) ? o.targets : []
  const you = o.you || {}
  const yNW = num(you.nw)
  const yAcres = num(you.acres)
  const haveNW = yNW !== null && yNW > 0
  const haveBoth = haveNW && yAcres !== null && yAcres > 0
  const map = Math.min(100, Math.max(0, num(o.map) ?? 0))
  const war = !!o.war
  const rangeOnly = !!o.rangeOnly
  const mode = o.mode === 'gain' || o.mode === 'soft' ? o.mode : 'value'
  const limit = Number.isInteger(o.limit) && o.limit > 0 ? o.limit : 15
  const kdFilter = o.kd && o.kd !== 'all' ? String(o.kd) : null

  // 1. Usable provinces only: missing values are excluded rather than guessed.
  const pool = []
  for (const p of targets) {
    const acres = num(p && p.acres)
    const nw = num(p && p.nw)
    if (acres === null || nw === null || acres <= 0 || nw <= 0) continue
    const defRaw = num(p.defHome ?? p.def)
    const def = defRaw !== null && defRaw > 0 ? defRaw : null
    pool.push({ p, kd: p.kd ? String(p.kd) : '', acres, nw, nwpa: nw / acres, def, dpa: def !== null ? def / acres : null })
  }

  // 2. Each kingdom's own medians. A kingdom with too few samples borrows the pooled median.
  const poolNwpa = pool.map((e) => e.nwpa)
  const poolDpa = pool.filter((e) => e.dpa !== null).map((e) => e.dpa)
  const pooled = (list, fallback) => (list.length >= MIN_SAMPLE ? median(list) : fallback.length >= MIN_SAMPLE ? median(fallback) : null)
  const groups = new Map()
  for (const e of pool) {
    let g = groups.get(e.kd)
    if (!g) groups.set(e.kd, (g = { nwpa: [], dpa: [] }))
    g.nwpa.push(e.nwpa)
    if (e.dpa !== null) g.dpa.push(e.dpa)
  }
  for (const g of groups.values()) {
    g.medNwpa = pooled(g.nwpa, poolNwpa)
    g.medDpa = pooled(g.dpa, poolDpa)
  }

  // 3. Score everything that passes the filters.
  const scored = []
  for (const e of pool) {
    if (kdFilter && e.kd !== kdFilter) continue
    const g = groups.get(e.kd)
    let hardness = 1
    let basis = 'none'
    if (e.dpa !== null && g.medDpa) { hardness = e.dpa / g.medDpa; basis = 'def' }
    else if (g.medNwpa) { hardness = e.nwpa / g.medNwpa; basis = 'nw' }
    hardness = Math.min(H_MAX, Math.max(H_MIN, hardness))

    let gain = null
    let capped = false
    if (haveBoth) {
      if (rangeOnly && !inRange(yNW, yAcres, e.nw, e.acres)) continue
      const est = estimateGain(yNW, yAcres, e.nw, e.acres, map, war)
      gain = est.gain
      capped = est.capped
    } else if (haveNW && rangeOnly) {
      const r = e.nw / yNW
      if (r < 0.85 || r > 1.1765) continue
    }

    scored.push({
      raw: (gain !== null ? gain : 1) / hardness,
      row: {
        p: e.p, acres: e.acres, nw: e.nw, nwpa: e.nwpa, def: e.def, dpa: e.dpa,
        gain, capped, per10k: gain !== null && e.def !== null ? gain / (e.def / 10000) : null,
        hardness, vsKd: hardness - 1, basis, value: 0,
      },
    })
  }

  // 4. Value is relative to the best province in the list, so the top row is always 100.
  const maxRaw = scored.reduce((m, s) => Math.max(m, s.raw), 0)
  for (const s of scored) s.row.value = maxRaw > 0 ? Math.round((100 * s.raw) / maxRaw) : 0

  const gainOf = (s) => s.row.gain ?? 0
  scored.sort((a, b) => {
    let d
    if (mode === 'soft') d = a.row.hardness - b.row.hardness
    else if (mode === 'gain' && haveBoth) d = gainOf(b) - gainOf(a)
    else d = b.raw - a.raw
    return d || gainOf(b) - gainOf(a) || String(a.row.p.name).localeCompare(String(b.row.p.name))
  })
  return scored.slice(0, limit).map((s) => s.row)
}

module.exports = { estimateGain, inRange, rankTargets, gradeValue, median, MIN_SAMPLE }
