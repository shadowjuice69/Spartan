'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractRemovals, parseAgeChangeText } = require('../parsers/ageChangeParser');
const { mergeRules, toRows, validateParsedShape } = require('../services/ageRuleMerge');

test('preserves fixed-width indentation in extracted PDF tables', () => {
  const { normalizePdfText } = require('../parsers/pdfTableText');
  const input = 'Race          Archetype                 Bonuses\n' +
    '                                        -20% Attack Travel Time\n' +
    'Avian         Speed and Birth Rates';
  const normalized = normalizePdfText(input);
  assert.ok(normalized.includes('\n                                        -20% Attack Travel Time'));
  assert.ok(normalized.includes('\nAvian         Speed and Birth Rates'));
});

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

test('blocks mixed or numeric PDF table cells in generic rule fields', () => {
  const issues = validateParsedShape({
    races: {
      Avian: {
        archetype: '123',
        war_doctrine: '6.25',
        penalties: ['3'],
        spells: ['900'],
        unique_name: '2',
        unique_passive: '6.25'
      }
    },
    personalities: {
      'The Cleric': { archetype: 'Defensive 900 6.25', spells: ['900'], unique_name: 'Architects Revenge' }
    }
  }, 117);
  assert.ok(issues.some(issue => /race Avian field archetype/.test(issue)));
  assert.ok(issues.some(issue => /race Avian field war_doctrine/.test(issue)));
  assert.ok(issues.some(issue => /race Avian field penalties/.test(issue)));
  assert.ok(issues.some(issue => /race Avian field spells/.test(issue)));
  assert.ok(issues.some(issue => /race Avian field unique_name/.test(issue)));
  assert.ok(issues.some(issue => /race Avian field unique_passive/.test(issue)));
  assert.ok(issues.some(issue => /personality The Cleric field archetype/.test(issue)));
  assert.ok(issues.some(issue => /personality The Cleric field spells/.test(issue)));
});

test('uses canonical cell-extracted rows for the real Age 117 table shape', () => {
  const { parse117 } = require('../parsers/ageChangeParser');
  const raceNames = ['Avian','Dark Elf','Dryad','Dwarf','Elf','Faery','Gnome','Halfling','Human','Orc','Undead'];
  const personalityNames = ['Cleric','General','Heretic','Mystic','Rogue','Sage','Tactician','Warrior'];
  const races = raceNames.map((name) => ({
    name, archetype: name === 'Avian' ? 'Speed and Birth Rates' : name === 'Dark Elf' ? 'Magic / Attacker Hybrid' : 'Test archetype',
    bonuses: name === 'Avian' ? ['-20% Attack Travel Time', '+25% Birth Rate'] : [],
    penalties: name === 'Avian' ? ['No Horses'] : [],
    spells: name === 'Avian' ? ['Town Watch'] : name === 'Dark Elf' ? ['Blizzard', 'Mind Focus'] : [],
    doctrine: name === 'Avian' ? '-7.5% Attack time (-0.75% each)' : '',
    units: name === 'Avian' ? 'Soldier 3/0 · Off Spec 12/0 (4.8nw) · Def Spec 0/10 (5nw) · Elite 14/3 (900gc, 6.25nw) · Merc 8/0 · Prisoner 8/0 · War Horse 2/0 (0.6nw)' : '',
    unique_name: name === 'Avian' ? 'Opportunistic Raiders' : name === 'Dark Elf' ? 'Mystic Enthusiasts' : '',
    unique_passive: name === 'Avian' ? 'Learn and Plunder attacks return armies 1 tick faster (after modifiers).' : name === 'Dark Elf' ? 'Successful offensive instant spells refund 30% of the rune cost.' : ''
  }));
  const personalities = personalityNames.map((name) => ({
    name, archetype: 'Table archetype', bonuses: [], spells: [], starts_with: [],
    unique_name: '', unique_passive: ''
  }));
  const rituals = ['Barrier','Benediction','Haste','Havoc','Onslaught','Stalwart'].map((name) => ({name,effects:['test effect']}));
  const dragons = ['Emerald','Ruby','Sapphire','Topaz'].map((name) => ({name,effects:['test effect']}));
  const block = (name, rows) => ['#TABLE ' + name, ...rows.map((row) => '#ROW ' + JSON.stringify(row)), '#ENDTABLE'].join('\n');
  const source = [
    'Age 117 General Changes:',
    'Fanaticism spell will only be available as a Racial Spell',
    '% Reduction Sciences Max Reductions Reduced from -95% to -75%',
    'All Doctrines give double bonus for the first province, then scale by the listed amount',
    'Dragon Hitpoints Reduced by 10%; recurring effects after 6 ticks removed',
    'Race Archetype Bonuses',
    'Personality Archetype Bonuses',
    'Ritual Effect',
    'Dragons Effect',
    'Unique Abilty Programming Changes from Existing',
    block('RACES', races), block('PERSONALITIES', personalities),
    block('RITUALS', rituals), block('DRAGONS', dragons)
  ].join('\n');
  const parsed = parse117(source);
  assert.equal(Object.keys(parsed.races).length, 11);
  assert.equal(Object.keys(parsed.personalities).length, 8);
  assert.equal(Object.keys(parsed.rituals).length, 6);
  assert.equal(Object.keys(parsed.dragons).length, 4);
  assert.equal(Object.hasOwn(parsed.dragons, 'Amethyst Dragon'), false);
  assert.deepEqual(parsed.races.Avian.bonuses, ['-20% Attack Travel Time', '+25% Birth Rate']);
  assert.equal(parsed.races.Avian.war_doctrine, '-7.5% Attack time (-0.75% each)');
  assert.match(parsed.races.Avian.units, /Off Spec 12\/0 \(4\.8nw\)/);
  assert.deepEqual(parsed.races['Dark Elf'].spells, ['Blizzard', 'Mind Focus']);

  const baseline = {
    races: {},
    personalities: {
      'The Artisan': { bonuses: ['baseline artisan'] },
      'The Necromancer': { bonuses: ['baseline necromancer'] },
      'The War Hero': { bonuses: ['baseline war hero'] }
    },
    buildings: {}, spells: {}, thievery: {}, game_rules: {}, science: {},
    rituals: { 'Ascendancy Ritual': { effects: ['obsolete ritual'] }, 'Old Ritual': { effects: ['obsolete'] } },
    dragons: {
      'Amethyst Dragon': { effects: ['obsolete dragon'] },
      'Emerald Dragon': { effects: ['old emerald'] },
      'Ruby Dragon': { effects: ['old ruby'] },
      'Sapphire Dragons': { effects: ['old sapphire'] },
      'Topaz Dragon': { effects: ['old topaz'] }
    }
  };
  const merged = mergeRules(baseline, parsed);
  assert.equal(Object.keys(merged.races).length, 11);
  assert.equal(Object.keys(merged.personalities).length, 11);
  assert.equal(Object.keys(merged.rituals).length, 6);
  assert.equal(Object.keys(merged.dragons).length, 4);
  assert.equal(Object.hasOwn(merged.dragons, 'Amethyst Dragon'), false);
  assert.equal(Object.hasOwn(merged.rituals, 'Ascendancy Ritual'), false);
});

