/**
 * Canonical Thievery engine v2 — ported directly from utopia-wiki.html's "Thievery Formulas" and
 * "Thievery Yield Formula" sections. Two real, separate sub-systems exist in the wiki and both are
 * implemented here rather than picking one:
 *
 *   (1) OP SUCCESS / CATCH CHANCE — governs whether a sabotage op succeeds and how many thieves you lose.
 *       Raw TPA = Thieves / Land
 *       Mod TPA = Raw TPA × Invisibility × Crime Science × Race Mod × Thieves' Dens Bonus × Honor Bonus × Ritual Bonus
 *       Op Success = based on Off Mod TPA / Def Mod TPA ratio
 *       NOTE (judgment call): the wiki's Mod TPA line does NOT list a Personality Mod term, unlike the
 *       Yield formula below which explicitly separates Race Mod × Personality Mod. Read literally, that
 *       means personality's TPA bonus (Heretic +35%, Rogue +25%) affects Yield but not the success ratio.
 *       Flagging this rather than silently folding personality into Race Mod here.
 *
 *   (2) THIEVERY YIELD — governs how much you actually gain from a successful op.
 *       Yield = Thieves Sent × Relative Size × Gains/Thief × (1 − Resources Lost) × Race Mod × Personality Mod
 *               × Science Mod × Guile × Cunning × Target Race Mod × Target Personality Mod
 *               × Target Illuminate Shadows × (1 − Target Watchtowers) × (1 − Target Shielding) × Stance
 *       Relative Size = MIN(Target NW / Self NW, Self NW / Target NW) + War Bonus
 *         — "War Bonus" value for THIS specific formula isn't stated anywhere else in the wiki (other War
 *           Bonus entries found are for unrelated formulas — Construction Time, Attack Time). Defaulted to
 *           0 here rather than guessed; flag this to the user if a real value surfaces later.
 *       Optimal Thieves to Send = (Target Resources × Max% of Total) / Gains Per Thief / Race Mod
 *
 * Watch Towers have TWO distinct, separately-rated effects, both implemented:
 *   - Yield reduction:  %WatchTowers × 2.4, capped 62.5%  (matches "Watch Towers reduce Yield by up to 62.5%")
 *   - Catch chance:     %WatchTowers × 1.92 (reference table separately caps this overall effect at 50%)
 *
 * Thieves' Dens have TWO distinct effects (ASSUMPTION flagged below on the TPA-bonus rate):
 *   - Loss reduction:  %Dens × 3.6, capped 90%  (explicit formula in the wiki)
 *   - TPA bonus:       ASSUMED %Dens × 3, capped 75% — the wiki states the 75% cap but never gives an
 *                       explicit per-1% rate for the TPA-bonus side the way it does for loss reduction;
 *                       3%/point is inferred by matching the reference table's "Base Effect (per 1%)"
 *                       column pattern used for every other multi-effect building row. Flag as inferred,
 *                       not confirmed, if exact accuracy here matters.
 */

// ---- Op table -------------------------------------------------------------
// capOow/capWar = Max % of target's total resource stealable (out-of-war / war)
// perOow/perWar = Gains per thief sent (out-of-war / war)
// lost = fraction of the gross stolen amount that never reaches you (e.g. horses/prisoners: keep half)
// approx: true = wiki itself marks the figure with "~" (approximate, not exact)
// warDocumented: false = wiki lists no war-time figure ("—") for this op
const OPS = [
  { name: "Rob the Granaries", resource: "Food",      capOow: .315,  capWar: .46,  perOow: 95,    perWar: 135, lost: 0,    unit: "bushels",  warDocumented: true },
  { name: "Rob the Vaults",    resource: "Gold",       capOow: .052,  capWar: .14,  perOow: 40,    perWar: 106, lost: 0,    unit: "gc",        warDocumented: true },
  { name: "Rob the Towers",    resource: "Runes",      capOow: .245,  capWar: .35,  perOow: 18.2,  perWar: 26,  lost: 0,    unit: "runes",     warDocumented: true },
  { name: "Kidnapping",        resource: "Peasants",   capOow: .0185, capWar: .04,  perOow: .132,  perWar: .285,lost: 0,    unit: "peasants",  warDocumented: true },
  { name: "Steal Horses",      resource: "War Horses", capOow: .1275, capWar: .136, perOow: .094,  perWar: .10, lost: 0,    unit: "horses",    warDocumented: true },
  { name: "Free Prisoners",    resource: "Prisoners",  capOow: .12,   capWar: .17,  perOow: .06,   perWar: .07, lost: 0.50, unit: "prisoners", warDocumented: true },
  // Newly added from the wiki — were missing from the site's calc entirely:
  { name: "Steal War Horses",  resource: "War Horses",   capOow: .20,   capWar: .20,   perOow: .35,   perWar: .35,  lost: 0.50, unit: "horses",    warDocumented: false },
  { name: "Night Strike",      resource: "Soldiers",     capOow: .1625, capWar: .1625, perOow: .67,   perWar: 1.0,  lost: 0,    unit: "soldiers",  warDocumented: true, approx: true },
  { name: "Greater Arson",     resource: "Buildings",    capOow: .06,   capWar: .06,   perOow: .0045, perWar: .0045,lost: 0,    unit: "buildings", warDocumented: false, approx: true },
  { name: "Assassinate Wizards", resource: "Wizards",    capOow: .012,  capWar: .012,  perOow: .006,  perWar: .006, lost: 0,    unit: "wizards",   warDocumented: false, approx: true },
];

