const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBotMagicReports, parseBotThieveryReports } = require('../lib/spartan/bot-intel-parsers.cjs');

test('Magic bot parser captures successful self spells and failed targeted spells with provenance', () => {
  const records = [{
    id: 'intel-1', source: 'discord-bot', source_id: 'discord-100',
    captured_at: '2026-11-08T02:04:24.290Z',
    raw_text: ':star2::green_heart: Who gets married every age vel#  <<__inspire army__>> **14** | 9% guilds (78% BE (m.7))\\n:comet::broken_heart: Evelyn vyciou#  <<__pitfalls__ **| An unknown province from (3:8)**>> __FAIL__ (-8 wizards)|11.3% guilds',
  }];
  const rows = parseBotMagicReports(records);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { caster: rows[0].caster, spell: rows[0].spell, outcome: rows[0].outcome, days: rows[0].durationDays, sourceId: rows[0].sourceId },
    { caster: 'Who gets married every age vel', spell: 'inspire army', outcome: 'success', days: 14, sourceId: 'discord-100' },
  );
  assert.deepEqual(
    { spell: rows[1].spell, target: rows[1].targetProvince, kingdom: rows[1].targetKingdom, outcome: rows[1].outcome, lost: rows[1].wizardsLost },
    { spell: 'pitfalls', target: 'An unknown province from', kingdom: '3:8', outcome: 'failed', lost: 8 },
  );
});

test('Thievery bot parser extracts operation, target, sent count, ratios and outcome', () => {
  const records = [{
    id: 'intel-2', source: 'discord-bot', source_id: 'discord-200',
    captured_at: '2026-11-08T22:28:21.811Z',
    raw_text: ':detective::green_heart: Golden Lotus of Prosperity simo#  <<__spy on throne__ **| Bam (1:3)**>>|106 sent (0.14)|2.79 (m.3.49)|rNW 0.8\\n:detective::broken_heart: Chapter One mez#  <<__bribe generals__ **| Ayoko na mag Utopia (3:11)**>> __FAIL__|118 sent (0.19)|3.77 (m.4.46)|rNW 1.03',
  }];
  const rows = parseBotThieveryReports(records);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { actor: rows[0].actor, op: rows[0].op, province: rows[0].province, kingdom: rows[0].kingdom, sent: rows[0].thievesSent, ownTpa: rows[0].ownTpa, targetTpa: rows[0].targetTpa, modified: rows[0].targetModifiedTpa, outcome: rows[0].outcome, sourceId: rows[0].sourceId },
    { actor: 'Golden Lotus of Prosperity simo', op: 'spy on throne', province: 'Bam', kingdom: '1:3', sent: 106, ownTpa: 0.14, targetTpa: 2.79, modified: 3.49, outcome: 'success', sourceId: 'discord-200' },
  );
  assert.equal(rows[1].outcome, 'failed');
});

test('bot parsers ignore unrelated messages and never infer game-page captures', () => {
  const records = [{ source: 'discord-bot', source_id: 'discord-300', raw_text: 'hello kingdom, good luck this age' }];
  assert.deepEqual(parseBotMagicReports(records), []);
  assert.deepEqual(parseBotThieveryReports(records), []);
});

const fs = require('node:fs');
test('Aid is allowed through the dynamic Intel section route', () => {
  const route = fs.readFileSync('app/command/[section]/page.tsx', 'utf8');
  assert.match(route, /'aid'/);
});
test('Magic and Thievery load bot reports in a separate current-age query', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /botIntelResult/);
  assert.match(route, /\.eq\('source', 'discord-bot'\)/);
  assert.match(route, /\.in\('page_kind', \['magic', 'thievery', 'bot_event'\]\)/);
  assert.match(route, /\.gte\('created_at', ageStartedAt!\)/);
});