test('serializes merged rules into database row sections', () => {
  const rows = toRows(117, {
    races: { Human: { bonuses: ['+20% Battle Gains'], penalties: [], spells: ['Tree of Gold'], units: 'Soldier 3/0 · Off Spec 12/0 (4.8nw)' } },
    personalities: { 'The Sage': { bonuses: [], starts_with: [], spells: ['Fountain of Knowledge'] } },
    spells: { 'Tree of Gold': 'updated effect' },
    rituals: { Barrier: { effects: ['ritual effect'] } },
    thievery: {}, buildings: {}, science: {}, game_rules: {},
    dragons: { 'Emerald Dragon': { effects: ['dragon effect'] } }
  });
  assert.equal(rows.races.length, 1);
  assert.equal(rows.races[0].units, 'Soldier 3/0 · Off Spec 12/0 (4.8nw)');
  assert.equal(rows.personalities.length, 1);
  assert.ok(rows.game.some((row) => row.category === 'spell'));
  assert.ok(rows.game.some((row) => row.category === 'ritual'));
  assert.ok(rows.game.some((row) => row.category === 'dragon'));
});

test('parses fixed-width PDF layout extracted from the submitted Age 117 document', () => {
  const { parse117 } = require('../parsers/ageChangeParser');
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
  const { parse117 } = require('../parsers/ageChangeParser');
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


test('parses revision and ability change logs instead of dropping them after table extraction', () => {
  const { parse117 } = require('../parsers/ageChangeParser');
  const source = [
    'Age 117 General Changes:',
    'Fanaticism spell will only be available as a Racial Spell',
    '% Reduction Sciences Max Reductions Reduced from -95% to -75%',
    'All Doctrines give double bonus for the first province',
    'Dragon Hitpoints Reduced by 10%; recurring effects after 6 ticks removed',
    'Race Archetype Bonuses',
    'Personality Archetype Bonuses',
    'Ritual Effect',
    'Dragons Effect',
    'Change Log from Revised:',
    'Ascendancy Ritual: Removed',
    'Heretic: Added Mages Fury spell',
    'Dark Elf: Added Mind Focus spell',
    'Elf: Penalty changed to offensive TPA, Doctrine Changed',
    'Faery: Added bonus -1% mana self spell cost',
    'Halfling: Penalty change to offensive WPA',
    'Human: Removed Greed Immunity',
    'Sage: Unique Ability Changed to Holy Inquisition',
    'Tactician: Attack Travel Time bonus reduced to -15%',
    'Warrior: Unique Ability Changed to Indomitable Spirit',
    'Orc: Penalty changed to -5% DME',
    'Unique Abilty Programming Changes from Existing',
    'Overgrowth: Maximum population increases by +25% for 5 days.',
    'Cunning Assault: Provides thievery boosts for 6 days.',
    'Indomitable Spirit: Warriors gain 5% Offensive Military Efficiency for 6 days.',
    'Arcane Respite: Regenerate +2 mana per day for 6 days.',
    'Arcane Overflow: Offensive spells reduce enemy ritual effectiveness.'
  ].join('\n');
  const parsed = parse117(source);
  assert.ok(Object.keys(parsed.game_rules).some(key => /All Doctrines/i.test(key)));
  assert.ok(Object.values(parsed.spells).some(value => /Mages Fury/i.test(value)));
  assert.ok(Object.values(parsed.spells).some(value => /Mind Focus/i.test(value)));
  assert.ok(Object.values(parsed.thievery).some(value => /offensive TPA/i.test(value)));
  assert.ok(Object.values(parsed.spells).some(value => /Arcane Respite/i.test(value)));
  assert.ok(Object.values(parsed.thievery).some(value => /Cunning Assault/i.test(value)));
});
