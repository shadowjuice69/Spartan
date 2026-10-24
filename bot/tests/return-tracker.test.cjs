const test = require('node:test')
const assert = require('node:assert/strict')
function baseHours(targetKingdom, ownKingdom) { return targetKingdom && targetKingdom === ownKingdom ? 7 : 14 }
test('same-kingdom base attack time is seven hours', () => assert.equal(baseHours('6:8', '6:8'), 7))
test('inter-kingdom base attack time is fourteen hours', () => assert.equal(baseHours('6:7', '6:8'), 14))
test('unknown kingdom uses conservative inter-kingdom base', () => assert.equal(baseHours(null, '6:8'), 14))
