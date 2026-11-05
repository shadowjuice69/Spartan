const test = require('node:test');
const assert = require('node:assert/strict');
const { parseThrone, parseBuildings } = require('../services/canonicalIntelParser');

test('parses current website Throne text fields from tabular captures', () => {
  const parsed = parseThrone({ prov: 'Finkster', data_simple: [
    'The Province of Finkster (6:8)',
    'Race\tAvian\tSoldiers\t267',
    'Land\t686\tHarpies\t3,717',
    'Peasants\t5,603\tDrakes\t0',
    'Building Eff.\t86%\tThieves\t1,249 (100%)',
    'Money\t48,756\tWizards\t535 (85%)',
    'Food\t148,022\tWar Horses\t0',
    'Runes\t41,559\tPrisoners\t238',
    'Trade Balance\t-154,331',
    'Off. Points\t90,692',
    'Networth\t97,642 gold coins',
    'Def. Points\t56,030'
  ].join('\n') });
  assert.equal(parsed.province, 'Finkster');
  assert.equal(parsed.race, 'Avian');
  assert.equal(parsed.land, 686);
  assert.equal(parsed.soldiers, 267);
  assert.equal(parsed.peasants, 5603);
  assert.equal(parsed.thieves, 1249);
  assert.equal(parsed.wizards, 535);
  assert.equal(parsed.prisoners, 238);
  assert.equal(parsed.buildingEffectiveness, 86);
  assert.equal(parsed.gold, 48756);
  assert.equal(parsed.food, 148022);
  assert.equal(parsed.runes, 41559);
  assert.equal(parsed.tradeBalance, -154331);
  assert.equal(parsed.offense, 90692);
  assert.equal(parsed.defense, 56030);
  assert.equal(parsed.networth, 97642);
});

test('parses canonical Survey building rows without inventing values', () => {
  const rows = parseBuildings({ data_simple: [
    'Building type\tQuantity\t% of Total\tCurrent Effects',
    'Homes\t182\t8.7%\tIncrease max population',
    'Farms\t181\t8.7%\tProduce food',
    'Mills\t0\t0.0%\tLower building costs'
  ].join('\n') });
  assert.deepEqual(rows, [
    { name: 'Homes', quantity: 182, percent: 8.7 },
    { name: 'Farms', quantity: 181, percent: 8.7 },
    { name: 'Mills', quantity: 0, percent: 0 }
  ]);
});
