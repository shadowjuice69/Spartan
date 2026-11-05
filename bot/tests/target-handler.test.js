const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const rows = [];
const make = (name, kd, acres, nw, race, def) => ({ province_name: name, kingdom_code: kd, acres, nw, race, def });
for (let i = 0; i < 6; i++) rows.push(make('E' + i, '4:1', 500 + i * 20, 80000 + i * 6000, 'Elf', 30000 + i * 2000));
rows.push(make('Mine1', '6:8', 600, 90000, 'Human', 50000));

const chain = (data) => {
  const c = { select: () => c, not: () => c, eq: () => c, ilike: () => c, limit: () => c, then: (resolve) => resolve({ data, error: null }) };
  return c;
};
const canonicalIntel = {
  getProvinceIntel: async ({ province }) => {
    const row = rows.find(r => r.province_name === province);
    if (!row) return null;
    const text = [
      'Race\t' + row.race,
      'Land\t' + row.acres,
      'Networth\t' + row.nw,
      'Def. Points\t' + row.def,
      'Off. Points\t' + Math.round(row.nw * 0.8),
      'Building Eff.\t85%'
    ].join('\n');
    return { captured_at: new Date().toISOString(), parsed_payload: { prov: row.province_name, data_simple: text } };
  }
};
const stubs = {
  '../../services/supabase': { getClient: () => ({ from: () => chain(rows) }) },
  '../../services/spartanAccessService': { get: async () => ({ metadata: { province: 'Mine1', coordinates: '6:8', nw: 95000, acres: 640 } }) },
  '../../services/canonicalIntelService': canonicalIntel
};
const origLoad = Module._load;
Module._load = function (req, parent, ...rest) { return stubs[req] || origLoad.call(this, req, parent, ...rest); };
const handler = require('../handlers/commands/targetHandler');
Module._load = origLoad;

function run(opts) {
  let out = null;
  const interaction = {
    user: { id: '1' }, options: { getString: (k) => opts[k] ?? null },
    deferReply: async () => {}, reply: async (x) => { out = x.content; }, editReply: async (x) => { out = x; }
  };
  return handler(interaction).then(() => out);
}

test('top targets list ranks other kingdoms from canonical Throne captures only', async () => {
  const out = await run({});
  assert.match(out, /Top Targets/);
  assert.match(out, /score \d+/);
  assert.ok(!out.includes('Mine1'), 'own kingdom is excluded');
  assert.ok(out.length <= 1900);
});

test('single province lookup shows score and kingdom comparison from canonical data', async () => {
  const out = await run({ province: 'E3' });
  assert.match(out, /Target Score: \d+\/100/);
  assert.match(out, /vs kingdom/);
});

test('softest mode runs using canonical captured defense and networth', async () => {
  assert.match(await run({ mode: 'soft' }), /Top Targets/);
});
