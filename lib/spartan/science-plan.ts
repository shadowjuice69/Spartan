import type { ScienceCategory } from './build-parser'
import { calculateCategoryAllocation } from './science-calculator'

// The science page names the third category "Arcane Arts"; builds call it "arcane".
export const CATEGORY_KEYS = ['economy', 'military', 'arcane'] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export interface LiveItem { name: string; books: number; effect: number }
export interface LiveCategory { name: string; totalBooks: number; booksAvailable: number; items: LiveItem[] }

export interface PlanRow {
  name: string
  type: 'weight' | 'actual_pct'
  input: number
  target: number
  current: number
  delta: number
  currentEffect: number | null
  projectedEffect: number | null
}

export interface CategoryPlan {
  category: CategoryKey
  totalBooks: number
  invested: number
  available: number
  rows: PlanRow[]
  extras: { name: string; books: number }[]
}

const liveName = (key: CategoryKey) => (key === 'arcane' ? 'arcane arts' : key)
export const findLive = (cats: LiveCategory[], key: CategoryKey) =>
  cats.find((c) => c.name.toLowerCase() === liveName(key)) || null

export function projectEffect(currentBooks: number, currentEffect: number, targetBooks: number): number | null {
  if (!(currentBooks > 0) || !Number.isFinite(currentEffect) || currentEffect === 0) return null
  if (targetBooks <= 0) return 0
  const k = currentEffect / Math.pow(currentBooks, 1 / 2.125)
  return k * Math.pow(targetBooks, 1 / 2.125)
}

export function buildPlan(
  science: Record<CategoryKey, ScienceCategory>,
  live: LiveCategory[] | null,
  override: Partial<Record<CategoryKey, number>> = {},
): CategoryPlan[] {
  return CATEGORY_KEYS.map((key) => {
    const entries = science?.[key] || {}
    const liveCat = live ? findLive(live, key) : null
    const invested = liveCat?.totalBooks ?? 0
    const available = liveCat?.booksAvailable ?? 0
    const typed = override[key]
    const totalBooks = typed != null && typed > 0 ? typed : invested + available
    const alloc = calculateCategoryAllocation(key, entries, totalBooks)
    const liveItem = (name: string) => liveCat?.items.find((i) => i.name.toLowerCase() === name.toLowerCase()) || null
    const rows: PlanRow[] = alloc.rows.map((r) => {
      const item = liveItem(r.name)
      const current = item?.books ?? 0
      return {
        name: r.name, type: r.type, input: r.input, target: r.books, current,
        delta: r.books - current, currentEffect: item ? item.effect : null,
        projectedEffect: item ? projectEffect(item.books, item.effect, r.books) : null,
      }
    })
    const planned = new Set(rows.map((r) => r.name.toLowerCase()))
    const extras = (liveCat?.items || []).filter((i) => i.books > 0 && !planned.has(i.name.toLowerCase())).map((i) => ({ name: i.name, books: i.books }))
    return { category: key, totalBooks, invested, available, rows, extras }
  })
}