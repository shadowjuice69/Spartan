// Turns the Exploration page captures (/wol/game/explore) into one model.
// Pure functions: no React, no database. Works on raw_text only; nothing is invented.
import { clean, toNum, pathOf } from './page-models'

type Rec = { url: string | null; raw_text: string | null; captured_at: string | null; created_at: string }

const when = (r: Rec) => r.captured_at || r.created_at
const ts = (r: Rec) => Date.parse(when(r)) || 0

export function parseExploration(text: string) {
  const b = clean(text)
  const sold = b.match(/Exploration Costs \(Soldiers\) ([\d,]+) per acre \(([\d,]+) available\)/)
  const gold = b.match(/Exploration Costs \(Gold\) ([\d,]+)\s?gc per acre \(([\d,]+)\s?gc available\)/)
  if (!sold && !gold) return null
  return {
    soldiersPerAcre: sold ? toNum(sold[1]) : null,
    soldiersAvailable: sold ? toNum(sold[2]) : null,
    goldPerAcre: gold ? toNum(gold[1]) : null,
    goldAvailable: gold ? toNum(gold[2]) : null,
    exploring: toNum((b.match(/Currently Exploring ([\d,]+) acres/) || [])[1]),
    maxNow: toNum((b.match(/Maximum Explorable Now ([\d,]+) acres/) || [])[1]),
    uncharted: toNum((b.match(/Available Uncharted Acres ([\d,]+) acres/) || [])[1]),
  }
}

export function buildExplorationModel(records: Rec[]) {
  const pages = records
    .filter(r => r.raw_text && pathOf(r.url) === '/wol/game/explore')
    .map(r => ({ r, p: parseExploration(r.raw_text || '') }))
    .filter((x): x is { r: Rec; p: NonNullable<ReturnType<typeof parseExploration>> } => !!x.p)
    .sort((a, b) => ts(b.r) - ts(a.r))

  const latest = pages[0] || null
  let plan: null | { acres: number; limit: string; goldCost: number | null; soldierCost: number | null; byGold: number | null; bySoldiers: number | null } = null
  if (latest) {
    const p = latest.p
    const byGold = p.goldPerAcre && p.goldAvailable != null ? Math.floor(p.goldAvailable / p.goldPerAcre) : null
    const bySoldiers = p.soldiersPerAcre && p.soldiersAvailable != null ? Math.floor(p.soldiersAvailable / p.soldiersPerAcre) : null
    const caps: Array<[string, number]> = []
    if (byGold != null) caps.push(['gold', byGold])
    if (bySoldiers != null) caps.push(['soldiers', bySoldiers])
    if (p.maxNow != null) caps.push(['land restriction', p.maxNow])
    const lowest = caps.sort((a, b) => a[1] - b[1])[0]
    if (lowest) {
      plan = {
        acres: lowest[1],
        limit: lowest[0],
        goldCost: p.goldPerAcre != null ? p.goldPerAcre * lowest[1] : null,
        soldierCost: p.soldiersPerAcre != null ? p.soldiersPerAcre * lowest[1] : null,
        byGold,
        bySoldiers,
      }
    }
  }

  return {
    capturedAt: latest ? when(latest.r) : null,
    latest: latest ? latest.p : null,
    plan,
    series: pages.slice(0, 40).reverse().map(x => ({ at: when(x.r), goldPerAcre: x.p.goldPerAcre, soldiersPerAcre: x.p.soldiersPerAcre, maxNow: x.p.maxNow, uncharted: x.p.uncharted })),
    captures: { pages: pages.length },
  }
}
