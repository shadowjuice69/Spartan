// Deterministic (non-AI) parsers for the Build Lab's three paste boxes.
// The in-game/Discord format is consistent enough that regex beats an AI
// round-trip here — instant, free, and never invents numbers.

export type ScienceEntry =
  | { type: 'weight'; value: number }
  | { type: 'actual_pct'; value: number }

export type ScienceCategory = Record<string, ScienceEntry>

export interface ParsedBuild {
  name: string | null
  author: string | null
  buildings: Record<string, number>
}

export interface ParsedMilitaryRequirement {
  ppa: number | null
  tpa: number | null
  wpa: number | null
  dspa: number | null
  epa_ospa: number | null
  gcpa: number | null
  notes: string
}

export interface ParsedScience {
  economy: ScienceCategory
  military: ScienceCategory
  arcane: ScienceCategory
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Box 1 — Build: header line + building percentages */
export function parseBuildText(raw: string): ParsedBuild {
  const text = raw || ''
  const header = text.match(/\*\*(.+?)\*\*\s*build(?:\s*(?:—|-)\s*set by\s*([^·\n]+))?/i)
  const name = header ? clean(header[1]) : null
  const author = header && header[2] ? clean(header[2]) : null

  const buildings: Record<string, number> = {}
  const lineRe = /^\s*([A-Za-z][A-Za-z ]*?)\s*(?:—|-)?\s*(\d+(?:\.\d+)?)\s*%\s*$/
  for (const line of text.split('\n')) {
    const m = line.match(lineRe)
    if (m) buildings[clean(m[1])] = Number(m[2])
  }
  return { name, author, buildings }
}

/** Box 2 — Military Requirement: per-acre ratios + freeform notes */
export function parseMilitaryRequirementText(raw: string): ParsedMilitaryRequirement {
  const text = raw || ''
  // Accept compact Discord-style forms ("6ppa") and spaced forms ("6 ppa"),
  // plus combined EPA/OSPA and EPA/DSPA labels.
  const metricRe = /^\\s*([\\d.]+)\\s*\\+?\\s*(ppa|tpa|wpa|dspa|epa\\s*\\/\\s*(?:ospa|dspa)|gcpa)\\b/i
  const result: ParsedMilitaryRequirement = {
    ppa: null, tpa: null, wpa: null, dspa: null, epa_ospa: null, gcpa: null, notes: '',
  }
  const noteLines: string[] = []
  for (const rawLine of text.split('\\n')) {
    const line = rawLine.trim()
    if (!line || /^military$/i.test(line)) continue
    const m = line.match(metricRe)
    if (m) {
      const value = Number(m[1])
      const metric = m[2].toLowerCase().replace(/\\s+/g, '')
      if (metric === 'epa/dspa') {
        result.dspa = value
        result.epa_ospa = value
      } else {
        const key = metric.replace('/', '_') as keyof ParsedMilitaryRequirement
        if (key in result) (result as any)[key] = value
      }
    } else {
      noteLines.push(line)
    }
  }
  result.notes = noteLines.join(' ')
  return result
}

/** Box 3 — Science: 3 categories, each line "Nx Name" (weight) or "N% Name (...)" (fixed target %) */
export function parseScienceText(raw: string): ParsedScience {
  const text = raw || ''
  const sections: ParsedScience = { economy: {}, military: {}, arcane: {} }
  const headerRe = /^(economy|military|arcane)(\s+science)?\s*$/i
  const lineRe = /^\s*(\d+(?:\.\d+)?)\s*(x|%)\s+([A-Za-z]+)/i

  let current: keyof ParsedScience | null = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const h = line.match(headerRe)
    if (h) { current = h[1].toLowerCase() as keyof ParsedScience; continue }
    if (!current) continue
    const m = line.match(lineRe)
    if (!m) continue
    const value = Number(m[1])
    const scienceName = clean(m[3])
    sections[current][scienceName] = m[2] === '%' ? { type: 'actual_pct', value } : { type: 'weight', value }
  }
  return sections
}
