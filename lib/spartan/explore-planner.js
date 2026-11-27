'use strict'
/**
 * Explore planner for Spartan (base version).
 *
 * Answers: "I want to explore N acres in a set window. Which buildings should those acres
 * become so I end up on my chosen build, and when does each batch land?"
 *
 * Pure functions, CommonJS so the site and the bot can share it (typings in explore-planner.d.ts).
 *
 * What it uses (all supplied by the caller, nothing invented):
 *   current   building counts now, including "Barren Land"
 *   target    the build, as percent of land per building (spartan_builds.buildings)
 *   costs     gold/soldiers per acre, from the latest Exploration capture
 *
 * What it assumes (editable inputs, defaults are guesses to be confirmed for your age):
 *   exploreTicks 12   hours for explored land to arrive
 *   buildTicks   12   hours for construction to finish
 *
 * Not modelled: land-gain from attacks, cost growth beyond the simple costGrowthPct, buildings
 * already under construction, and razing. If your current buildings are over target the plan says
 * how many acres would need razing to hit the target exactly; it never assumes you will raze.
 */
const BARREN = 'barrenland'
const ALIASES = { barrack: 'militarybarrack', den: 'thievesden', armory: 'armoury', barren: BARREN }

function num(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%\s]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

/** Match building names across sources: "Thieves' Dens" = "Thieves Dens", "Barracks" = "Military Barracks". */
function key(name) {
  let s = String(name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!s) return ''
  s = s.replace(/ies$/, 'y').replace(/s$/, '')
  return ALIASES[s] || s
}

/** Split `total` into whole numbers in proportion to `weights` (largest remainder). Sums to total. */
function apportion(weights, total) {
  const w = weights.map((x) => Math.max(0, x))
  const sum = w.reduce((a, b) => a + b, 0)
  if (!(total > 0) || !(sum > 0)) return w.map(() => 0)
  const raw = w.map((x) => (x * total) / sum)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let i = 0; left > 0 && i < order.length; i++, left--) out[order[i][1]]++
  return out
}

