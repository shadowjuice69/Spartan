'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractRemovals, parseAgeChangeText } = require('../parsers/ageChangeParser');
const { mergeRules, toRows } = require('../services/ageRuleMerge');

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