// ---- Race / personality modifiers (from spartan_race_rules / spartan_personality_rules) ----
// Race Mod — used identically in BOTH the success ratio (Mod TPA) and the Yield formula, since the
// wiki refers to a single "Race Mod" concept in both formula lines, not two separate values.
const RACE_TPA = {
  halfling: 1.30, // +30% Thievery Effectiveness (TPA)
  faery:    1.20, // +20% WPA/TPA
};

// Personality Mod — ONLY applied in the Yield formula's dedicated Personality Mod slot (see judgment
// call above re: Mod TPA omitting personality entirely).
const PERSONALITY_TPA = {
  heretic: 1.35, // +35% Offensive TPA
  rogue:   1.25, // +25% TPA
};

// Crime Science effectiveness multiplier — boosts whatever crime-science % bonus the player has invested
// (from Build Library), NOT a flat TPA bonus. Feeds the Yield formula's "Science Mod" slot.
const CRIME_SCIENCE_PERSONALITY_MULT = {
  heretic: 1.3,
  rogue:   1.5,
};

// Target-side "damage taken from sabotage" — increases attacker's yield against that target.
const RACE_SABOTAGE_TAKEN = {
  darkelf: 1.30, // +30% Damage taken from sabotage
  orc:     1.20, // +20% Instant Damage from Sabotage and Sorcery
};

function norm(key) { return String(key || "").toLowerCase().replace(/[^a-z]/g, ""); }
function raceTPAMult(raceKey) { return RACE_TPA[norm(raceKey)] || 1.0; }
function personalityTPAMult(persKey) { return PERSONALITY_TPA[norm(persKey)] || 1.0; }
function crimeSciencePersonalityMult(persKey) { return CRIME_SCIENCE_PERSONALITY_MULT[norm(persKey)] || 1.0; }
function raceSabotageTakenMult(raceKey) { return RACE_SABOTAGE_TAKEN[norm(raceKey)] || 1.0; }

function getOp(name) {
  return OPS.find(o => o.name.toLowerCase() === String(name || "").toLowerCase()) || OPS[0];
}

// ---- (1) Op Success / catch chance sub-system ------------------------------

function densTPABonus(densPct) {
  // ASSUMPTION flagged in the header comment: inferred rate of 3%/point, capped 75%.
  return 1 + Math.min((densPct || 0) * 3, 75) / 100;
}
function densLossReduction(densPct) {
  // Confirmed formula: %Dens × 3.6, capped 90%. Returns a fraction (0-0.9) of losses REMOVED.
  return Math.min((densPct || 0) * 3.6, 90) / 100;
}
function watchtowerCatchChance(wtPct) {
  // Confirmed rate 1.92%/point; reference table separately caps overall effect at 50%.
  return Math.min((wtPct || 0) * 1.92, 50) / 100;
}
function watchtowerYieldReduction(wtPct) {
  // Confirmed: %WatchTowers × 2.4, capped 62.5% — this is the SAME effect as the Yield formula's
  // "(1 − Target Watchtowers)" term; kept as one function so both sub-systems can't drift apart.
  return Math.min((wtPct || 0) * 2.4, 62.5) / 100;
}

function getRating(ratio) {
  if (ratio >= 4)   return { label: "VERY STRONG", emoji: "🟢" };
  if (ratio >= 3)   return { label: "STRONG",      emoji: "🟢" };
  if (ratio >= 2)   return { label: "DECENT",      emoji: "🟡" };
  if (ratio >= 1.5) return { label: "RISKY",       emoji: "🟠" };
  return                 { label: "POOR",          emoji: "🔴" };
}

