const test = require('node:test')
const assert = require('node:assert/strict')
function baseHours(targetKingdom, ownKingdom) { return targetKingdom && targetKingdom === ownKingdom ? 7 : 14 }
test('same-kingdom base attack time is seven hours', () => assert.equal(baseHours('6:8', '6:8'), 7))
test('inter-kingdom base attack time is fourteen hours', () => assert.equal(baseHours('6:7', '6:8'), 14))
test('unknown kingdom uses conservative inter-kingdom base', () => assert.equal(baseHours(null, '6:8'), 14))

const fs = require('node:fs')
const source = fs.readFileSync('app/command/returns/page.tsx', 'utf8')
const pageModelsSource = fs.readFileSync('app/api/page-models/route.ts', 'utf8')
const frontLineRouteSource = fs.readFileSync('app/api/front-line/route.ts', 'utf8')
const throneRouteSource = fs.readFileSync('app/api/throne/route.ts', 'utf8')

test('Throne API reads province history by both registry and account identity', () => {
  assert.ok(throneRouteSource.includes(".select('id,auth_user_id,discord_user_id,screen_name,province_name,province_location,role')"))
  assert.ok(throneRouteSource.includes(".in('province_id', historyIds)"))
  assert.ok(throneRouteSource.includes('province.province_name === account.province_name && account.id'))
})

test('Throne API chooses the newer province history instead of stale projection', () => {
  assert.ok(throneRouteSource.includes('historyTime > projectionTime'))
  assert.ok(throneRouteSource.includes('const captured = historyIsNewer ?'))
  assert.ok(throneRouteSource.includes('created_at: snapshotTime'))
})

test('canonical Bot Intel KDNEWS reports feed News and Return Tracker', () => {
  assert.ok(pageModelsSource.includes("discordKingdomEvents([...records, ...((mpResult.data || []) as Rec[])], own)"))
  assert.ok(pageModelsSource.includes(".eq('page_kind', 'bot_event').eq('source', 'discord-bot')"))
  assert.ok(pageModelsSource.includes('attacked and pillaged'))
})

test('Front Line includes canonical Bot Intel combat events', () => {
  assert.ok(frontLineRouteSource.includes(".in('page_kind', ['news', 'bot_event'])"))
})
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
