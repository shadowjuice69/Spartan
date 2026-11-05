const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

// Stub the two services the handler needs so it runs without a database.
const rows = []
const mk = (name, kd, acres, nw, race) => ({ province_name: name, kingdom_code: kd, metadata: { throne: { acres, nw, race }, throne_captured_at: new Date().toISOString() } })
for (let i = 0; i < 6; i++) rows.push(mk('E' + i, '4:1', 500 + i * 20, 80000 + i * 6000, 'Elf'))
rows.push(mk('Mine1', '6:8', 600, 90000, 'Human'))
const chain = (data) => { const c = { select: () => c, not: () => c, eq: () => c, ilike: () => c, limit: () => c, then: (r) => r({ data, error: null }) }; return c }
const stubs = {
  '../../services/supabase': { getClient: () => ({ from: () => chain(rows) }) },
  '../../services/spartanAccessService': { get: async () => ({ metadata: { province: 'Me', coordinates: '6:8', nw: 95000, acres: 640 } }) },
}
const origLoad = Module._load
Module._load = function (req, parent, ...rest) { return stubs[req] || origLoad.call(this, req, parent, ...rest) }
const handler = require('../handlers/commands/targetHandler')
Module._load = origLoad

function run(opts) {
  let out = null
  const interaction = {
    user: { id: '1' }, options: { getString: (k) => opts[k] ?? null },
    deferReply: async () => {}, reply: async (x) => { out = x.content }, editReply: async (x) => { out = x },
  }
  return handler(interaction).then(() => out)
}

test('top targets list ranks other kingdoms only, with scores', async () => {
  const out = await run({})
  assert.match(out, /Top Targets/)
  assert.match(out, /score \d+/)
  assert.ok(!out.includes('Mine1'), 'own kingdom is excluded')
  assert.ok(out.length <= 1900)
})

test('single province lookup shows the score and kingdom comparison', async () => {
  const out = await run({ province: 'E3' })
  assert.match(out, /Target Score: \d+\/100/)
  assert.match(out, /vs kingdom/)
})

test('softest mode runs', async () => {
  assert.match(await run({ mode: 'soft' }), /Top Targets/)
})
