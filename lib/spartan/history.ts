export type ProvinceSnapshot = {
  userId?: string | null
  provinceId?: string | null
  kingdomId?: string | null
  observedAt?: string
  age?: number | null
  gameYear?: number | null
  gameTick?: string | null
  source?: string
  sourceId?: string | null
  acres?: number | null
  networth?: number | null
  population?: number | null
  peons?: number | null
  soldiers?: number | null
  offSpecs?: number | null
  defSpecs?: number | null
  elites?: number | null
  thieves?: number | null
  wizards?: number | null
  generals?: number | null
  prisoners?: number | null
  warHorses?: number | null
  offense?: number | null
  defense?: number | null
  defenseHome?: number | null
  mana?: number | null
  stealth?: number | null
  rTpa?: number | null
  oTpa?: number | null
  dTpa?: number | null
  rWpa?: number | null
  oWpa?: number | null
  dWpa?: number | null
  buildEfficiency?: number | null
  wages?: number | null
  rawState?: Record<string, unknown>
  changes?: Record<string, unknown>
}

export type SpartanEvent = {
  userId?: string | null
  provinceId?: string | null
  kingdomId?: string | null
  occurredAt?: string
  age?: number | null
  gameYear?: number | null
  gameTick?: string | null
  eventType: string
  source?: string
  sourceId?: string | null
  attacker?: string | null
  defender?: string | null
  targetKingdom?: string | null
  acresChange?: number
  troopsLost?: number
  thievesLost?: number
  wizardsLost?: number
  peasantsChange?: number
  goldChange?: number
  foodChange?: number
  runesChange?: number
  manaChange?: number
  payload?: Record<string, unknown>
  rawText?: string | null
}

export const HISTORY_METRICS = [
  'acres',
  'networth',
  'population',
  'soldiers',
  'offSpecs',
  'defSpecs',
  'elites',
  'thieves',
  'wizards',
  'offense',
  'defense',
  'mana',
  'stealth',
  'buildEfficiency',
] as const

export type HistoryMetric = (typeof HISTORY_METRICS)[number]

export const LOSS_METRICS = [
  'troopsLost',
  'thievesLost',
  'wizardsLost',
  'acresChange',
] as const

export type LossMetric = (typeof LOSS_METRICS)[number]
