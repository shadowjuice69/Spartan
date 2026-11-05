const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const capturedAt = '2026-11-05T20:40:36.274Z';
const throne = {
  captured_at: capturedAt,
  parsed_payload: { prov: 'Finkster', data_simple: [
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
  ].join('\n') }
};
const buildings = {
  captured_at: '2026-11-02T18:30:53.440Z',
  parsed_payload: { prov: 'Finkster', data_simple: [
    'Building type\tQuantity\t% of Total\tCurrent Effects',
    'Homes\t182\t8.7%\tIncrease max population',
    'Banks\t299\t14.4%\tProduce 7,430 gold coins per day',
    'Farms\t181\t8.7%\tProduce 10,794 bushels per day',
    'Towers\t181\t8.7%\tProduce 2,158 runes per day',
    'Guilds\t272\t13.1%\t10.9 wizards trained per day'
  ].join('\n') }
};
const science = {
  captured_at: '2026-11-05T21:01:50.742Z',
  parsed_payload: { prov: 'Finkster', data_simple: [
    'Economy - 8 scientists - 940 books available',
    'Alchemy\t37,608\t 10.3% Income',
    'Tools\t24,148\t 6.1% Building Effectiveness',
    'Military - 4 scientists - 380 books available',
    'Strategy\t49,949\t 6.0% Defensive Military Efficiency',
    'Arcane Arts - 1 scientists - 120 books available',
    'Crime\t31,468\t 20.6% Thief Effectiveness (TPA)'
  ].join('\n') }
};
const byKind = { throne, buildings, science };
for (const kind of ['magic','ritual','military','thievery','news','aid','attack','exploration','kingdom','utopiaintel']) {
  byKind[kind] = { captured_at: capturedAt, page_kind: kind, parsed_payload: { prov: 'Finkster', data_simple: kind + ' capture' } };
}
const registry = [{ province_name: 'Finkster', kingdom_code: '6:8', last_seen_at: capturedAt }];
const queryChain = () => {
  const c = {
    select: () => c, eq: () => c, order: () => c, ilike: () => c, limit: () => c,
    maybeSingle: async () => ({ data: registry[0], error: null }),
    then: (resolve) => resolve({ data: registry, error: null })
  };
  return c;
};
const canonical = {
  getProvinceIntel: async ({ pageKind }) => byKind[pageKind] || null,
  getLatestProvinceIntel: async ({ pageKinds }) => Object.fromEntries(pageKinds.map(k => [k, byKind[k] || null])),
  getIntel: async () => [{ page_kind: 'science', visibility: 'own', captured_at: science.captured_at, parsed_payload: science.parsed_payload }],
  summarize: rows => ({ count: rows.length, byKind: { science: rows.length }, byVisibility: { own: rows.length } })
};
const stubs = {
  '../../services/supabase': { getClient: () => ({ from: () => queryChain() }) },
  '../../services/spartanAccessService': { get: async () => ({ username: 'Finkster', metadata: { province: 'Finkster', coordinates: '6:8', race: 'Avian', personality: 'Cleric' } }) },
  '../../services/canonicalIntelService': canonical
};
const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) { return stubs[request] || originalLoad.call(this, request, parent, ...rest); };
const handler = require('../handlers/commands/intelOpsHandler');
Module._load = originalLoad;

async function run(subcommand, strings = {}) {
  let output = '';
  const interaction = {
    user: { id: 'test-user' },
    options: {
      getSubcommand: () => subcommand,
      getString: key => strings[key] ?? null
    },
    reply: async payload => { output = payload.content; }
  };
  await handler(interaction);
  return output;
}

test('status reads Finkster Throne capture and registered identity', async () => {
  const out = await run('status');
  assert.match(out, /Race:\*\* Avian/);
  assert.match(out, /Personality:\*\* Cleric/);
  assert.match(out, /90,692/);
  assert.match(out, /97,642/);
});

test('economy uses Throne stock and explicit Survey production', async () => {
  const out = await run('econ');
  assert.match(out, /48,756/);
  assert.match(out, /7,430/);
  assert.match(out, /10,794/);
  assert.match(out, /Survey 3d/);
});

test('Survey displays canonical building quantities', async () => {
  const out = await run('survey', { province: 'Finkster' });
  assert.match(out, /Homes 182/);
  assert.match(out, /Banks 299/);
});

test('kingdom economy aggregates captured subset and Survey outputs', async () => {
  const out = await run('kdecon');
  assert.match(out, /KD Captured Economy/);
  assert.match(out, /7,430/);
  assert.match(out, /1 Survey captures/);
});

test('TPPA uses population and land from canonical Throne', async () => {
  const out = await run('tppa');
  assert.match(out, /Finkster/);
  assert.match(out, /11\.\d+ tppa/);
});

test('kingdom offense uses captured Off. Points', async () => {
  const out = await run('left');
  assert.match(out, /90,692 off/);
});

test('plunder shortlist refuses to invent uncaptured targets', async () => {
  const out = await run('plunders');
  assert.match(out, /No in-range targets among captured provinces/);
});

test('capture health and kingdom coverage use canonical page captures', async () => {
  const health = await run('capturehealth');
  assert.match(health, /Thr\s+✓/);
  assert.match(health, /Sci\s+✓/);
  const coverage = await run('check');
  assert.match(coverage, /1\\/1 complete/);
  assert.match(coverage, /1\\/1 complete/);
});

test('canonical browser displays parsed website Intel', async () => {
  const out = await run('canonical', { section: 'science' });
  assert.match(out, /CANONICAL SPARTAN INTEL — SCIENCE/);
  assert.match(out, /science:1/);
});

test('unavailable live movement and operation-rate commands explain missing sources', async () => {
  assert.match(await run('incoming'), /Live incoming army movements are not stored/);
  assert.match(await run('eta'), /Live army return ETAs are not stored/);
  assert.match(await run('oprate'), /success\/failure denominator/);
});
