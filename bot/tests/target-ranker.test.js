const test = require('node:test')
const assert = require('node:assert/strict')
const { estimateGain, inRange, rankTargets, gradeValue, median } = require('../../lib/spartan/target-ranker')

// The two functions exactly as they were written inside components/spartan/PayoffPanel.tsx before the
// shared module existed. The shared versions must give identical answers.
function legacyEstimate(yNW, yAcres, tNW, tAcres, map, war) {
  let a = tNW / yNW - 0.05
  if (a >= 1) a = 1 / a
  const magic = Math.max(0.67, a < 0.9 ? a + 0.1 : a)
  const gf = Math.min(1.35, Math.max(0.01, 3 * magic))
  const mapf = war ? (1 - map / 100 + 3) / 4 : 1 - map / 100
  const warf = war ? 1.10 : 1
  const raw = 0.12 * tAcres * gf * mapf * warf
  const cap = 0.2 * Math.min(yAcres, tAcres)
  return { gain: Math.min(raw, cap), capped: raw >= cap }
}
function legacyInRange(yNW, yAcres, tNW, tAcres) {
  const nwIn = tNW / yNW >= 0.85 && tNW / yNW <= 1.1765
  const landIn = tAcres / yAcres >= 0.85 && tAcres / yAcres <= 1.1765
  const smaller = tNW < yNW || tAcres < yAcres
  return smaller ? nwIn && landIn : nwIn || landIn
}

// Real kingdom grid (We Wanna Fly, 4:1) as captured on Mar 4 YR1: name, acres, networth.
const KD41 = [
  ['Kiwi', 714, 124620], ['Darwins rhea', 414, 65658], ['Titicaca Grebe', 668, 113683], ['Cassowary', 695, 127800],
  ['Weka', 616, 101073], ['Kakapo', 608, 125059], ['Arulco-side Dodos', 439, 76766], ['Great Spotted Kiwi', 478, 77483],
  ['Roadrunner', 695, 125896], ['Terror Birds', 705, 121836], ['Angry Bird', 617, 109107], ['Galapagos Penguin', 562, 102263],
  ['Humboldt Penguin', 475, 77483], ['Turkey', 516, 93603], ['Ostrich', 387, 59110], ['Giant Elephant Bird', 619, 96381],
  ['Galapagos crake', 477, 80582], ['Crippled Pigeon', 712, 127415], ['Emu', 637, 110413], ['Moa', 717, 118287],
].map(([name, acres, nw]) => ({ name, kd: '4:1', acres, nw }))

const names = (rows) => rows.map((r) => r.p.name)

test('gain estimate and range check match the original PayoffPanel formulas exactly', () => {
  const yourNW = [41307, 50450, 61687, 100000]
  const yourAcres = [386, 500, 688]
  const theirNW = [59110, 77483, 101073, 127800, 220000]
  const theirAcres = [195, 387, 618, 746, 1500]
  let checked = 0
  for (const yNW of yourNW) for (const yA of yourAcres) for (const tNW of theirNW) for (const tA of theirAcres)
    for (const map of [0, 15, 50]) for (const war of [false, true]) {
      assert.deepStrictEqual(estimateGain(yNW, yA, tNW, tA, map, war), legacyEstimate(yNW, yA, tNW, tA, map, war))
      assert.strictEqual(inRange(yNW, yA, tNW, tA), legacyInRange(yNW, yA, tNW, tA))
      checked++
    }
  assert.ok(checked > 1000)
})

test('softest mode puts the lightest NW per acre first and the heaviest last', () => {
  const rows = rankTargets({ targets: KD41, mode: 'soft', limit: 20 })
  assert.deepStrictEqual(names(rows).slice(0, 3), ['Ostrich', 'Giant Elephant Bird', 'Darwins rhea'])
  assert.equal(names(rows).at(-1), 'Kakapo')
  assert.ok(rows.every((r) => r.gain === null && r.basis === 'nw'))
})

test('hardness is relative to the kingdom median and is below 1 for light provinces', () => {
  const rows = rankTargets({ targets: KD41, mode: 'soft', limit: 20 })
  const ostrich = rows.find((r) => r.p.name === 'Ostrich')
  const kakapo = rows.find((r) => r.p.name === 'Kakapo')
  assert.ok(ostrich.vsKd < 0 && kakapo.vsKd > 0)
  const med = median(KD41.map((p) => p.nw / p.acres))
  assert.ok(Math.abs(ostrich.hardness - (59110 / 387) / med) < 1e-9)
})

test('value mode: top row is 100, list is sorted, and the hardest province is not near the top', () => {
  const rows = rankTargets({ targets: KD41, you: { nw: 61687, acres: 688 }, mode: 'value', limit: 20 })
  assert.equal(rows[0].value, 100)
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].value >= rows[i].value)
  assert.ok(!names(rows).slice(0, 5).includes('Kakapo'))
  assert.ok(rows.every((r) => r.gain !== null && r.gain > 0))
})

test('gain mode sorts by estimated acres', () => {
  const rows = rankTargets({ targets: KD41, you: { nw: 61687, acres: 688 }, mode: 'gain', limit: 20 })
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].gain >= rows[i].gain)
})

