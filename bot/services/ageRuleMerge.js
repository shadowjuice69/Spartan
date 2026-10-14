'use strict';

const { parseAgeChangeText } = require('../parsers/ageChangeParser');

const RULE_SECTIONS = {
  spell: 'spells',
  ritual: 'rituals',
  thievery: 'thievery',
  building: 'buildings',
  science: 'science',
  game: 'game_rules'
};

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}
function asArray(value) { return Array.isArray(value) ? value : value == null || value === '' ? [] : [String(value)]; }
function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try { const result = JSON.parse(value); return result && typeof result === 'object' ? result : {}; } catch { return {}; }
}
function entityFromRace(row) {
  return {
    emoji: row.emoji || null, archetype: row.archetype || null,
    war_doctrine: row.war_doctrine || null, unique_name: row.unique_name || null,
    unique_passive: row.unique_desc || null, bonuses: splitLines(row.bonuses),
    penalties: splitLines(row.penalties), units: parseObject(row.units),
    spells: String(row.spells || '').split(/\s*,\s*/).filter(Boolean)
  };
}
function entityFromPersonality(row) {
  return {
    emoji: row.emoji || null, unique_name: row.unique_name || null,
    unique_passive: row.unique_desc || null, bonuses: splitLines(row.bonuses),
    starts_with: splitLines(row.start_bonus),
    spells: String(row.spells || '').split(/\s*,\s*/).filter(Boolean)
  };
}
function entityToRaceRow(name, value, ageNumber) {
  return {
    age_number: ageNumber, race: name, emoji: value.emoji || null,
    archetype: value.archetype || null, war_doctrine: value.war_doctrine || null,
    unique_name: value.unique_name || null, unique_desc: value.unique_passive || null,
    bonuses: asArray(value.bonuses).join('\n'), penalties: asArray(value.penalties).join('\n'),
    units: JSON.stringify(value.units || {}), spells: asArray(value.spells).join(', ')
  };
}
function entityToPersonalityRow(name, value, ageNumber) {
  return {
    age_number: ageNumber, personality: name, emoji: value.emoji || null,
    unique_name: value.unique_name || null, unique_desc: value.unique_passive || null,
    bonuses: asArray(value.bonuses).join('\n'), start_bonus: asArray(value.starts_with).join('\n'),
    spells: asArray(value.spells).join(', ')
  };
}
function mergeEntity(base, change, fields) {
  const out = { ...(base || {}) };
  for (const field of fields) {
    const value = change?.[field];
    if (Array.isArray(value)) {
      if (value.length) out[field] = value.slice();
    } else if (value && typeof value === 'object') {
      if (Object.keys(value).length) out[field] = { ...(out[field] || {}), ...value };
    } else if (value !== null && value !== undefined && value !== '') {
      out[field] = value;
    }
  }
  return out;
}
function categoryForRemoved(item) {
  const category = String(item.category || '').toLowerCase();
  if (category === 'race' || category === 'personality') return category;
  if (category === 'spell') return 'spells';
  if (category === 'ritual') return 'rituals';
  if (category === 'building') return 'buildings';
  if (category === 'thievery') return 'thievery';
  if (category === 'science') return 'science';
  if (category === 'dragon') return 'dragons';
  if (category === 'game_rule') return 'game_rules';
  return null;
}
function applyRemovals(merged, removed) {
  for (const item of removed || []) {
    const section = categoryForRemoved(item);
    const wanted = String(item.name || '').toLowerCase();
    if (section && merged[section]) {
      for (const key of Object.keys(merged[section])) {
        const value = merged[section][key];
        const comparable = String(key).toLowerCase();
        if (comparable === wanted || comparable.startsWith(wanted + ' ') || comparable.startsWith(wanted + ':')) delete merged[section][key];
        else if (typeof value === 'string' && value.toLowerCase().startsWith(wanted + ':')) delete merged[section][key];
      }
      continue;
    }

    // Change logs can remove a value inside a race/personality rather than a whole rule row.
    const entityName = String(item.entity || '').toLowerCase();
    if (!entityName) continue;
    for (const sectionName of ['races', 'personalities']) {
      for (const [key, entity] of Object.entries(merged[sectionName] || {})) {
        if (key.toLowerCase() !== entityName && key.replace(/^The\s+/i, '').toLowerCase() !== entityName) continue;
        for (const field of ['bonuses', 'penalties', 'spells', 'starts_with']) {
          if (Array.isArray(entity[field])) entity[field] = entity[field].filter((value) => !String(value).toLowerCase().includes(wanted));
        }
        for (const field of ['unique_name', 'unique_passive', 'archetype', 'war_doctrine']) {
          if (typeof entity[field] === 'string' && entity[field].toLowerCase().includes(wanted)) entity[field] = null;
        }
      }
    }
  }
}

