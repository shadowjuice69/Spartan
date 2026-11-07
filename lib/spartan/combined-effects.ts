// Sums race + personality percentage modifiers into one combined bonus/penalty list.
// Only the "bonuses" and "penalties" fields are summed; unique abilities, start bonuses
// and war doctrine stay as text on the individual cards.

export type RuleLike = {
  emoji?: string | null
  race?: string | null
  personality?: string | null
  bonuses?: string | null
  penalties?: string | null
} | null | undefined

const ALIASES: Array<[string, RegExp]> = [
  ["WPA", /\b(?:WPA|wizards?\s+per\s+acre|wizard(?:s|ry)?\s+(?:power|strength|effectiveness)|wizard power)\b/i],
  ["TPA", /\b(?:TPA|offensive\s+thievery\s+per\s+acre|thievery\s+(?:power|strength)|thieves?\s+per\s+acre|thief power)\b/i],
  ["OME", /\b(?:OME|offensive military efficiency|offensive efficiency)\b/i],
  ["DME", /\b(?:DME|defensive military efficiency|defensive efficiency)\b/i],
  ["ME", /\bmilitary efficiency\b/i],
  ["ATTACK TIME", /\b(?:attack|march|military) travel time\b|\battack time\b/i],
  ["COMBAT GAINS", /\b(?:combat|land|attack) gains\b/i],
  ["SPELL SUCCESS", /\bspell success\b|\bsuccessful spellcasting\b/i],
  ["SPELL DAMAGE", /\bspell damage\b|\bspell strength\b/i],
  ["MILITARY CASUALTIES", /\b(?:military|army|troop) casualties\b/i],
  ["THIEF LOSSES", /\b(?:thief|thievery) losses\b/i],
  ["WIZARD PRODUCTION", /\bwizard production\b|\bwizard training\b/i],
  ["INCOME", /\bincome\b|\bgold production\b/i],
  ["MANA RECOVERY", /\bmana recovery\b|\bmana regeneration\b/i],
  ["EXTRA MANA PER TICK", /\bextra mana per tick\b|\bmana per tick\b/i],
  ["STEALTH RECOVERY", /\bstealth recovery\b|\bstealth regeneration\b/i],
  ["POPULATION", /\bpopulation\b/i],
  ["FOOD PRODUCTION", /\bfood production\b|\bfood income\b/i],
  ["RUNE PRODUCTION", /\brune production\b|\brune generation\b/i],
  ["RUNE COST", /\brune costs?\b/i],
  ["CHANNELING SCIENCE", /\bchanneling science\b/i],
  ["SCIENCE COST", /\bscience costs?\b/i],
  ["BUILDING COST", /\bbuilding costs?\b/i],
  ["TRAINING COST", /\btraining costs?\b/i],
  ["MILITARY TRAINING TIME", /\b(?:military|troop) training time\b/i],
  ["SPELL DURATION", /\bspell duration\b/i],
  ["THIEVERY SUCCESS", /\bthievery success\b|\bthief success\b/i],
  ["BUILDING EFFECTIVENESS", /\bbuilding effectiveness\b/i],
]

// Case-sensitive abbreviations (so ordinary words "me" / "be" are never matched).
const CASE_SENSITIVE: Array<[string, RegExp]> = [
  ["ME", /\bME\b/],
  ["BUILDING EFFECTIVENESS", /\bBE\b/],
]

const DELIMS = /[;,\.\n!·•]/
// For these stats a positive number is bad for the player (more cost, longer time, more losses).
const BAD_WHEN_POSITIVE = /COST|TRAINING TIME|TRAVEL TIME|ATTACK TIME|CASUALT|LOSSES|LOSS\b|FOOD CONSUMPTION|DAMAGE TAKEN|DAMAGE RECEIVED/

export function isFavorable(stat: string, amount: number): boolean {
  return BAD_WHEN_POSITIVE.test(stat) ? amount < 0 : amount > 0
}

function matchStat(text: string): string | undefined {
  for (const [key, pattern] of ALIASES) if (pattern.test(text)) return key
  for (const [key, pattern] of CASE_SENSITIVE) if (pattern.test(text)) return key
  return undefined
}

