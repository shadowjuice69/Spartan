const supabaseService = require("./supabase");
const logger = require("./logger");
const { parseAgeFileChunked: parseAgeFile, summarize } = require("../parsers/ageParser");
const { parse117 } = require("../parsers/age117");

// Age 117 change sheets must go straight to the dedicated Age 117 parser.
// Other ages retain the generic full-ruleset parser.
function parseSubmittedAge(rawText, ageNumber) {
  return Number(ageNumber) === 117 ? parse117(rawText) : parseAgeFile(rawText);
}
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
      .select("id,status,raw_text")
      .eq("age_number", ageNumber)
      .eq("status", "pending")
      .order("id", { ascending: false })
      .limit(1);

    if (existingError) throw existingError;
    const parsed = parseSubmittedAge(updateText, ageNumber);
    const parsedSummary = buildReviewSummary(parsed);
    if (existing?.length) {
      const pending = existing[0];
      // Refresh an older pending review when a newly uploaded PDF extracts to different text.
      if (String(pending.raw_text || '') === updateText) {
        return { error: 'duplicate', existingId: pending.id, status: pending.status, parsedSummary, parsedReady: Boolean(summarize(parsed)) };
      }
      const updated = await supabase.from('age_updates')
        .update({ raw_text: updateText, source: 'discord', submitted_by: userId })
        .eq('id', pending.id).eq('status', 'pending').select().single();
      if (updated.error) throw updated.error;
      logger.info('[AGE UPDATE REFRESHED] ID ' + updated.data.id + ' AGE ' + ageNumber);
      return { ...updated.data, parsedSummary, parsedReady: Boolean(summarize(parsed)), refreshed: true };
    }

    const { data, error } = await supabase.from('age_updates').insert({
      age_number: ageNumber,
      raw_text: updateText,
      source: 'discord',
      submitted_by: userId,
      status: 'pending'
    }).select().single();

    if (error) throw error;
    logger.info('[AGE UPDATE SAVED] ID ' + data.id + ' AGE ' + ageNumber);
    return { ...data, parsedSummary, parsedReady: Boolean(summarize(parsed)) };
  } catch (err) {
    logger.error(`[AGE UPDATE ERROR] ${err.message}`);
    return null;
  }
}

function buildReviewSummary(parsed) {
  const lines = [summarize(parsed) || "No structured changes detected."];
  const races = Object.entries(parsed.races || {});
  const personalities = Object.entries(parsed.personalities || {});
  if (races.length) {
    lines.push("", "**Race details**");
    for (const [name, row] of races.slice(0, 11)) {
      const details = [
        row.archetype ? "Archetype: " + row.archetype : null,
        row.war_doctrine ? "Doctrine: " + row.war_doctrine : null,
        row.unique_name ? "Ability: " + row.unique_name : null,
        row.unique_passive ? String(row.unique_passive).replace(/^Unique Passive\s*[-:]\s*/i, "") : null
      ].filter(Boolean);
      lines.push("• **" + name + "**" + (details.length ? " — " + details.join(" | ") : ""));
    }
  }
  if (personalities.length) {
    lines.push("", "**Personality details**");
    for (const [name, row] of personalities.slice(0, 11)) {
      const details = [
        row.archetype ? "Archetype: " + row.archetype : null,
        row.unique_name ? "Ability: " + row.unique_name : null,
        row.unique_passive ? String(row.unique_passive).replace(/^Unique Passive\s*[-:]\s*/i, "") : null
      ].filter(Boolean);
      lines.push("• **" + name + "**" + (details.length ? " — " + details.join(" | ") : ""));
    }
  }
  const otherSections = [
    ["Game rules", parsed.game_rules],
    ["Spells", parsed.spells],
    ["Rituals", parsed.rituals],
    ["Thievery", parsed.thievery],
    ["Science", parsed.science],
    ["Buildings", parsed.buildings],
    ["Dragons", parsed.dragons]
  ];
  for (const [label, section] of otherSections) {
    const entries = Object.entries(section || {});
    if (!entries.length) continue;
    lines.push("", "**" + label + " preview**");
    for (const [name, value] of entries.slice(0, 6)) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      lines.push("• " + name + ": " + String(text || "").slice(0, 180));
    }
    if (entries.length > 6) lines.push("• …and " + (entries.length - 6) + " more");
  }
  return lines.join("\n");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// Proposed Age 117 PDFs omit unchanged sections. Start with the verified Age 116
