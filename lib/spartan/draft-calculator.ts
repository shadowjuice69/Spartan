// lib/spartan/draft-calculator.ts
// Target-based draft calculator.
// Drafting happens once per Utopia tick (1 real hour). The named draft rate is
// applied to the current peasant pool, then the calculator optionally applies
// the documented base birth rate so the projection can continue to replenish peasants.

export const DRAFT_RATES: Record<string, number> = {
  None: 0,
  Reservist: 0.5,
  Normal: 1.0,
  Aggressive: 1.5,
  Emergency: 2.0,
}

export const BASE_BIRTH_RATE = 0.0205
export const TICKS_PER_DAY = 24

/** Extract Draft Speed / Draft Rate modifiers from stored rule text. */
export function extractDraftMultiplier(...texts: (string | null | undefined)[]): number {
  let mult = 1
  const re = /([+\-\u2212]?\d+(?:\.\d+)?)%\s*Draft\s*(?:Speed|Rate)\b/gi
  for (const text of texts) {
    if (!text) continue
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      const raw = match[1].replace(/\u2212/g, "-")
      mult += Number(raw) / 100
    }
  }
  return mult
}

export interface DraftCalcInputs {
  totalPopulation: number
  currentSoldiers: number
  targetDraftPct: number
  draftRatePct: number
  heroismDraftSpeedPct: number
  raceBonusText?: string | null
  racePenaltyText?: string | null
  personalityBonusText?: string | null
  personalityPenaltyText?: string | null
  patriotismActive: boolean
  patriotismDraftSpeedPct?: number
  ritualDraftPct: number
  includeBaseBirthRate: boolean
  maxTicks: number
}

export interface DraftCalcTick {
  tick: number
  peasants: number
  soldiers: number
  soldiersDrafted: number
  draftPct: number
  remainingToTarget: number
  births: number
}

export interface DraftCalcResult {
  rows: DraftCalcTick[]
  targetSoldiers: number
  startingPeasants: number
  startingSoldiers: number
  combinedModifierPct: number
  effectiveDraftRatePct: number
  initialSoldiersPerTick: number
  targetReached: boolean
  ticksToTarget: number | null
  hoursToTarget: number | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function simulateDraft(inputs: DraftCalcInputs): DraftCalcResult {
  const totalPopulation = Math.max(0, inputs.totalPopulation)
  const currentSoldiers = clamp(Math.floor(inputs.currentSoldiers || 0), 0, totalPopulation)
  const targetDraftPct = clamp(inputs.targetDraftPct || 0, 0, 100)
  const targetSoldiers = Math.round(totalPopulation * targetDraftPct / 100)
  const startingPeasants = Math.max(0, totalPopulation - currentSoldiers)

  const raceMult = extractDraftMultiplier(inputs.raceBonusText, inputs.racePenaltyText)
  const personalityMult = extractDraftMultiplier(inputs.personalityBonusText, inputs.personalityPenaltyText)
  const heroismMult = 1 + (inputs.heroismDraftSpeedPct || 0) / 100
  const patriotismPct = inputs.patriotismActive ? (inputs.patriotismDraftSpeedPct ?? 30) : 0
  const patriotismMult = 1 + patriotismPct / 100
  const ritualMult = 1 + (inputs.ritualDraftPct || 0) / 100

  // Draft modifiers are multiplicative because each is a percentage change to
  // draft speed/rate. This also keeps positive/negative race rules composable.
  const combinedMultiplier = raceMult * personalityMult * heroismMult * patriotismMult * ritualMult
  const effectiveDraftRatePct = Math.max(0, (inputs.draftRatePct || 0) * combinedMultiplier)
  const combinedModifierPct = (combinedMultiplier - 1) * 100

  let peasants = startingPeasants
  let soldiers = currentSoldiers
  const rows: DraftCalcTick[] = []
  let ticksToTarget: number | null = soldiers >= targetSoldiers ? 0 : null

  for (let tick = 1; tick <= Math.max(1, inputs.maxTicks); tick++) {
    if (soldiers >= targetSoldiers || peasants <= 0 || effectiveDraftRatePct <= 0) break

    const before = soldiers
    const soldiersDrafted = Math.min(
      peasants,
      peasants * effectiveDraftRatePct / 100,
      Math.max(0, targetSoldiers - soldiers),
    )

    soldiers += soldiersDrafted
    peasants -= soldiersDrafted

    let births = 0
    if (inputs.includeBaseBirthRate && peasants > 0) {
      births = peasants * BASE_BIRTH_RATE
      peasants += births
    }

    if (ticksToTarget === null && soldiers >= targetSoldiers) {
      ticksToTarget = tick
    }

    rows.push({
      tick,
      peasants: Math.round(peasants),
      soldiers: Math.round(soldiers),
      soldiersDrafted: Math.round(soldiersDrafted),
      draftPct: totalPopulation > 0 ? (soldiers / totalPopulation) * 100 : 0,
      remainingToTarget: Math.max(0, Math.round(targetSoldiers - soldiers)),
      births: Math.round(births),
    })

    if (before === soldiers) break
  }

  return {
    rows,
    targetSoldiers,
    startingPeasants,
    startingSoldiers: currentSoldiers,
    combinedModifierPct,
    effectiveDraftRatePct,
    initialSoldiersPerTick: rows[0]?.soldiersDrafted ?? 0,
    targetReached: ticksToTarget !== null,
    ticksToTarget,
    hoursToTarget: ticksToTarget,
  }
}
