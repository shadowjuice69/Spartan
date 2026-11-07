const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const modulePath = path.resolve(__dirname, '../../lib/spartan/combined-effects.ts');
const source = fs.readFileSync(modulePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(modulePath, module);
loaded.filename = modulePath;
loaded.paths = Module._nodeModulePaths(path.dirname(modulePath));
loaded._compile(compiled, modulePath);
const { combineEffects } = loaded.exports;

function rowFor(result, stat) {
  return [...result.bonuses, ...result.penalties].find(row => row.stat === stat);
}

test('race and personality WPA bonuses are summed into +50%', () => {
  const result = combineEffects(
    { bonuses: '+25% Wizards Per Acre' },
    { bonuses: '+25% WPA' },
  );
  const wpa = rowFor(result, 'WPA');
  assert.ok(wpa, 'combined WPA row should exist');
  assert.equal(wpa.race, 25);
  assert.equal(wpa.personality, 25);
  assert.equal(wpa.total, 50);
  assert.equal(wpa.favorable, true);
});

test('reduced attack travel time is favorable and combines', () => {
  const result = combineEffects(
    { bonuses: '-20% Attack Travel Time' },
    { bonuses: '-15% Attack Travel Time' },
  );
  const time = rowFor(result, 'ATTACK TIME');
  assert.ok(time);
  assert.equal(time.total, -35);
  assert.equal(time.favorable, true);
});

test('lower food consumption is favorable while higher consumption is a penalty', () => {
  const lower = combineEffects({ bonuses: '-100% Food Consumption' }, null);
  const higher = combineEffects({ bonuses: '+50% Food Consumption' }, null);
  assert.equal(rowFor(lower, 'FOOD CONSUMPTION').favorable, true);
  assert.equal(rowFor(higher, 'FOOD CONSUMPTION').favorable, false);
});

test('reduced damage taken/received is favorable', () => {
  const result = combineEffects({
    bonuses: '-20% Damage Taken from Raze Attacks\n-15% Spell Damage Received',
  }, null);
  assert.equal(rowFor(result, 'DAMAGE TAKEN FROM RAZE ATTACKS').favorable, true);
  assert.equal(rowFor(result, 'SPELL DAMAGE RECEIVED').favorable, true);
});

test('increased damage received is a penalty', () => {
  const result = combineEffects({ penalties: '+20% Combat Instant Spell Damage Received' }, null);
  assert.equal(rowFor(result, 'COMBAT INSTANT SPELL DAMAGE RECEIVED').favorable, false);
});