// game-rule baseline, then overlay the parsed Age 117 entries by category/name.
// This prevents the atomic replacement from deleting entire unchanged sections.
async function mergeAge117GameBaseline(supabase, parsed) {
  const { data: baselineRows, error } = await supabase
    .from("spartan_game_rules")
    .select("category,rule_name,value,description")
    .eq("age_number", 116);
  if (error) throw error;
  if (!Array.isArray(baselineRows) || baselineRows.length < 20) {
    throw new Error("Age 117 apply blocked: verified Age 116 game-rule baseline is missing or incomplete.");
  }

  const sectionFor = {
    spell: "spells",
    thievery: "thievery",
    building: "buildings",
    science: "science",
    game: "game_rules"
  };
  for (const row of baselineRows) {
    const category = String(row.category || "").toLowerCase();
    const value = row.value ?? row.description ?? "";
    if (category === "dragon") {
      const rawName = String(row.rule_name || "");
      const name = /sapphire/i.test(rawName) ? "Sapphire Dragons" :
        /dragon/i.test(rawName) ? rawName : rawName + " Dragon";
      if (!parsed.dragons[name]) {
        parsed.dragons[name] = { effects: [String(value)].filter(Boolean), inherited_from_age: 116 };
      }
      continue;
    }
    if (category === "ritual") {
      const name = String(row.rule_name || "");
      if (!parsed.rituals[name]) {
        parsed.rituals[name] = { effects: [String(value)].filter(Boolean), inherited_from_age: 116 };
      }
      continue;
    }
    const sectionName = sectionFor[category];
    if (!sectionName) continue;
    if (!parsed[sectionName] || typeof parsed[sectionName] !== "object") parsed[sectionName] = {};
    if (!Object.prototype.hasOwnProperty.call(parsed[sectionName], row.rule_name)) {
      parsed[sectionName][row.rule_name] = value;
    }
  }

  logger.info(
    "[AGE UPDATE MERGE] Age 117 merged verified Age 116 baseline; " +
    "spells=" + Object.keys(parsed.spells || {}).length +
    ", thievery=" + Object.keys(parsed.thievery || {}).length +
    ", buildings=" + Object.keys(parsed.buildings || {}).length +
    ", science=" + Object.keys(parsed.science || {}).length +
    ", game=" + Object.keys(parsed.game_rules || {}).length +
    ", rituals=" + Object.keys(parsed.rituals || {}).length +
    ", dragons=" + Object.keys(parsed.dragons || {}).length
  );
}

async function approveAgeUpdate(id, adminId) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  try {
    const { data: update, error: fetchError } = await supabase.from("age_updates").select("*").eq("id", id).eq("status", "pending").single();
    if (fetchError) throw fetchError;

    const parsed = parseSubmittedAge(update.raw_text, update.age_number);
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

    // Merge omitted unchanged Age 117 sections from the verified Age 116 baseline
    // before validation and before the atomic replacement payload is built.
    if (isAge117ChangeSheet) await mergeAge117GameBaseline(supabase, parsed);

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

    // Build and validate all rows before touching live rules. Replacement is performed
    // by a single PostgreSQL RPC transaction below, so a failed insert rolls back deletes.
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

    if (!raceRows.length || !personalityRows.length || !gameRows.length) {
      throw new Error("Refusing to apply an age update with an empty rules section.");
    }

    const { error: atomicApplyError } = await supabase.rpc("spartan_apply_age_update_atomic", {
      p_age_number: ageNumber,
      p_update_id: id,
      p_admin_id: String(adminId),
      p_race_rows: raceRows,
      p_personality_rows: personalityRows,
      p_game_rows: gameRows
    });
    if (atomicApplyError) throw atomicApplyError;

    const { data, error } = await supabase.from("age_updates")
      .select("*").eq("id", id).eq("status", "approved").single();
    if (error) throw error;

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
