const supabaseService = require("./supabase");
const logger = require("./logger");
const { parseAgeFileChunked: parseAgeFile, summarize } = require("../parsers/ageParser");
const { recalculateBuildLibrary } = require("./buildAgeRecalculator");

async function saveAgeUpdate(updateText, userId, filename) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  updateText = String(updateText)
    .replace(/\u0000/g, "")
    .replace(/\\(?!["\\/bfnrtu])/g, "");

  try {
    const match = filename?.match(/Age[_\s-]?(\d+)/i);
    const ageNumber = match ? parseInt(match[1], 10) : null;
    if (!ageNumber) {
      logger.info(`[AGE UPDATE] Rejected - no age number in filename: ${filename}`);
      return { error: "no_age_number" };
    }

    // An approved record is historical/live state, not a reason to discard a newly
    // uploaded revision. Only reuse an existing pending review; otherwise stage a
    // fresh pending record so administrators can inspect the newly uploaded source.
    const { data: existing, error: existingError } = await supabase
      .from("age_updates")
      .select("id,status")
      .eq("age_number", ageNumber)
      .eq("status", "pending")
      .order("id", { ascending: false })
      .limit(1);

    if (existingError) throw existingError;
    if (existing?.length) {
      return { error: "duplicate", existingId: existing[0].id, status: existing[0].status };
    }

    const parsed = parseAgeFile(updateText);
    const parsedSummary = summarize(parsed);

    // Pending uploads are staged only. Wiki sync occurs only through the approved update path.

    const { data, error } = await supabase.from("age_updates").insert({
      age_number: ageNumber,
      raw_text: updateText,
      source: "discord",
      submitted_by: userId,
      status: "pending"
    }).select().single();

    if (error) throw error;
    logger.info(`[AGE UPDATE SAVED] ID ${data.id} AGE ${ageNumber}`);
    return { ...data, parsedSummary };
  } catch (err) {
    logger.error(`[AGE UPDATE ERROR] ${err.message}`);
    return null;
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function approveAgeUpdate(id, adminId) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  try {
    const { data: update, error: fetchError } = await supabase.from("age_updates").select("*").eq("id", id).eq("status", "pending").single();
    if (fetchError) throw fetchError;

    const parsed = parseAgeFile(update.raw_text);
    const ageNumber = update.age_number;

    // Age 117's prefinal PDF is a change sheet: it lists all races but only the
    // personalities with proposed edits. Preserve unchanged personalities from Age 116.
    // This merge is only allowed for the recognizable Age 117 tabular document and
    // only when the prior age has a full roster; arbitrary partial uploads remain blocked.
    const isAge117ChangeSheet = ageNumber === 117 &&
      /Race\s+Archetype\s+Bonuses/i.test(update.raw_text || "") &&
      /Personality\s+Archetype\s+Bonuses/i.test(update.raw_text || "");
    if (isAge117ChangeSheet && Object.keys(parsed.races || {}).length >= 10) {
      const { data: baselinePersonalities, error: baselineError } = await supabase
        .from("spartan_personality_rules")
        .select("personality,emoji,unique_name,unique_desc,bonuses,start_bonus,spells")
        .eq("age_number", 116);
      if (baselineError) throw baselineError;
      if (baselinePersonalities?.length >= 10) {
        for (const row of baselinePersonalities) {
          if (parsed.personalities[row.personality]) continue;
          parsed.personalities[row.personality] = {
            emoji: row.emoji || null,
            unique_name: row.unique_name || null,
            unique_passive: row.unique_desc || null,
            bonuses: String(row.bonuses || "").split("\n").filter(Boolean),
            starts_with: String(row.start_bonus || "").split("\n").filter(Boolean),
            spells: String(row.spells || "").split(/,\s*/).filter(Boolean),
            inherited_from_age: 116
          };
        }
        logger.info(`[AGE UPDATE MERGE] Age 117 change sheet inherited unchanged personalities from Age 116; roster=${Object.keys(parsed.personalities).length}`);
      }
    }

    // Never replace an age's active rules with an incomplete roster.
    const parsedRaceCount = Object.keys(parsed.races || {}).length;
    const parsedPersonalityCount = Object.keys(parsed.personalities || {}).length;
    const parsedGameCount = [
      parsed.spells, parsed.thievery, parsed.buildings, parsed.science, parsed.game_rules, parsed.dragons, parsed.rituals
    ].reduce((total, section) => total + Object.keys(section || {}).length, 0);
    if (parsedRaceCount < 10 || parsedPersonalityCount < 10 || parsedGameCount < 1) {
      const reason = `Parser found ${parsedRaceCount} races, ${parsedPersonalityCount} personalities and ${parsedGameCount} game-rule entries. A complete ruleset is required; proposed-change documents may omit unchanged entries.`;
      logger.warn(`[AGE APPROVE BLOCKED] ID ${id} AGE ${ageNumber}: incomplete ruleset races=${parsedRaceCount}, personalities=${parsedPersonalityCount}, game_sections=${parsedGameCount}`);
      return { blocked: true, age_number: ageNumber, reason, stats: { races: parsedRaceCount, personalities: parsedPersonalityCount, gameRows: parsedGameCount } };
    }

    // Strict quality gate for the Age 117 three-page PDF table. PDF text extraction
    // can shift wrapped cells into adjacent columns; never activate obviously damaged rows.
    if (isAge117ChangeSheet) {
      const issues = [];
      const expectedRaces = ["Avian","Dark Elf","Dryad","Dwarf","Elf","Faery","Gnome","Halfling","Human","Orc","Undead"];
      const expectedPersonalities = ["The Artisan","The Cleric","The General","The Heretic","The Mystic","The Necromancer","The Rogue","The Sage","The Tactician","The War Hero","The Warrior"];
      for (const name of expectedRaces) if (!parsed.races?.[name]) issues.push(`missing race: ${name}`);
      for (const name of expectedPersonalities) if (!parsed.personalities?.[name]) issues.push(`missing personality: ${name}`);
      for (const [name, race] of Object.entries(parsed.races || {})) {
        const fields = [race.archetype, race.war_doctrine, race.unique_name, race.unique_passive, ...(race.bonuses || []), ...(race.penalties || [])].filter(Boolean).join(" ");
        if (/OR PAGE:|<PARSED TEXT|PAGE:\s*\d+\s*\//i.test(fields)) issues.push(`${name}: PDF page footer leaked into a rule`);
        if (/\b(?:Per|Acre|Efficiency|Damage Received|casualties when attacking and)$/i.test(String(race.penalties || ""))) issues.push(`${name}: truncated penalty`);
        if (/\b(?:and|with|from|of|Per)$/i.test(String(race.bonuses?.slice(-1)[0] || ""))) issues.push(`${name}: truncated bonus`);
        if (!race.unique_name || !race.unique_passive) issues.push(`${name}: missing unique ability or effect`);
      }
      for (const [name, p] of Object.entries(parsed.personalities || {})) {
        if (!p.unique_name || !p.unique_passive) issues.push(`${name}: missing unique ability or effect`);
        if (/\b(?:to the|by|for|of the|target's|effectiveness by)$/i.test(String(p.unique_passive || ""))) issues.push(`${name}: likely truncated unique effect`);
      }
      if (issues.length) {
        const reason = `Age 117 PDF validation failed (${issues.length} issue(s)): ${issues.slice(0, 12).join("; ")}. Nothing was applied. Fix the PDF parser and upload a fresh review.`;
        logger.warn(`[AGE APPROVE BLOCKED] ID ${id} AGE 117: ${reason}`);
        return { blocked: true, age_number: 117, reason, stats: { races: parsedRaceCount, personalities: parsedPersonalityCount, gameRows: parsedGameCount } };
      }
    }

    for (const table of ["spartan_race_rules", "spartan_personality_rules", "spartan_game_rules"]) {
      const { error: deleteError } = await supabase.from(table).delete().eq("age_number", ageNumber);
      if (deleteError) throw deleteError;
    }

    const raceRows = Object.entries(parsed.races || {}).map(([race, data]) => ({
      age_number: ageNumber,
      race,
      emoji: data.emoji || null,
      archetype: data.archetype || null,
      war_doctrine: data.war_doctrine || null,
      unique_name: data.unique_name || null,
      unique_desc: data.unique_passive || null,
      bonuses: safeArray(data.bonuses).join("\n"),
      penalties: safeArray(data.penalties).join("\n"),
      units: JSON.stringify(data.units || {}),
      spells: safeArray(data.spells).join(", ")
    }));

    const personalityRows = Object.entries(parsed.personalities || {}).map(([personality, data]) => ({
      age_number: ageNumber,
      personality,
      emoji: data.emoji || null,
      unique_name: data.unique_name || null,
      unique_desc: data.unique_passive || null,
      bonuses: safeArray(data.bonuses).join("\n"),
      start_bonus: safeArray(data.starts_with).join("\n"),
      spells: safeArray(data.spells).join(", ")
    }));

    const gameRows = [];
    for (const [category, section] of Object.entries({
      spell: parsed.spells,
      ritual: parsed.rituals,
      thievery: parsed.thievery,
      building: parsed.buildings,
      science: parsed.science,
      game: parsed.game_rules
    })) {
      for (const [rule_name, value] of Object.entries(section || {})) {
        gameRows.push({
          age_number: ageNumber,
          category,
          rule_name,
          value: value ?? null,
          description: typeof value === "string" ? value : JSON.stringify(value)
        });
      }
    }

    for (const [name, dragon] of Object.entries(parsed.dragons || {})) {
      for (const effect of safeArray(dragon.effects)) {
        gameRows.push({
          age_number: ageNumber,
          category: "dragon",
          rule_name: name,
          value: effect,
          description: String(effect)
        });
      }
    }

    if (raceRows.length) {
      const { error } = await supabase.from("spartan_race_rules").insert(raceRows);
      if (error) throw error;
    }
    if (personalityRows.length) {
      const { error } = await supabase.from("spartan_personality_rules").insert(personalityRows);
      if (error) throw error;
    }
    if (gameRows.length) {
      const { error } = await supabase.from("spartan_game_rules").insert(gameRows);
      if (error) throw error;
    }

    const { data, error } = await supabase.from("age_updates")
      .update({ status: "approved", approved_by: adminId, approved_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;

    const { error: ageSettingError } = await supabase.from("bot_settings").upsert({
      key: "current_age",
      value: String(ageNumber),
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });
    if (ageSettingError) throw ageSettingError;

    let recalculation = null;
    try {
      recalculation = await recalculateBuildLibrary(ageNumber, id, parsed);
    } catch (err) {
      logger.error(`[AGE BUILD RECALC ERROR] ${err.message}`);
      recalculation = { error: err.message };
    }

    logger.info(`[AGE UPDATE APPROVED] ID ${id} AGE ${ageNumber}; races=${raceRows.length}, personalities=${personalityRows.length}, game_rules=${gameRows.length}`);

    return {
      ...data,
      stats: {
        races: raceRows.length,
        personalities: personalityRows.length,
        gameRows: gameRows.length,
        summary: summarize(parsed),
        recalculation
      },
      parsed
    };
  } catch (err) {
    logger.error(`[AGE APPROVE ERROR] ${err.message}`);
    return null;
  }
}

async function denyAgeUpdate(id, adminId) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("age_updates")
      .update({ status: "rejected", approved_by: adminId, approved_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw error;
    logger.info(`[AGE UPDATE REJECTED] ID ${id} BY ${adminId}`);
    return data;
  } catch (err) {
    logger.error(`[AGE DENY ERROR] ${err.message}`);
    return null;
  }
}

module.exports = { saveAgeUpdate, approveAgeUpdate, denyAgeUpdate };