test('range filter keeps only legal targets and can leave an empty list', () => {
  // A 300-acre, 41k NW province has nobody in 4:1 within land or networth range (smallest there is 387a / 59k).
  assert.deepStrictEqual(rankTargets({ targets: KD41, you: { nw: 41307, acres: 300 }, rangeOnly: true }), [])
  // The range rule is the original one: a larger target only needs to meet EITHER limit.
  const small = rankTargets({ targets: KD41, you: { nw: 41307, acres: 427 }, rangeOnly: true, limit: 20 })
  assert.ok(small.length > 0 && small.every((r) => legacyInRange(41307, 427, r.nw, r.acres)))
  const wide = rankTargets({ targets: KD41, you: { nw: 100000, acres: 640 }, rangeOnly: true, limit: 20 })
  assert.ok(wide.length > 0 && wide.every((r) => inRange(100000, 640, r.nw, r.acres)))
})

test('with only networth known the range filter uses networth alone and no gain is estimated', () => {
  const rows = rankTargets({ targets: KD41, you: { nw: 100000 }, rangeOnly: true, limit: 20 })
  assert.ok(rows.length > 0)
  assert.ok(rows.every((r) => r.gain === null && r.nw / 100000 >= 0.85 && r.nw / 100000 <= 1.1765))
})

test('a defense capture switches that province to a defense-per-acre basis', () => {
  const withDef = KD41.map((p) => ({ ...p, def: p.acres * 30 }))
  withDef[0] = { ...withDef[0], def: withDef[0].acres * 60 } // Kiwi at double the kingdom norm
  const rows = rankTargets({ targets: withDef, mode: 'soft', limit: 20 })
  assert.ok(rows.every((r) => r.basis === 'def'))
  assert.equal(names(rows).at(-1), 'Kiwi')
  assert.ok(Math.abs(rows.find((r) => r.p.name === 'Kiwi').hardness - 2) < 1e-9)
})

test('defHome is preferred over def, like the old panel', () => {
  const t = [
    { name: 'A', kd: '1:1', acres: 500, nw: 50000, def: 5000, defHome: 20000 },
    { name: 'B', kd: '1:1', acres: 500, nw: 50000, def: 5000 },
    { name: 'C', kd: '1:1', acres: 500, nw: 50000, def: 5000 },
  ]
  const rows = rankTargets({ targets: t, mode: 'soft' })
  assert.equal(rows.find((r) => r.p.name === 'A').def, 20000)
})

test('a kingdom with fewer than three provinces borrows the pooled median', () => {
  const small = [{ name: 'S1', kd: '9:9', acres: 400, nw: 40000 }, { name: 'S2', kd: '9:9', acres: 400, nw: 80000 }]
  const rows = rankTargets({ targets: [...KD41, ...small], mode: 'soft', limit: 40 })
  const all = [...KD41, ...small].map((p) => p.nw / p.acres)
  const s1 = rows.find((r) => r.p.name === 'S1')
  assert.equal(s1.basis, 'nw')
  assert.ok(Math.abs(s1.hardness - 100 / median(all)) < 1e-9)
})

test('kingdom filter changes who is shown, not how hard anyone is', () => {
  const other = [1, 2, 3].map((i) => ({ name: 'X' + i, kd: '2:2', acres: 500, nw: 90000 * (1 + i / 20) }))
  const both = rankTargets({ targets: [...KD41, ...other], mode: 'soft', limit: 50 })
  const only = rankTargets({ targets: [...KD41, ...other], mode: 'soft', limit: 50, kd: '4:1' })
  assert.equal(only.length, KD41.length)
  for (const r of only) assert.equal(r.hardness, both.find((b) => b.p.name === r.p.name).hardness)
})

test('rows with missing or zero values are dropped, and hardness is clamped', () => {
  const t = [
    ...KD41,
    { name: 'NoAcres', kd: '4:1', acres: null, nw: 90000 },
    { name: 'NoNW', kd: '4:1', acres: 500, nw: 0 },
    { name: 'Tiny', kd: '4:1', acres: 600, nw: 600 },
  ]
  const rows = rankTargets({ targets: t, mode: 'soft', limit: 50 })
  assert.ok(!names(rows).includes('NoAcres') && !names(rows).includes('NoNW'))
  assert.equal(rows.find((r) => r.p.name === 'Tiny').hardness, 0.25)
})

test('numbers given as comma strings are accepted', () => {
  const rows = rankTargets({ targets: [{ name: 'A', kd: '1:1', acres: '1,000', nw: '150,000' }, ...KD41], you: { nw: '120,000', acres: '900' } })
  assert.ok(rows.length >= 1)
})

test('empty input is safe', () => {
  assert.deepStrictEqual(rankTargets({}), [])
  assert.deepStrictEqual(rankTargets({ targets: [] }), [])
  assert.deepStrictEqual(rankTargets(), [])
})

test('grades cover the whole range', () => {
  assert.equal(gradeValue(100).letter, 'S')
  assert.equal(gradeValue(65).letter, 'A')
  assert.equal(gradeValue(45).letter, 'B')
  assert.equal(gradeValue(25).letter, 'C')
  assert.equal(gradeValue(5).letter, 'D')
})