async function loadBaseline(supabase, ageNumber) {
  const baselineAge = Number(ageNumber) - 1;
  if (!Number.isInteger(baselineAge) || baselineAge < 1) throw new Error('Cannot determine the previous-age baseline');
  const [racesResult, personalitiesResult, gameResult] = await Promise.all([
    supabase.from('spartan_race_rules').select('race,emoji,archetype,war_doctrine,unique_name,unique_desc,bonuses,penalties,units,spells').eq('age_number', baselineAge),
    supabase.from('spartan_personality_rules').select('personality,emoji,unique_name,unique_desc,bonuses,start_bonus,spells').eq('age_number', baselineAge),
    supabase.from('spartan_game_rules').select('category,rule_name,value,description').eq('age_number', baselineAge)
  ]);
  for (const result of [racesResult, personalitiesResult, gameResult]) if (result.error) throw result.error;
  if (!Array.isArray(racesResult.data) || racesResult.data.length < 10) throw new Error('Verified baseline is missing/incomplete: race rules for Age ' + baselineAge);
  if (!Array.isArray(personalitiesResult.data) || personalitiesResult.data.length < 10) throw new Error('Verified baseline is missing/incomplete: personality rules for Age ' + baselineAge);
  if (!Array.isArray(gameResult.data) || gameResult.data.length < 10) throw new Error('Verified baseline is missing/incomplete: game rules for Age ' + baselineAge);

  const baseline = { races: {}, personalities: {}, buildings: {}, spells: {}, thievery: {}, game_rules: {}, dragons: {}, science: {}, rituals: {} };
  for (const row of racesResult.data) baseline.races[row.race] = entityFromRace(row);
  for (const row of personalitiesResult.data) baseline.personalities[row.personality] = entityFromPersonality(row);
  for (const row of gameResult.data) {
    const category = String(row.category || '').toLowerCase();
    let value = row.value ?? row.description ?? '';
    if (typeof value === 'string') {
      try {
        const decoded = JSON.parse(value);
        if (decoded && typeof decoded === 'object') value = decoded;
      } catch {}
    }
    if (category === 'dragon') {
      const name = /sapphire/i.test(row.rule_name) ? 'Sapphire Dragons' : /dragon/i.test(row.rule_name) ? row.rule_name : row.rule_name + ' Dragon';
      const existing = baseline.dragons[name] || (baseline.dragons[name] = { effects: [] });
      const effects = value && typeof value === 'object' && Array.isArray(value.effects) ? value.effects : [value];
      existing.effects.push(...effects.filter((effect) => effect != null && effect !== '').map(String));
    } else if (category === 'ritual') {
      const name = String(row.rule_name || '');
      const effects = value && typeof value === 'object' && Array.isArray(value.effects) ? value.effects : [value];
      baseline.rituals[name] = { effects: effects.filter((effect) => effect != null && effect !== '').map(String) };
    } else if (RULE_SECTIONS[category]) {
      baseline[RULE_SECTIONS[category]][row.rule_name] = value;
    }
  }
  return { age: baselineAge, source: 'spartan_rules_tables', rules: baseline };
}
function overlayGameSection(base, changes) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(changes || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = { ...(out[key] || {}), ...value };
    else if (value !== null && value !== undefined && value !== '') out[key] = value;
  }
  return out;
}
function isChangeSheet(rawText, ageNumber) {
  return Number.isInteger(Number(ageNumber)) && /\b(?:proposed\s+changes|general\s+changes|changes\s+from\s+existing|change\s+log)\b/i.test(String(rawText || ''));
}
function mergeRules(baseline, changes) {
  const merged = {
    races: { ...baseline.races }, personalities: { ...baseline.personalities },
    buildings: { ...baseline.buildings }, spells: { ...baseline.spells },
    thievery: { ...baseline.thievery }, game_rules: { ...baseline.game_rules },
    dragons: { ...baseline.dragons }, science: { ...baseline.science }, rituals: { ...baseline.rituals }
  };
  const expectedRaces = ['Avian','Dark Elf','Dryad','Dwarf','Elf','Faery','Gnome','Halfling','Human','Orc','Undead'];
  const expectedPersonalities = ['The Artisan','The General','The Heretic','The Mystic','The Necromancer','The Cleric','The Rogue','The Tactician','The Warrior','The War Hero','The Sage'];
  // A full Age 117 table is authoritative for each listed entity. Empty cells mean
  // the old value was removed; they must not silently inherit Age 116 values.
  const completeRaceTable = expectedRaces.every((name) => changes.races && Object.prototype.hasOwnProperty.call(changes.races, name));
  const completePersonalityTable = expectedPersonalities.every((name) => changes.personalities && Object.prototype.hasOwnProperty.call(changes.personalities, name));
  for (const [name, value] of Object.entries(changes.races || {})) {
    merged.races[name] = completeRaceTable
      ? { ...(baseline.races[name] || {}), ...value, emoji: value.emoji || baseline.races[name]?.emoji || null }
      : mergeEntity(merged.races[name], value, ['emoji','archetype','war_doctrine','unique_name','unique_passive','bonuses','penalties','units','spells']);
  }
  for (const [name, value] of Object.entries(changes.personalities || {})) {
    merged.personalities[name] = completePersonalityTable
      ? { ...(baseline.personalities[name] || {}), ...value, emoji: value.emoji || baseline.personalities[name]?.emoji || null }
      : mergeEntity(merged.personalities[name], value, ['emoji','archetype','unique_name','unique_passive','bonuses','starts_with','spells']);
  }
  for (const section of ['buildings','spells','thievery','game_rules','science']) merged[section] = overlayGameSection(merged[section], changes[section]);
  for (const [name, value] of Object.entries(changes.rituals || {})) merged.rituals[name] = value;
  const age117DragonTable = ['Emerald Dragon', 'Ruby Dragon', 'Sapphire Dragons', 'Topaz Dragon'];
  // When the source explicitly supplies all four Age 117 dragon rows, treat that
  // section as authoritative so an omitted Age 116 dragon cannot leak forward.
  if (age117DragonTable.every(name => Object.prototype.hasOwnProperty.call(changes.dragons || {}, name)) &&
      !Object.prototype.hasOwnProperty.call(changes.dragons || {}, 'Amethyst Dragon')) {
    merged.dragons = { ...changes.dragons };
  } else {
    for (const [name, value] of Object.entries(changes.dragons || {})) merged.dragons[name] = value;
  }
  applyRemovals(merged, changes.removed);
  return merged;
}
function toRows(ageNumber, merged) {
  const races = Object.entries(merged.races || {}).map(([name, value]) => entityToRaceRow(name, value, ageNumber));
  const personalities = Object.entries(merged.personalities || {}).map(([name, value]) => entityToPersonalityRow(name, value, ageNumber));
  const game = [];
  for (const [category, section] of Object.entries({
    spell: merged.spells, ritual: merged.rituals, thievery: merged.thievery,
    building: merged.buildings, science: merged.science, game: merged.game_rules
  })) {
    for (const [rule_name, value] of Object.entries(section || {})) {
      game.push({ age_number: ageNumber, category, rule_name, value, description: typeof value === 'string' ? value : JSON.stringify(value) });
    }
  }
  for (const [name, dragon] of Object.entries(merged.dragons || {})) {
    for (const effect of asArray(dragon?.effects)) game.push({ age_number: ageNumber, category: 'dragon', rule_name: name, value: effect, description: String(effect) });
  }
  return { races, personalities, game };
}
function validateMerged(merged, ageNumber, rawText, baseline) {
  const issues = [];
  if (Object.keys(merged.races || {}).length < 10) issues.push('fewer than 10 race rules');
  if (Object.keys(merged.personalities || {}).length < 10) issues.push('fewer than 10 personality rules');
  if (!Object.keys(merged.game_rules || {}).length && !Object.keys(merged.spells || {}).length && !Object.keys(merged.rituals || {}).length && !Object.keys(merged.thievery || {}).length) issues.push('no game-rule entries');
  if (isChangeSheet(rawText, ageNumber) && !baseline) issues.push('change sheet has no verified previous-age baseline');
  if (Number(ageNumber) === 117) {
    for (const name of ['Avian','Dark Elf','Dryad','Dwarf','Elf','Faery','Gnome','Halfling','Human','Orc','Undead']) if (!merged.races[name]) issues.push('missing race: ' + name);
    for (const name of ['The Artisan','The General','The Heretic','The Mystic','The Necromancer','The Cleric','The Rogue','The Tactician','The Warrior','The War Hero','The Sage']) if (!merged.personalities[name]) issues.push('missing personality: ' + name);
    if (Object.keys(merged.rituals || {}).length < 6) issues.push('fewer than 6 rituals after merge');
    if (Object.keys(merged.dragons || {}).length < 4) issues.push('fewer than 4 dragons after merge');
    if (/^\s*Race\s+Archetype[\s\S]{0,160}?\bBonuses\b/im.test(rawText)) {
      for (const name of ['Avian','Dark Elf','Dryad','Dwarf','Elf','Faery','Gnome','Halfling','Human','Orc','Undead']) {
        const race = merged.races[name];
        if (!race?.archetype) issues.push('race table field missing: ' + name + ' archetype');
        if (!Array.isArray(race?.bonuses) || !race.bonuses.length) issues.push('race table field missing: ' + name + ' bonuses');
        if (!Array.isArray(race?.spells) || race.spells.some(value => /^\d+(?:\.\d+)?$/.test(String(value).trim()))) issues.push('race table field invalid: ' + name + ' spells');
        if (!race?.units || !race.units['Offensive Specialist'] || !race.units['Defensive Specialist']) issues.push('race table field missing: ' + name + ' specialist stats');
      }
    }
    if (/^\s*Personality\s+Archetype[\s\S]{0,160}?\bBonuses\b/im.test(rawText)) {
      for (const shortName of ['Cleric','General','Heretic','Mystic','Necromancer','Rogue','Sage','Tactician','Warrior','War Hero','Artisan']) {
        if (!new RegExp('(?:^|\\n)\\s*' + shortName + '\\s*\\t', 'i').test(rawText)) continue;
        const name = 'The ' + shortName;
        const personality = merged.personalities[name];
        if (!personality?.unique_name) issues.push('personality table field missing: ' + name + ' unique ability');
        if (!Array.isArray(personality?.bonuses) || !personality.bonuses.length) issues.push('personality table field missing: ' + name + ' bonuses');
      }
    }
    if (/^\s*Dragons?\s+Effect\s*$/im.test(rawText)) {
      for (const name of ['Emerald Dragon','Ruby Dragon','Sapphire Dragons','Topaz Dragon']) if (!merged.dragons[name]) issues.push('missing Age 117 dragon: ' + name);
      if (merged.dragons['Amethyst Dragon']) issues.push('obsolete Age 116 dragon still present: Amethyst Dragon');
    }
    const gameCount = ['spells','thievery','buildings','science','game_rules'].reduce((n, section) => n + Object.keys(merged[section] || {}).length, 0);
    if (gameCount < 4) issues.push('fewer than 4 game-rule entries after merge');
  }
  return issues;
}
async function buildReview(supabase, rawText, ageNumber) {
  const parsed = parseAgeChangeText(rawText, ageNumber);
  const needsBaseline = isChangeSheet(rawText, ageNumber);
  let baseline = null;
  if (needsBaseline) baseline = await loadBaseline(supabase, ageNumber);
  const merged = needsBaseline ? mergeRules(baseline.rules, parsed) : parsed;
  const issues = validateMerged(merged, ageNumber, rawText, baseline);
  const summaryLines = [
    'Age ' + ageNumber + ' parsed with ' + parsed.source.parser,
    'Baseline: ' + (baseline ? 'Age ' + baseline.age + ' (' + baseline.source + ')' : 'not required'),
    'Races: ' + Object.keys(merged.races || {}).length,
    'Personalities: ' + Object.keys(merged.personalities || {}).length,
    'Rituals: ' + Object.keys(merged.rituals || {}).length,
    'Dragons: ' + Object.keys(merged.dragons || {}).length,
    'Spells: ' + Object.keys(merged.spells || {}).length,
    'Thievery: ' + Object.keys(merged.thievery || {}).length,
    'Buildings: ' + Object.keys(merged.buildings || {}).length,
    'Science: ' + Object.keys(merged.science || {}).length,
    'Game rules: ' + Object.keys(merged.game_rules || {}).length
  ];
  if (issues.length) summaryLines.push('', 'BLOCKED:', ...issues.map((x) => '- ' + x));
  return { parsed, merged, baseline: baseline || { source: 'not_required', age: null }, issues, ready: issues.length === 0, summary: summaryLines.join('\n') };
}

module.exports = { buildReview, toRows, parseObject, mergeRules, loadBaseline, validateMerged };
