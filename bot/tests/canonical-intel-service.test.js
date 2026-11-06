const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadService(record) {
  const state = { filters: {} };
  const chain = {
    select: () => chain,
    eq: (key, value) => { state.filters[key] = value; return chain; },
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: record, error: null })
  };
  const client = { from: (table) => { state.table = table; return chain; } };
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === './supabase' && parent?.filename?.endsWith('/canonicalIntelService.js')) return { getClient: () => client };
    return original.call(this, request, parent, ...rest);
  };
  const path = require.resolve('../services/canonicalIntelService');
  delete require.cache[path];
  const service = require('../services/canonicalIntelService');
  Module._load = original;
  return { service, state };
}

test('province Intel lookup is scoped to kingdom, province, page kind and own visibility', async () => {
  const record = { id: 'r1', page_kind: 'throne', visibility: 'own', parsed_payload: { prov: 'Finkster' } };
  const { service, state } = loadService(record);
  const result = await service.getProvinceIntel({ kd: '6:8', province: 'Finkster', pageKind: 'throne' });
  assert.equal(result, record);
  assert.equal(state.table, 'spartan_intel_records');
  assert.deepEqual(state.filters, {
    kingdom_id: '6:8',
    visibility: 'own',
    'parsed_payload->>prov': 'Finkster',
    page_kind: 'throne'
  });
});

test('province Intel lookup rejects bot-event wrapper records', async () => {
  const record = { id: 'r2', page_kind: 'throne', visibility: 'own', parsed_payload: { kind: 'bot_event', prov: 'Finkster' } };
  const { service } = loadService(record);
  const result = await service.getProvinceIntel({ kd: '6:8', province: 'Finkster', pageKind: 'throne' });
  assert.equal(result, null);
});

test('canonical list keeps only the newest record per province and page kind', () => {
  const { service } = loadService(null);
  const rows = [
    { id: 'new', province_id: 'province-a', page_kind: 'throne', visibility: 'own', captured_at: '2026-11-06T01:00:00Z' },
    { id: 'old', province_id: 'province-a', page_kind: 'throne', visibility: 'own', captured_at: '2026-11-06T00:59:00Z' },
    { id: 'survey', province_id: 'province-a', page_kind: 'buildings', visibility: 'own' },
    { id: 'enemy', province_id: 'province-a', page_kind: 'throne', visibility: 'enemy', target_kingdom_id: '6:7' },
    { id: 'bot', province_id: 'province-b', page_kind: 'bot_event', visibility: 'own' }
  ];
  const result = service.latestPerProvinceAndKind(rows);
  assert.deepEqual(result.map(row => row.id), ['new', 'survey', 'enemy']);
});
