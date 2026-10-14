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
