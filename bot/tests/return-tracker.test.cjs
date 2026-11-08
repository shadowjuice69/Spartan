const test = require('node:test')
const assert = require('node:assert/strict')
function baseHours(targetKingdom, ownKingdom) { return targetKingdom && targetKingdom === ownKingdom ? 7 : 14 }
test('same-kingdom base attack time is seven hours', () => assert.equal(baseHours('6:8', '6:8'), 7))
test('inter-kingdom base attack time is fourteen hours', () => assert.equal(baseHours('6:7', '6:8'), 14))
test('unknown kingdom uses conservative inter-kingdom base', () => assert.equal(baseHours(null, '6:8'), 14))

const { destinationKingdomForEvent } = require('../../lib/spartan/return-time.cjs')

test('outgoing army returns to the defender kingdom', () => {
  assert.equal(destinationKingdomForEvent({
    direction: 'out', attackerKingdom: '6:8', defenderKingdom: '3:11', fallback: '3:11',
  }), '3:11')
})

test('incoming enemy army returns to the attacker kingdom, not our kingdom', () => {
  assert.equal(destinationKingdomForEvent({
    direction: 'in', attackerKingdom: '3:11', defenderKingdom: '6:8', fallback: '6:8',
  }), '3:11')
})

test('unknown incoming destination stays unknown for conservative timing', () => {
  assert.equal(destinationKingdomForEvent({
    direction: 'in', attackerKingdom: null, defenderKingdom: '6:8', fallback: '6:8',
  }), null)
})

test('other-side events retain their explicit target kingdom', () => {
  assert.equal(destinationKingdomForEvent({
    direction: 'other', attackerKingdom: '6:8', defenderKingdom: '3:11', fallback: '3:11',
  }), '3:11')
})
