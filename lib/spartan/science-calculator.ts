import type { ScienceCategory } from './build-parser'

export interface AllocationRow {
  name: string
  type: 'weight' | 'actual_pct'
  input: number
  books: number
}

export interface CategoryAllocation {
  category: string
  totalBooks: number
  rows: AllocationRow[]
}

/**
 * Fixed-% entries (e.g. "4.2% Artisan") are carved off the top first — they're a
 * target share of the category, not a relative weight. Remaining books split by
 * weight across everything else.
 */
export function calculateCategoryAllocation(
  category: string,
  entries: ScienceCategory,
  totalBooks: number
): CategoryAllocation {
  const names = Object.keys(entries)
  const fixed = names.filter((n) => entries[n].type === 'actual_pct')
  const weighted = names.filter((n) => entries[n].type === 'weight')

  const rows: AllocationRow[] = []
  let booksUsedByFixed = 0
  for (const name of fixed) {
    const pct = entries[name].value
    const books = Math.round(totalBooks * (pct / 100))
    booksUsedByFixed += books
    rows.push({ name, type: 'actual_pct', input: pct, books })
  }

  const remaining = Math.max(0, totalBooks - booksUsedByFixed)
  const sumWeights = weighted.reduce((s, n) => s + entries[n].value, 0)
  const perUnit = sumWeights > 0 ? remaining / sumWeights : 0
  for (const name of weighted) {
    const weight = entries[name].value
    rows.push({ name, type: 'weight', input: weight, books: Math.round(weight * perUnit) })
  }
  return { category, totalBooks, rows }
}

export function calculateAllocations(
  science: { economy: ScienceCategory; military: ScienceCategory; arcane: ScienceCategory },
  booksByCategory: { economy: number; military: number; arcane: number }
): CategoryAllocation[] {
  return (['economy', 'military', 'arcane'] as const).map((cat) =>
    calculateCategoryAllocation(cat, science[cat], booksByCategory[cat] || 0)
  )
}
