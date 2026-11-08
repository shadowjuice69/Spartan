const test = require('node:test')
const assert = require('node:assert/strict')
function baseHours(targetKingdom, ownKingdom) { return targetKingdom && targetKingdom === ownKingdom ? 7 : 14 }
test('same-kingdom base attack time is seven hours', () => assert.equal(baseHours('6:8', '6:8'), 7))
test('inter-kingdom base attack time is fourteen hours', () => assert.equal(baseHours('6:7', '6:8'), 14))
test('unknown kingdom uses conservative inter-kingdom base', () => assert.equal(baseHours(null, '6:8'), 14))

const fs = require('node:fs')
const source = fs.readFileSync('app/command/returns/page.tsx', 'utf8')
test('return tracker collapses same-timestamp cross-label duplicates by attack identity', () => {
  assert.match(source, /function dedupeAttackEvents/)
  assert.ok(source.includes('Number.isFinite(stamp) ? stamp : event.at'))
  assert.ok(source.includes('specificity(event.type) > specificity(previous.type)'))
  assert.ok(source.includes('dedupeAttackEvents(events)'))
})
test('return tracker keeps separate same-target attacks when timestamps differ', () => {
  const signature = (event) => [Date.parse(event.at), event.direction, event.attacker, event.defender, event.targetKingdom, Math.abs(event.acres), event.troops || 0].join('|')
  const first = { at: '2026-11-08T03:11:00Z', direction: 'out', attacker: 'Finkster', defender: 'Ayoko na mag Utopia', targetKingdom: '6:8', acres: 24, troops: 0 }
  const second = { ...first, at: '2026-11-08T03:11:30Z', acres: 40 }
  assert.notEqual(signature(first), signature(second))
})