export function extractPercentEffects(text?: string | null, inPenalties = false): Map<string, number> {
  const effects = new Map<string, number>()
  if (!text?.trim()) return effects

  // Commas/periods inside parentheses must not cut an effect in half, e.g.
  // "-20% Own casualties when defending (-2% each, max 20%)".
  const masked = text.replace(/\([^)]*\)/g, m => m.replace(/[;,\.\n!·•]/g, " "))
  const percentages = [...masked.matchAll(/([+\-−–]?\s*\d+(?:\.\d+)?)\s*%/g)]
  let lastKey = ""

  percentages.forEach((match, index) => {
    const rawAmount = match[1].replace(/\s/g, "").replace(/[−–]/g, "-")
    let amount = Number(rawAmount)
    if (!Number.isFinite(amount)) return
    const explicitSign = /^[+\-]/.test(rawAmount)
    const start = match.index ?? 0
    const end = start + match[0].length
    const nextStart = percentages[index + 1]?.index ?? masked.length
    const before = masked.slice(0, start)
    const insideParen = before.lastIndexOf("(") > before.lastIndexOf(")")

    let key: string | undefined
    let rawTail = masked.slice(end, nextStart)

    if (insideParen && lastKey) {
      // A per-unit / sub-value of the previous effect: "(-2% each)" -> "<previous effect> (each)".
      const inner = rawTail.split(")")[0].replace(/\s+/g, " ").trim()
      key = inner ? `${lastKey} (${inner.toUpperCase()})` : `${lastKey} (EACH)`
    } else {
      const tail = rawTail.split(DELIMS, 1)[0].trim()
      if (tail) {
        key = matchStat(tail)
        if (!key) {
          const cleaned = tail
            .replace(/\s*\([^)]*\)?/g, "")
            .replace(/^(?:more|less|bonus\s+to|to)\s+/i, "")
            .replace(/\s+/g, " ")
            .replace(/^[\s:—–-]+|[\s:—–-]+$/g, "")
          if (cleaned) key = cleaned.toUpperCase()
        }
      } else {
        // "WPA increased by 25%" style: the stat name comes before the number.
        const previousEnd = index > 0 ? (percentages[index - 1].index ?? 0) + percentages[index - 1][0].length : 0
        const prefix = masked.slice(previousEnd, start).split(DELIMS).pop()?.trim() || ""
        key = matchStat(prefix)
      }
    }
    if (!key) return

    const wording = masked.slice(Math.max(0, start - 40), start) + " " + rawTail.slice(0, 30)
    if (!explicitSign) {
      if (/\b(?:less|reduced|lowered|decreased|reduction)\b/i.test(wording)) amount = -Math.abs(amount)
      else if (inPenalties && !BAD_WHEN_POSITIVE.test(key)) amount = -Math.abs(amount)
    }
    effects.set(key, (effects.get(key) || 0) + amount)
    if (!insideParen) lastKey = key
  })
  return effects
}

export type CombinedRow = { stat: string; total: number; race: number; personality: number; favorable: boolean }

export function combineEffects(race: RuleLike, personality: RuleLike): { bonuses: CombinedRow[]; penalties: CombinedRow[] } {
  const rows = new Map<string, { race: number; personality: number }>()
  const addAll = (who: "race" | "personality", text: string | null | undefined, inPenalties: boolean) => {
    for (const [stat, amount] of extractPercentEffects(text, inPenalties)) {
      const row = rows.get(stat) || { race: 0, personality: 0 }
      row[who] += amount
      rows.set(stat, row)
    }
  }
  addAll("race", race?.bonuses, false)
  addAll("race", race?.penalties, true)
  addAll("personality", personality?.bonuses, false)
  addAll("personality", personality?.penalties, true)

  const bonuses: CombinedRow[] = []
  const penalties: CombinedRow[] = []
  for (const [stat, v] of rows) {
    const total = Math.round((v.race + v.personality) * 100) / 100
    if (total === 0) continue
    const row = { stat, total, race: Math.round(v.race * 100) / 100, personality: Math.round(v.personality * 100) / 100, favorable: isFavorable(stat, total) }
    ;(row.favorable ? bonuses : penalties).push(row)
  }
  const byImpact = (a: CombinedRow, b: CombinedRow) => Math.abs(b.total) - Math.abs(a.total)
  return { bonuses: bonuses.sort(byImpact), penalties: penalties.sort(byImpact) }
}
