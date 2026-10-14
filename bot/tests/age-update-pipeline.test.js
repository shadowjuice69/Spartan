'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractRemovals, parseAgeChangeText } = require('../parsers/ageChangeParser');
const { mergeRules, toRows, validateMerged } = require('../services/ageRuleMerge');

test('parses removal entries from the revised change log', () => {
  const removed = extractRemovals([
    'Change Log from Revised:',
    'Ascendancy Ritual: Removed',
    'Human: Removed Greed Immunity',
    'Unique Abilty Programming Changes from Existing',
    'Overgrowth: revised effect'
  ].join('\n'));
  assert.deepEqual(removed, [
    { category: 'ritual', name: 'Ascendancy', entity: null },
    { category: '', name: 'Greed Immunity', entity: 'Human' }
  ]);
  const compound = extractRemovals('Change Log from Revised:\nHuman: Removed Greed Immunity, Unique Ability changed to Civil Administration');
  assert.deepEqual(compound, [{ category: '', name: 'Greed Immunity', entity: 'Human' }]);
});

test('merges sparse proposed changes over baseline without erasing omitted fields', () => {
  const baseline = {
    races: { Human: { archetype: 'Economy', bonuses: ['+20% Battle Gains', 'Greed Immunity'], penalties: [], spells: ['Tree of Gold'], units: {} } },
    personalities: { 'The Sage': { bonuses: ['+10 Starting Scientists'], spells: ['Fountain of Knowledge'], starts_with: [] } },
    buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {},
    rituals: { 'Ascendancy Ritual': { effects: ['old effect'] } },
    dragons: {}
  };
  const changes = {
    races: { Human: { bonuses: ['+20% Battle Gains'], penalties: [], spells: [], units: {} } },
    personalities: {}, buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {},
    rituals: {}, dragons: {},
    removed: [
      { category: 'ritual', name: 'Ascendancy', entity: null },
      { category: '', name: 'Greed Immunity', entity: 'Human' }
    ]
  };
  const merged = mergeRules(baseline, changes);
  assert.equal(merged.races.Human.archetype, 'Economy');
  assert.deepEqual(merged.races.Human.bonuses, ['+20% Battle Gains']);
  assert.deepEqual(merged.races.Human.spells, ['Tree of Gold']);
  assert.equal(Object.hasOwn(merged.rituals, 'Ascendancy Ritual'), false);
  assert.deepEqual(merged.personalities['The Sage'].spells, ['Fountain of Knowledge']);
});

test('rejects empty text and returns normalized sections for parsed text', () => {
  assert.throws(() => parseAgeChangeText('   ', 117), /empty/i);
  const parsed = parseAgeChangeText([
    'Age 117 General Changes',
    '• General economy adjustment',
    'Race Archetype Bonuses',
    'Personality Archetype Bonuses'
  ].join('\n'), 117);
  for (const key of ['races','personalities','buildings','spells','thievery','game_rules','dragons','science','rituals']) {
    assert.ok(parsed[key] && typeof parsed[key] === 'object');
  }
});

test('full Age 117 tables replace empty cells instead of inheriting removed Age 116 values', () => {
  const races = {}, personalities = {};
  for (const name of ['Avian','Dark Elf','Dryad','Dwarf','Elf','Faery','Gnome','Halfling','Human','Orc','Undead']) {
    races[name] = { bonuses: [], penalties: [], spells: [], units: {}, archetype: 'updated' };
  }
  for (const name of ['The Artisan','The General','The Heretic','The Mystic','The Necromancer','The Cleric','The Rogue','The Tactician','The Warrior','The War Hero','The Sage']) {
    personalities[name] = { bonuses: [], spells: [], starts_with: [], unique_name: null, unique_passive: null };
  }
  const baseline = {
    races: { ...races, Human: { bonuses: ['Greed Immunity'], penalties: [], spells: ['old spell'], units: {}, archetype: 'old' } },
    personalities: { ...personalities, 'The Cleric': { bonuses: ['old bonus'], spells: ['old spell'], starts_with: ['old start'] } },
    buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {},
    rituals: {}, dragons: {}
  };
  const changes = { races, personalities, buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {}, rituals: {}, dragons: {} };
  const merged = mergeRules(baseline, changes);
  assert.deepEqual(merged.races.Human.bonuses, []);
  assert.deepEqual(merged.races.Human.spells, []);
  assert.equal(merged.races.Human.archetype, 'updated');
  assert.deepEqual(merged.personalities['The Cleric'].bonuses, []);
  assert.deepEqual(merged.personalities['The Cleric'].spells, []);
});

