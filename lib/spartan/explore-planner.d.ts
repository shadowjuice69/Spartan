// Typings for explore-planner.js (shared by the site and, later, the Discord bot).
export type PlanInput = {
  current: Record<string, number | string>
  target: Record<string, number | string>
  exploreAcres?: number | string | null
  targetLand?: number | string | null
  hours?: number | string | null
  batches?: number | string | null
  exploreTicks?: number | string | null
  buildTicks?: number | string | null
  goldPerAcre?: number | string | null
  soldiersPerAcre?: number | string | null
  constructionPerAcre?: number | string | null
  costGrowthPct?: number | string | null
  maxPerBatch?: number | string | null
  goldStock?: number | string | null
  soldierStock?: number | string | null
  goldPerHour?: number | string | null
  soldiersPerHour?: number | string | null
}
export type PlanRow = {
  name: string
  now: number
  nowPct: number
  targetPct: number
  goal: number
  deficit: number
  surplus: number
  add: number
}
export type PlanBatch = {
  kind: 'barren' | 'explore'
  label: string
  acres: number
  startHour: number
  arriveHour: number
  builtHour: number
  built: number
  goldCost: number
  soldierCost: number
  buildCost: number
  build: Record<string, number>
  affordable: boolean
}
export type Plan = {
  error?: undefined
  landNow: number
  barrenNow: number
  totalExplore: number
  finalLand: number
  buildable: number
  need: number
  rebuildNeeded: number
  rows: PlanRow[]
  batches: PlanBatch[]
  totals: { gold: number; soldiers: number; construction: number }
  lastBuiltHour: number
  fitsWindow: boolean | null
  shortGold: number
  shortSoldiers: number
  warnings: string[]
}
export function planExplore(input: PlanInput | null | undefined): Plan | { error: string }
export function apportion(weights: number[], total: number): number[]
export function key(name: string): string
