const test = require('node:test')
const assert = require('node:assert/strict')
const { planExplore, apportion, key } = require('../../lib/spartan/explore-planner')

const sum = (xs) => xs.reduce((a, b) => a + b, 0)

test('apportion sums to the total and follows the weights', () => {
  assert.deepEqual(apportion([1, 1, 1], 10).sort(), [3, 3, 4])
  assert.equal(sum(apportion([5, 3, 2], 101)), 101)
  assert.deepEqual(apportion([0, 0], 5), [0, 0])
})

test('building names match across sources', () => {
  assert.equal(key("Thieves' Dens"), key('Thieves Dens'))
  assert.equal(key('Barracks'), key('Military Barracks'))
  assert.equal(key('Armories'), key('Armouries'))
})

test('new land goes to the buildings you are short on', () => {
  const p = planExplore({
    current: { Homes: 200, Farms: 100 },
    target: { Homes: 50, Farms: 50 },
    exploreAcres: 100, hours: 48, batches: 2,
  })
  assert.equal(p.finalLand, 400)
  const farms = p.rows.find((r) => r.name === 'Homes')
  assert.equal(farms.goal, 200)
  assert.equal(p.rows.find((r) => r.name === 'Farms').add, 100)
  assert.equal(sum(p.batches.map((b) => b.build.Farms || 0)), 100)
  assert.equal(p.rebuildNeeded, 0)
  assert.equal(p.warnings.length, 0)
})

test('batches add up to the acres asked for and every acre is assigned', () => {
  const p = planExplore({
    current: { Homes: 100, Farms: 100, Banks: 100 },
    target: { Homes: 30, Farms: 30, Banks: 20, Towers: 20 },
    exploreAcres: 101, hours: 72, batches: 3,
  })
  assert.equal(sum(p.batches.map((b) => b.acres)), 101)
  assert.equal(sum(p.batches.map((b) => sum(Object.values(b.build)))), 101)
  assert.ok(p.batches.every((b) => b.builtHour === b.startHour + 24))
})

test('existing barren land is built first', () => {
  const p = planExplore({
    current: { 'Barren Land': 50, Homes: 100, Farms: 50 },
    target: { Homes: 50, Farms: 50 },
    exploreAcres: 50, hours: 48, batches: 1,
  })
  assert.equal(p.barrenNow, 50)
  assert.equal(p.batches[0].kind, 'barren')
  assert.equal(p.batches[0].built, 50)
  assert.equal(sum(p.batches.map((b) => sum(Object.values(b.build)))), 100)
})

test('over-built buildings are reported, never silently razed', () => {
  const p = planExplore({
    current: { Homes: 300, Farms: 100 },
    target: { Homes: 50, Farms: 50 },
    exploreAcres: 100, hours: 48, batches: 1,
  })
  assert.equal(p.rebuildNeeded, 50)
  assert.equal(p.rows.find((r) => r.name === 'Farms').add, 100)
  assert.equal(p.rows.find((r) => r.name === 'Homes').add, 0)
  assert.ok(p.warnings.some((w) => /razing/.test(w)))
})

test('a window shorter than explore plus build time is flagged', () => {
  const p = planExplore({ current: { Homes: 100 }, target: { Homes: 100 }, exploreAcres: 10, hours: 10, batches: 1 })
  assert.equal(p.fitsWindow, false)
  assert.ok(p.warnings.some((w) => /shorter/.test(w)))
})

test('more batches spread the starts across the window', () => {
  const p = planExplore({ current: { Homes: 100 }, target: { Homes: 100 }, exploreAcres: 30, hours: 72, batches: 3 })
  assert.deepEqual(p.batches.map((b) => b.startHour), [0, 24, 48])
  assert.equal(p.fitsWindow, true)
})

test('costs, growth and affordability', () => {
  const p = planExplore({
    current: { Homes: 100 }, target: { Homes: 100 }, exploreAcres: 100, hours: 48, batches: 2,
    goldPerAcre: 1000, soldiersPerAcre: 10, costGrowthPct: 10, goldStock: 60000, soldierStock: 5000,
  })
  assert.equal(p.batches[0].goldCost, 50000)
  assert.equal(p.batches[1].goldCost, 55000)
  assert.equal(p.totals.soldiers, 1000)
  assert.equal(p.batches[0].affordable, true)
  assert.equal(p.batches[1].affordable, false)
  assert.ok(p.shortGold > 0)
  assert.ok(p.warnings.some((w) => /Gold runs short/.test(w)))
})

test('income makes later batches affordable', () => {
  const p = planExplore({
    current: { Homes: 100 }, target: { Homes: 100 }, exploreAcres: 100, hours: 48, batches: 2,
    goldPerAcre: 1000, goldStock: 50000, goldPerHour: 3000,
  })
  // batch 2 starts at hour 24: 50,000 + 72,000 income - 100,000 spent = 22,000 left
  assert.ok(p.batches.every((b) => b.affordable))
  assert.equal(p.shortGold, 0)
})

test('explore up to a target land size', () => {
  const p = planExplore({ current: { Homes: 100 }, target: { Homes: 100 }, targetLand: 175, hours: 48, batches: 1 })
  assert.equal(p.totalExplore, 75)
  assert.equal(p.finalLand, 175)
})

test('batch size over the game limit is flagged', () => {
  const p = planExplore({ current: { Homes: 100 }, target: { Homes: 100 }, exploreAcres: 100, hours: 48, batches: 1, maxPerBatch: 40 })
  assert.ok(p.warnings.some((w) => /at least 3 batches/.test(w)))
})

test('build percentages that do not total 100 are scaled and said so', () => {
  const p = planExplore({ current: { Homes: 100 }, target: { Homes: 30, Farms: 30 }, exploreAcres: 100, hours: 48, batches: 1 })
  assert.ok(p.warnings.some((w) => /scaled to 100%/.test(w)))
  assert.equal(sum(p.rows.map((r) => r.goal)), 200)
})

test('bad input returns an error, not a crash', () => {
  assert.ok(planExplore({}).error)
  assert.ok(planExplore({ current: { Homes: 10 }, target: {} }).error)
  assert.ok(planExplore(null).error)
})