test('serializes merged rules into database row sections', () => {
  const rows = toRows(117, {
    races: { Human: { bonuses: ['+20% Battle Gains'], penalties: [], spells: ['Tree of Gold'], units: {} } },
    personalities: { 'The Sage': { bonuses: [], starts_with: [], spells: ['Fountain of Knowledge'] } },
    spells: { 'Tree of Gold': 'updated effect' },
    rituals: { Barrier: { effects: ['ritual effect'] } },
    thievery: {}, buildings: {}, science: {}, game_rules: {},
    dragons: { 'Emerald Dragon': { effects: ['dragon effect'] } }
  });
  assert.equal(rows.races.length, 1);
  assert.equal(rows.personalities.length, 1);
  assert.ok(rows.game.some((row) => row.category === 'spell'));
  assert.ok(rows.game.some((row) => row.category === 'ritual'));
  assert.ok(rows.game.some((row) => row.category === 'dragon'));
});

test('parses fixed-width PDF layout extracted from the submitted Age 117 document', () => {
  const { parse117 } = require('../parsers/age117');
  const input = [
    'Age 117 General Changes:',
    'Fanaticism spell will only be available as a Racial Spell',
    'Race          Archetype                 Bonuses                                      Penalties                      Unique Spells         Doctrine                       Ospec Dspec Elite O Elite D Elite Cost Elite NW Horse Unique Ability         Unqiue Effect',
    'Avian         Speed and Birth Rates                                                  No Horses                      Town Watch                                            12      10     14      3      900      6.25      2    Opportunistic Raiders',
    '                                        -20% Attack Travel Time                                                                           -7.5% Attack time                                                                                           Learn and Plunder attacks return armies 1 tick faster (after',
    '                                        +25% Birth Rate                                                                                   (-0.75% each)                                                                                               modifiers).',
    'Personality   Archetype                Bonuses                                      Unique Spells                Starting Units/Credits Unique Ability         Unqiue Effect',
    'Cleric        Defensive                +15% Defensive Military Efficiency           Salvation                    +800 Soldiers           Architects Revenge      Incoming Raze damage is reduced by 15%.',
    'Ritual        Effect',
    'Barrier       -20% Damage from Enemy Instant Magic & Thievery Operations, -20% Battle (Resource) Losses, -20% Massacre Damage',
    'Dragons       Effect',
    'Emerald       +25% Military Casualties, -25% Combat Gains, destroys 1% of all troops on arrival'
  ].join('\n');
  const parsed = parse117(input);
  assert.deepEqual(parsed.races.Avian.bonuses, ['-20% Attack Travel Time', '+25% Birth Rate']);
  assert.equal(parsed.races.Avian.unique_name, 'Opportunistic Raiders');
  assert.match(parsed.races.Avian.unique_passive, /Learn and Plunder attacks return armies 1 tick faster/);
  assert.deepEqual(parsed.personalities['The Cleric'].bonuses, ['+15% Defensive Military Efficiency']);
  assert.ok(parsed.rituals.Barrier);
  assert.ok(parsed.dragons['Emerald Dragon']);
});