/**
 * Mod TPA = Raw TPA × Invisibility × Crime Science × Race Mod × Thieves' Dens Bonus × Honor Bonus × Ritual Bonus
 * crimeScienceBonusPct: the player's own invested crime-science bonus (e.g. 0.15 for +15%), NOT the
 * personality multiplier — pass crimeSciencePersonalityMult(personality) separately if you want the
 * personality boost applied to how effective that invested science is.
 */
function calcModTPA({ thieves, land, invisibility = false, crimeScienceBonusPct = 0, personalityScienceMult = 1,
                       race, densPct = 0, honorMod = 1, ritualMod = 1 }) {
  const rawTPA = thieves / Math.max(land, 1);
  const invisMod = invisibility ? 1.10 : 1.0;
  const crimeScienceMod = 1 + (crimeScienceBonusPct * personalityScienceMult);
  const raceMod = raceTPAMult(race);
  const densMod = densTPABonus(densPct);
  return rawTPA * invisMod * crimeScienceMod * raceMod * densMod * honorMod * ritualMod;
}

function calcOpSuccess({ myModTPA, theirModTPA, theirWatchTowerPct = 0 }) {
  const ratio = theirModTPA > 0 ? myModTPA / theirModTPA : 999;
  const rating = getRating(ratio);
  const catchChance = watchtowerCatchChance(theirWatchTowerPct);
  return { ratio: Number(ratio.toFixed(2)), rating, catchChance };
}

// ---- (2) Thievery Yield sub-system -----------------------------------------

/**
 * War Bonus for Relative Size defaulted to 0 — not documented anywhere for this specific formula.
 * Flag to the user if a real value is found; do not guess a nonzero number.
 */
function calculateThievery({
  opName, war = false, available = 0, targetResource = 0,
  racialMod = 1, personalityMod = 1, scienceMod = 1,
  watchTowers = 0, selfNW = 1, targetNW = 1, relativeSizeWarBonus = 0,
  targetRaceMod = 1, targetPersonalityMod = 1,
  guile = 1, cunning = 1, targetIlluminate = 1, targetShielding = 0, stance = 1,
}) {
  const op = getOp(opName);
  const cap = war ? op.capWar : op.capOow;
  const per = war ? op.perWar : op.perOow;
  const relativeSize = Math.min(targetNW / Math.max(selfNW, 1), selfNW / Math.max(targetNW, 1)) + relativeSizeWarBonus;
  const watchYieldReduction = watchtowerYieldReduction(watchTowers);

  const perThieveYield = relativeSize * per * (1 - op.lost) * racialMod * personalityMod * scienceMod
    * guile * cunning * targetRaceMod * targetPersonalityMod * targetIlluminate
    * (1 - watchYieldReduction) * (1 - targetShielding) * stance;

  const maxGross = targetResource * cap;
  const rawNeed = Math.ceil(maxGross / Math.max(per * racialMod, Number.EPSILON));
  const recommended = Math.max(0, rawNeed);
  const actualSend = Math.min(recommended, Math.max(0, available));
  const theoreticalGross = Math.min(maxGross, actualSend * per * racialMod);
  const estimatedNet = Math.max(0, theoreticalGross * (1 - op.lost) * relativeSize * racialMod * personalityMod
    * scienceMod * guile * cunning * targetRaceMod * targetPersonalityMod * targetIlluminate
    * (1 - watchYieldReduction) * (1 - targetShielding) * stance);

  return {
    op: op.name, resource: op.resource, unit: op.unit, cap, per, relativeSize,
    watchYieldReduction, maxGross, recommended, actualSend, theoreticalGross,
    estimatedNet: war && !op.warDocumented ? null : estimatedNet,
    perThieveYield, capReached: actualSend >= recommended,
    warDocumented: op.warDocumented, approx: !!op.approx,
  };
}

/** Resolves race/personality keys into every modifier both sub-systems need. */
function resolveModifiers({ myRace, myPersonality, theirRace, crimeScienceBonusPct = 0 }) {
  return {
    racialMod: raceTPAMult(myRace),
    personalityMod: personalityTPAMult(myPersonality),
    scienceMod: 1 + (crimeScienceBonusPct * crimeSciencePersonalityMult(myPersonality)),
    targetRaceMod: raceSabotageTakenMult(theirRace),
    targetPersonalityMod: 1.0, // no confirmed personality-side "damage taken" modifier in the wiki
  };
}

module.exports = {
  OPS, getOp, calculateThievery, resolveModifiers, calcModTPA, calcOpSuccess, getRating,
  densTPABonus, densLossReduction, watchtowerCatchChance, watchtowerYieldReduction,
  raceTPAMult, personalityTPAMult, crimeSciencePersonalityMult, raceSabotageTakenMult,
};
