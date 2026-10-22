import type { ScienceCategory } from './build-parser'
import { parseScienceText } from './build-parser'
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


// Older stored builds may contain numeric weights or legacy raw science text.
// Normalize those formats at read time; never write back or mutate the saved build.
const emptyScience = (): Record<CategoryKey, ScienceCategory> => ({ economy: {}, military: {}, arcane: {} })
export function normalizeScience(value: unknown, rawText?: unknown): Record<CategoryKey, ScienceCategory> {
  const result = emptyScience()
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const aliases: Record<CategoryKey, string[]> = {
    economy: ['economy', 'economy science', 'economy_science'],
    military: ['military', 'military science', 'military_science'],
    arcane: ['arcane', 'arcane arts', 'arcane_science', 'arcane arts science'],
  }

  const parseEntry = (raw: unknown): { type: 'weight' | 'actual_pct'; value: number } | null => {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return { type: 'weight', value: raw }
    if (typeof raw === 'string') {
      const text = raw.trim()
      const m = text.match(/^(\d+(?:\.\d+)?)\s*(%|x)?$/i)
      if (!m) return null
      const n = Number(m[1])
      return Number.isFinite(n) && n >= 0
        ? { type: m[2] === '%' ? 'actual_pct' : 'weight', value: n }
        : null
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const item = raw as Record<string, unknown>
    const rawValue = item.value ?? item.weight ?? item.actual_pct ?? item.percent ?? item.target_pct
    const n = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    if (!Number.isFinite(n) || n < 0 || rawValue == null || rawValue === '') return null
    const kind = String(item.type ?? item.kind ?? '').toLowerCase()
    const isPct = kind === 'actual_pct' || kind.includes('percent') || kind === 'fixed'
      || item.actual_pct != null || item.percent != null || item.target_pct != null
    if (kind && kind !== 'weight' && kind !== 'actual_pct' && !kind.includes('percent') && kind !== 'fixed') return null
    return { type: isPct ? 'actual_pct' : 'weight', value: n }
  }

  for (const key of CATEGORY_KEYS) {
    const foundKey = Object.keys(source).find((candidate) => aliases[key].includes(candidate.trim().toLowerCase()))
    const entries = foundKey ? source[foundKey] : null
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
    for (const [name, raw] of Object.entries(entries as Record<string, unknown>)) {
      const cleanName = name.trim()
      const entry = parseEntry(raw)
      if (cleanName && entry) result[key][cleanName] = entry
    }
  }

  if (typeof rawText === 'string' && rawText.trim()) {
    const legacy = parseScienceText(rawText)
    for (const key of CATEGORY_KEYS) {
      if (Object.keys(result[key]).length === 0) result[key] = legacy[key]
    }
  }
  return result
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