// Science math, taken from the "Science" formulas in the Spartan wiki (Age 116):
//   Science Bonus = (# Books in Type)^(1/2.125) x Science Multiplier x Race Mod x Personality Mod
//                   x Amnesia Effect x Scientific Insights Mod x Libraries Mod
// Race has no effect on the bonus itself in the wiki table (Human only affects scientist spawn rate),
// so "Amnesia / Libraries / anything else" is a single extra multiplier you can calibrate from your page.

export const EXPONENT = 1 / 2.125

export type ScienceCat = 'Economy' | 'Military' | 'Arcane Arts'
export interface ScienceDef { name: string; cat: ScienceCat; mult: number; effect: string }

// Multipliers use the newer value where the wiki shows "old -> new (A115)".
export const SCIENCES: ScienceDef[] = [
  { name: 'Alchemy', cat: 'Economy', mult: 0.0724, effect: 'Income' },
  { name: 'Tools', cat: 'Economy', mult: 0.0524, effect: 'Building Effectiveness' },
  { name: 'Housing', cat: 'Economy', mult: 0.0262, effect: 'Population Limits' },
  { name: 'Production', cat: 'Economy', mult: 0.2172, effect: 'Food & Rune Production' },
  { name: 'Bookkeeping', cat: 'Economy', mult: 0.068, effect: 'Wage Reduction' },
  { name: 'Artisan', cat: 'Economy', mult: 0.04302, effect: 'Construction Time/Cost/Raze Reduction' },
  { name: 'Strategy', cat: 'Military', mult: 0.0367, effect: 'Defensive Military Efficiency' },
  { name: 'Siege', cat: 'Military', mult: 0.0262, effect: 'Battle Gains' },
  { name: 'Tactics', cat: 'Military', mult: 0.0367, effect: 'Offensive Military Efficiency' },
  { name: 'Valor', cat: 'Military', mult: 0.0582, effect: 'Reduced Train Time + Dragon Slaying Strength' },
  { name: 'Heroism', cat: 'Military', mult: 0.0418, effect: 'Draft Speed & Draft Costs Reduction' },
  { name: 'Resilience', cat: 'Military', mult: 0.04401, effect: 'Reduced Military Casualties' },
  { name: 'Crime', cat: 'Arcane Arts', mult: 0.1557, effect: 'Thievery Effectiveness' },
  { name: 'Channeling', cat: 'Arcane Arts', mult: 0.1875, effect: 'Magic Effectiveness' },
  { name: 'Shielding', cat: 'Arcane Arts', mult: 0.0314, effect: 'Reduced Damage from Enemy Thievery & Magic' },
  { name: 'Sorcery', cat: 'Arcane Arts', mult: 0.0314, effect: 'Increased Magic Instant Damage' },
  { name: 'Cunning', cat: 'Arcane Arts', mult: 0.0314, effect: 'Increased Thievery Operation Damage' },
  { name: 'Finesse', cat: 'Arcane Arts', mult: 0.08685, effect: 'Reduced Wizard/Thief Losses on Failed Casts' },
]

// "Science Modifiers" table in the wiki.
export const PERSONALITY_MODS: Record<string, Record<string, number>> = {
  heretic: { Crime: 1.3, Channeling: 1.3 },
  rogue: { Crime: 1.5 },
  mystic: { Channeling: 1.75 },
}
export const SCIENTIFIC_INSIGHTS = 1.1
export const REVELATION = 1.3
export const RACE_SPAWN_MOD: Record<string, number> = { human: 1.25 }

// Age 117 proposal: these sciences are capped at -75% (shown as a 75% reduction).
export const AGE117_CAPPED = new Set(['Bookkeeping', 'Artisan', 'Resilience', 'Shielding', 'Finesse'])
export const AGE117_CAP = 75

export const SCIENTIST_BOOKS_PER_TICK: Record<string, number> = { Recruit: 60, Novice: 80, Graduate: 100, Professor: 120 }

export const norm = (s: string | null | undefined) => String(s || '').toLowerCase().replace(/^the\s+/, '').trim()

export interface Opts { personality: string; scientificInsights: boolean; extraMod: number; age117Caps: boolean }

export const personalityMod = (def: ScienceDef, personality: string) => PERSONALITY_MODS[norm(personality)]?.[def.name] ?? 1

export function rawBonus(def: ScienceDef, books: number, o: Opts): number {
  if (!(books > 0)) return 0
  return Math.pow(books, EXPONENT) * def.mult * personalityMod(def, o.personality) * (o.scientificInsights ? SCIENTIFIC_INSIGHTS : 1) * (o.extraMod > 0 ? o.extraMod : 1)
}

export function scienceBonus(def: ScienceDef, books: number, o: Opts): { value: number; capped: boolean } {
  const v = rawBonus(def, books, o)
  if (o.age117Caps && AGE117_CAPPED.has(def.name) && v > AGE117_CAP) return { value: AGE117_CAP, capped: true }
  return { value: v, capped: false }
}

/** What the "other modifiers" multiplier must be for the formula to reproduce an effect you can see in-game. */
export function impliedExtraMod(def: ScienceDef, books: number, shownEffect: number, o: Opts): number | null {
  if (!(books > 0) || !(shownEffect > 0)) return null
  const base = rawBonus(def, books, { ...o, extraMod: 1 })
  return base > 0 ? Math.abs(shownEffect) / base : null
}

export const spawnRate = (race: string, universitiesMod: number, revelation: boolean) =>
  2 * (RACE_SPAWN_MOD[norm(race)] ?? 1) * (universitiesMod > 0 ? universitiesMod : 1) * (revelation ? REVELATION : 1)

export const defByName = (name: string) => SCIENCES.find((s) => s.name === name) || SCIENCES[0]