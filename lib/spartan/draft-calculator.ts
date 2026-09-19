// lib/spartan/draft-calculator.ts
// Soldiers/tick = Peasants × Draft Rate × Race × Personality × Patriotism × Ritual × Heroism Science
// (formula per the Utopia wiki reference; Race/Personality multipliers are extracted
// live from their stored bonus/penalty text so this stays correct if either changes)

export const DRAFT_RATES: Record<string, number> = {
  None: 0,
  Reservist: 0.5,
  Normal: 1.0,
  Aggressive: 1.5,
  Emergency: 2.0,
}

/** Scans bonus/penalty text for "±N% Draft Speed" or "±N% Draft Rate" (never "Draft Cost" —
 *  that's a different formula) and returns a combined multiplier, e.g. "−25% Draft Speed" → 0.75 */
export function extractDraftMultiplier(...texts: (string | null | undefined)[]): number {
  let mult = 1
  const re = /([+\-\u2212]?\d+(?:\.\d+)?)%\s*Draft\s*(?:Speed|Rate)\b/gi
  for (const text of texts) {
    if (!text) continue
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text))) {
      const raw = m[1].replace(/\u2212/, '-')
      mult += Number(raw) / 100
    }
  }
  return mult
}

export interface DraftCalcInputs {
  peasants: number
  land: number
  homesCount: number
  guildsCount: number
  heroismDraftSpeedPct: number // e.g. 7.8 for +7.8%
  raceBonusText?: string | null
  racePenaltyText?: string | null
  personalityBonusText?: string | null
  patriotismActive: boolean
  ritualDraftPct: number // 0 unless a draft-affecting ritual (e.g. Affluent = +20) is active
  draftRatePct: number // e.g. 2.0 for Emergency, 0.5 for Reservist, or any custom value
  days: number
  includeBaseBirthRate: boolean // off by default — see overpopulation note in the UI
  raceLivingSpaceBonusPct?: number
  populationSciencePct?: number
}

export interface DraftCalcDay {
  day: number
  peasants: number
  army: number
  draftedCumulative: number
  draftedToday: number
}

export interface DraftCalcResult {
  rows: DraftCalcDay[]
  modLivingSpace: number
  isOverpopulated: number | null // excess population, or null if unknown (peasants-only estimate)
  combinedDraftMultiplier: number
  effectiveDailyRatePct: number
}

const TICKS_PER_DAY = 24
const BASE_BIRTH_RATE = 0.0205 // 2.05%, wiki-documented base

export function simulateDraft(inputs: DraftCalcInputs): DraftCalcResult {
  const raceMult = extractDraftMultiplier(inputs.raceBonusText, inputs.racePenaltyText)
  const persMult = extractDraftMultiplier(inputs.personalityBonusText)
  const heroismMult = 1 + inputs.heroismDraftSpeedPct / 100
  const patriotismMult = inputs.patriotismActive ? 1.3 : 1
  const ritualMult = 1 + inputs.ritualDraftPct / 100
  const combinedDraftMultiplier = raceMult * persMult * heroismMult * patriotismMult * ritualMult
  const dailyRate = (inputs.draftRatePct / 100) * combinedDraftMultiplier
  const perTickRate = dailyRate / TICKS_PER_DAY // the named rate (e.g. Emergency 2.0%) is a daily target

  const rawLivingSpace = inputs.land * 25 + inputs.homesCount * 10
  const modLivingSpace = rawLivingSpace * (1 + (inputs.raceLivingSpaceBonusPct || 0) / 100) * (1 + (inputs.populationSciencePct || 0) / 100)
  const isOverpopulated = inputs.peasants > modLivingSpace ? Math.round(inputs.peasants - modLivingSpace) : null

  const homesBonusPerTick = inputs.homesCount * 0.3
  const wizardsPerTick = inputs.guildsCount * 0.02

  let peasants = inputs.peasants
  let army = 0
  let draftedCumulative = 0
  const rows: DraftCalcDay[] = []

  for (let day = 1; day <= inputs.days; day++) {
    const draftedBefore = draftedCumulative
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const drafted = peasants * perTickRate
      draftedCumulative += drafted
      army += drafted
      peasants -= drafted
      peasants -= wizardsPerTick
      if (inputs.includeBaseBirthRate) peasants += peasants * BASE_BIRTH_RATE
      peasants += homesBonusPerTick
      if (peasants < 0) peasants = 0
    }
    rows.push({
      day,
      peasants: Math.round(peasants),
      army: Math.round(army),
      draftedCumulative: Math.round(draftedCumulative),
      draftedToday: Math.round(draftedCumulative - draftedBefore),
    })
  }

  return {
    rows,
    modLivingSpace: Math.round(modLivingSpace),
    isOverpopulated,
    combinedDraftMultiplier,
    effectiveDailyRatePct: Math.round(dailyRate * 10000) / 100,
  }
}