test('parses tab-separated PDF table cells by column rather than fixed character offsets', () => {
  const { parse117 } = require('../parsers/age117');
  const input = [
    'Age 117 General Changes:',
    'General change note',
    'Race\tArchetype\tBonuses\tPenalties\tUnique Spells\tDoctrine\tOspec\tDspec\tElite O\tElite D\tElite Cost\tElite NW\tHorse\tUnique Ability\tUnqiue Effect',
    'Avian\tSpeed and Birth Rates\t+25% Birth Rate\tNo Horses\tTown Watch\t-7.5% Attack Time\t12\t10\t14\t3\t900\t6.25\t2\tOpportunistic Raiders\tLearn and Plunder returns armies 1 tick faster.',
    'Personality\tArchetype\tBonuses\tUnique Spells\tStarting Units/Credits\tUnique Ability\tUnqiue Effect',
    'Cleric\tDefensive\t+15% Defensive Military Efficiency\tSalvation\t+800 Soldiers\tArchitects Revenge\tIncoming Raze damage is reduced by 15%.',
    'Ritual Effect',
    'Barrier\t-20% Damage from Enemy Instant Magic',
    'Dragons Effect',
    'Emerald\t+25% Military Casualties'
  ].join('\n');
  const parsed = parse117(input);
  assert.deepEqual(parsed.races.Avian.bonuses, ['+25% Birth Rate']);
  assert.deepEqual(parsed.races.Avian.penalties, ['No Horses']);
  assert.equal(parsed.races.Avian.war_doctrine, '-7.5% Attack Time');
  assert.equal(parsed.races.Avian.unique_name, 'Opportunistic Raiders');
  assert.deepEqual(parsed.personalities['The Cleric'].bonuses, ['+15% Defensive Military Efficiency']);
  assert.equal(parsed.personalities['The Cleric'].unique_name, 'Architects Revenge');
  assert.ok(parsed.rituals.Barrier);
  assert.ok(parsed.dragons['Emerald Dragon']);
});

test('replaces the previous-age dragon list when all four Age 117 dragons are supplied', () => {
  const baseline = {
    races: {}, personalities: {}, buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {}, rituals: {},
    dragons: { 'Amethyst Dragon': { effects: ['obsolete recurring effect'] }, 'Emerald Dragon': { effects: ['old'] } }
  };
  const changes = {
    races: {}, personalities: {}, buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {}, rituals: {},
    dragons: {
      'Emerald Dragon': { effects: ['emerald'] },
      'Ruby Dragon': { effects: ['ruby'] },
      'Sapphire Dragons': { effects: ['sapphire'] },
      'Topaz Dragon': { effects: ['topaz'] }
    }
  };
  const merged = mergeRules(baseline, changes);
  assert.deepEqual(Object.keys(merged.dragons).sort(), [
    'Emerald Dragon', 'Ruby Dragon', 'Sapphire Dragons', 'Topaz Dragon'
  ].sort());
  assert.equal(merged.dragons['Amethyst Dragon'], undefined);
});

test('blocks Age 117 PDFs when table rows were not actually parsed', () => {
  const rawText = [
    'Age 117 General Changes:',
    'Race Archetype Bonuses',
    'Personality Archetype Bonuses',
    'Ritual Effect',
    'Dragons Effect'
  ].join('\\n');
  const merged = {
    races: Object.fromEntries(['Avian','Dark Elf','Dryad','Dwarf','Elf','Faery','Gnome','Halfling','Human','Orc','Undead'].map(name => [name, { archetype: 'baseline', bonuses: ['baseline'], spells: ['spell'], units: { 'Offensive Specialist': '1/1', 'Defensive Specialist': '1/1' } }])),
    personalities: Object.fromEntries(['The Artisan','The General','The Heretic','The Mystic','The Necromancer','The Cleric','The Rogue','The Tactician','The Warrior','The War Hero','The Sage'].map(name => [name, { bonuses: ['baseline'], unique_name: 'baseline' }])),
    rituals: Object.fromEntries(['Barrier','Benediction','Haste','Havoc','Onslaught','Stalwart'].map(name => [name, { effects: ['effect'] }])),
    dragons: Object.fromEntries(['Emerald Dragon','Ruby Dragon','Sapphire Dragons','Topaz Dragon'].map(name => [name, { effects: ['effect'] }])),
    game_rules: { one: 'a', two: 'b', three: 'c', four: 'd' }, spells: {}, thievery: {}, buildings: {}, science: {}
  };
  const parsed = { races: {}, personalities: {}, rituals: merged.rituals, dragons: merged.dragons, game_rules: merged.game_rules };
  const issues = validateMerged(merged, 117, rawText, { age: 116 }, parsed);
  assert.ok(issues.some(issue => issue.includes('race table row not parsed')));
});