function planExplore(input) {
  const o = input || {}
  const warnings = []
  const curNames = new Map()
  const tgtNames = new Map()
  const cur = new Map()
  const tgt = new Map()

  for (const [name, qty] of Object.entries(o.current || {})) {
    const k = key(name)
    if (!k) continue
    if (!curNames.has(k)) curNames.set(k, name)
    cur.set(k, (cur.get(k) || 0) + Math.max(0, Math.round(num(qty))))
  }
  for (const [name, pct] of Object.entries(o.target || {})) {
    const k = key(name)
    if (!k) continue
    if (k === BARREN) {
      if (num(pct) > 0) warnings.push('The build lists Barren Land; it is ignored, all land is planned as built.')
      continue
    }
    if (!tgtNames.has(k)) tgtNames.set(k, name)
    tgt.set(k, (tgt.get(k) || 0) + Math.max(0, num(pct)))
  }

  const landNow = [...cur.values()].reduce((a, b) => a + b, 0)
  if (landNow <= 0) return { error: 'Add your current buildings first (no acres found).' }
  const sumPct = [...tgt.values()].reduce((a, b) => a + b, 0)
  if (sumPct <= 0) return { error: 'Pick a build (its building percentages are empty).' }
  if (Math.abs(sumPct - 100) > 0.5) warnings.push(`The build adds up to ${Math.round(sumPct * 10) / 10}%, so it was scaled to 100%.`)

  const barrenNow = cur.get(BARREN) || 0
  let totalExplore = Math.round(num(o.exploreAcres))
  if (!(totalExplore > 0) && num(o.targetLand) > 0) totalExplore = Math.max(0, Math.round(num(o.targetLand)) - landNow)
  totalExplore = Math.max(0, totalExplore)
  const finalLand = landNow + totalExplore
  const keys = [...tgt.keys(), ...[...cur.keys()].filter((k) => k !== BARREN && !tgt.has(k))]
  const want = apportion(keys.map((k) => tgt.get(k) || 0), finalLand)

  const rows = keys.map((k, i) => {
    const now = cur.get(k) || 0
    return {
      name: curNames.get(k) || tgtNames.get(k),
      now,
      nowPct: Math.round((now / landNow) * 1000) / 10,
      targetPct: Math.round(((tgt.get(k) || 0) / sumPct) * 1000) / 10,
      goal: want[i],
      deficit: Math.max(0, want[i] - now),
      surplus: Math.max(0, now - want[i]),
      add: 0,
    }
  })

  const buildable = barrenNow + totalExplore
  const need = rows.reduce((a, r) => a + r.deficit, 0)
  const rebuildNeeded = rows.reduce((a, r) => a + r.surplus, 0)
  const alloc = apportion(rows.map((r) => r.deficit), Math.min(buildable, need))
  rows.forEach((r, i) => { r.add = Math.min(alloc[i], r.deficit) })
  if (rebuildNeeded > 0) {
    const names = rows.filter((r) => r.surplus > 0).map((r) => `${r.name} (${r.surplus})`).join(', ')
    warnings.push(`You are over the build on ${names}. Exploring alone cannot reach the exact percentages; about ${rebuildNeeded} acres would need razing and rebuilding. The plan only builds new and barren land.`)
  }

  const exploreTicks = Math.max(0, num(o.exploreTicks, 12))
  const buildTicks = Math.max(0, num(o.buildTicks, 12))
  const hours = Math.max(0, num(o.hours, 0))
  const n = totalExplore > 0 ? Math.max(1, Math.floor(num(o.batches, 1))) : 0
  const latestStart = hours - exploreTicks - buildTicks
  if (hours > 0 && latestStart < 0 && totalExplore > 0) {
    warnings.push(`The ${hours}h window is shorter than explore (${exploreTicks}h) plus build (${buildTicks}h), so nothing can finish inside it.`)
  }
  const span = Math.max(0, latestStart)
  const per = apportion(Array.from({ length: n }, () => 1), totalExplore)
  const maxPer = num(o.maxPerBatch, 0)
  if (maxPer > 0 && per.some((a) => a > maxPer)) {
    warnings.push(`A batch is larger than the ${maxPer} acres the game allows at once. Use at least ${Math.ceil(totalExplore / maxPer)} batches.`)
  }

  const goldPer = num(o.goldPerAcre)
  const soldPer = num(o.soldiersPerAcre)
  const buildPer = num(o.constructionPerAcre)
  const growth = num(o.costGrowthPct)
  const remain = rows.map((r) => r.add)
  const take = (acres) => {
    const got = apportion(remain, Math.min(acres, remain.reduce((a, b) => a + b, 0))).map((g, i) => Math.min(g, remain[i]))
    got.forEach((g, i) => { remain[i] -= g })
    return got
  }

  const batches = []
  if (barrenNow > 0) {
    batches.push({ kind: 'barren', label: 'Build on barren land now', acres: 0, startHour: 0, arriveHour: 0, builtHour: buildTicks, built: barrenNow, goldCost: 0, soldierCost: 0, buildCost: Math.round(barrenNow * buildPer), plan: take(barrenNow) })
  }
  per.forEach((acres, i) => {
    const start = n > 1 ? Math.round((span * i) / (n - 1)) : 0
    const goldCost = Math.round(acres * goldPer * Math.pow(1 + growth / 100, i))
    batches.push({ kind: 'explore', label: `Explore batch ${i + 1}`, acres, startHour: start, arriveHour: start + exploreTicks, builtHour: start + exploreTicks + buildTicks, built: acres, goldCost, soldierCost: Math.round(acres * soldPer), buildCost: Math.round(acres * buildPer), plan: take(acres) })
  })
  batches.forEach((b) => {
    b.build = {}
    b.plan.forEach((q, i) => { if (q > 0) b.build[rows[i].name] = q })
    delete b.plan
  })

  const events = []
  batches.forEach((b, bi) => {
    if (b.goldCost || b.soldierCost) events.push({ at: b.startHour, bi, gold: b.goldCost, soldiers: b.soldierCost })
    if (b.buildCost) events.push({ at: b.arriveHour, bi, gold: b.buildCost, soldiers: 0 })
  })
  events.sort((a, b) => a.at - b.at || a.bi - b.bi)
  let spentGold = 0
  let spentSoldiers = 0
  let minGold = Infinity
  let minSoldiers = Infinity
  batches.forEach((b) => { b.affordable = true })
  const goldStock = num(o.goldStock, NaN)
  const soldStock = num(o.soldierStock, NaN)
  for (const e of events) {
    spentGold += e.gold
    spentSoldiers += e.soldiers
    if (Number.isFinite(goldStock)) {
      const bal = goldStock + num(o.goldPerHour) * e.at - spentGold
      minGold = Math.min(minGold, bal)
      if (bal < 0) batches[e.bi].affordable = false
    }
    if (Number.isFinite(soldStock)) {
      const bal = soldStock + num(o.soldiersPerHour) * e.at - spentSoldiers
      minSoldiers = Math.min(minSoldiers, bal)
      if (bal < 0) batches[e.bi].affordable = false
    }
  }
  const short = (v) => (Number.isFinite(v) && v < 0 ? Math.abs(Math.round(v)) : 0)
  if (short(minGold)) warnings.push(`Gold runs short by about ${short(minGold).toLocaleString('en-US')} at the tightest point.`)
  if (short(minSoldiers)) warnings.push(`Soldiers run short by about ${short(minSoldiers).toLocaleString('en-US')} at the tightest point.`)

  const lastBuilt = batches.reduce((m, b) => Math.max(m, b.builtHour), 0)
  return {
    landNow, barrenNow, totalExplore, finalLand, buildable, need, rebuildNeeded,
    rows, batches,
    totals: {
      gold: batches.reduce((a, b) => a + b.goldCost, 0),
      soldiers: batches.reduce((a, b) => a + b.soldierCost, 0),
      construction: batches.reduce((a, b) => a + b.buildCost, 0),
    },
    lastBuiltHour: lastBuilt,
    fitsWindow: hours > 0 ? lastBuilt <= hours : null,
    shortGold: short(minGold),
    shortSoldiers: short(minSoldiers),
    warnings,
  }
}
module.exports = { planExplore, apportion, key }
