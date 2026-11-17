const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBotMagicReports, parseBotThieveryReports, parseBotAidTransfers } = require('../../lib/spartan/bot-intel-parsers.cjs');

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
    raw_text: ':detective::green_heart: Golden Lotus of Prosperity simo#  <<__spy on throne__ **| Bam (1:3)**>> **13233**|106 sent (0.14)|2.79 (m.3.49)|rNW 0.8\\n:detective::broken_heart: Chapter One mez#  <<__bribe generals__ **| Ayoko na mag Utopia (3:11)**>> __FAIL__|118 sent (0.19)|3.77 (m.4.46)|rNW 1.03',
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
  assert.ok(route.includes(".or(page === 'magic'"));
  assert.ok(route.includes("page_kind.eq.magic,raw_text.like.%:star2:%,raw_text.like.%:comet:%"));
  assert.ok(route.includes("page_kind.eq.thievery,raw_text.like.%:detective:%"));
  assert.match(route, /\.gte\('created_at', ageStartedAt!\)/);
});

test('Aid bot parser extracts multiple resource transfers from one moneybag report', () => {
  const line = ':moneybag: Evelyn [vyciou#] sent __3,938 gold coins and 22 soldiers__ to Affair with an Orc [rorz87]';
  const rows = parseBotAidTransfers([
    { id: 'vault-1', source: 'discord-bot', source_id: 'discord-aid-1', captured_at: '2026-10-27T10:05:35.523Z', raw_text: line },
    { id: 'vault-2', source: 'discord-bot', source_id: 'discord-aid-1', captured_at: '2026-10-27T10:05:35.523Z', raw_text: line },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { sender: rows[0].sender, recipient: rows[0].recipient, amount: rows[0].amount, resource: rows[0].resource, repeats: rows[0].occurrences },
    { sender: 'Evelyn', recipient: 'Affair with an Orc', amount: 3938, resource: 'gold coins', repeats: 2 },
  );
  assert.deepEqual(
    { amount: rows[1].amount, resource: rows[1].resource },
    { amount: 22, resource: 'soldiers' },
  );
});

test('duplicate bot lines collapse only within the same Discord message', () => {
  const line = ':detective::broken_heart: Kurt kur# <<__rob the towers__ **| Plague Doctor (6:7)**>> __FAIL__ (-0 thieves)|10 sent (0.02)|0.4 (m.0.48)';
  const rows = parseBotThieveryReports([
    { id: 'vault-1', source: 'discord-bot', source_id: 'discord-same', captured_at: '2026-10-27T12:47:20.971Z', raw_text: line },
    { id: 'vault-2', source: 'discord-bot', source_id: 'discord-same', captured_at: '2026-10-27T12:47:20.971Z', raw_text: line },
    { id: 'vault-3', source: 'discord-bot', source_id: 'discord-different', captured_at: '2026-10-27T12:48:20.971Z', raw_text: line },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.sourceId === 'discord-same').occurrences, 2);
  assert.equal(rows.find(r => r.sourceId === 'discord-different').occurrences, 1);
});

test('vault-only historical bot records are clearly marked archived', () => {
  const rows = parseBotMagicReports([{
    id: 'vault-4', source: 'discord-bot', source_id: 'discord-old',
    captured_at: '2026-10-27T12:54:24.241Z', archived: true,
    raw_text: ':star2::green_heart: Aurequill the Radiant# <<__natures blessing__>> **20** | 9.6% guilds',
  }]);
  assert.equal(rows[0].archived, true);
});

test('Aid vertical reads moneybag bot transfers from raw vault evidence', () => {
  const route = fs.readFileSync('app/api/intel-data/route.ts', 'utf8');
  assert.match(route, /parseBotAidTransfers/);
  assert.match(route, /vault-readthrough/);
  assert.match(route, /:moneybag:/);
});
test('shared Intel keeps the current account own-visibility records', () => {
  const route = fs.readFileSync('app/api/intel-data/route.ts', 'utf8');
  assert.match(route, /row\.user_id !== user\.id && row\.user_id !== account\.id/);
});
test('Magic and Thievery pages can read historical vault-only bot captures without replay', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /from\('spartan_capture_vault'\)/);
  assert.match(route, /vaultOnlyRows/);
  assert.match(route, /source_vault_id: r\.id/);
});

test('bot backfill recognizes moneybag transfers but keeps the 48-hour recovery window', () => {
  const processor = fs.readFileSync('bot/services/spartanQueueProcessor.js', 'utf8');
  assert.match(processor, /raw_text\.like\.%:moneybag:%/);
  assert.match(processor, /48 \* 60 \* 60 \* 1000/);
});

test('Magic and Thievery vault read-through dedupes only against records returned in the page response', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /const projectedCaptureIds = new Set\(botRows\.map/);
  assert.match(route, /!projectedCaptureIds\.has\(r\.capture_id\)/);
  assert.match(route, /older projected[\s\S]{0,120}outside that bounded result remain eligible/);
});


test('command overview reads UtopiaIntel fallback pages when Council pages were not captured', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /grab\('militaryTraining', KINDS\.military, '%\/wol\/game\/train_army%'/);
  assert.match(route, /grab\('sciencePage', KINDS\.science, '%\/wol\/game\/science%'/);
  assert.match(route, /grab\('construction', KINDS\.buildings, '%\/wol\/game\/build%'/);
  assert.match(route, /const trainingUnits = militaryTraining\?\.raw_text \? parseTrainingUnits/);
  assert.match(route, /source: 'throne\\+train_army'/);
  assert.match(route, /sci\?\.raw_text \? parseScience/);
});

test('latest page capture selection uses capture time before database insertion time', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /\.order\('captured_at', \{ ascending: false \}\)\.order\('created_at', \{ ascending: false \}\)/);
});

test('Buildings page can use the current Build screen when Council Internal Affairs is absent', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /function parseBuildPage\(text: string\)/);
  assert.match(route, /const buildModel = construction\?\.raw_text \? parseBuildPage/);
  assert.match(route, /const current = councilModel \? \{/);
});


test('Command Center uses the same fresh Throne values as the Province page', () => {
  const page = fs.readFileSync('app/page.tsx', 'utf8');
  assert.match(page, /f\.acres \?\? t\?\.acres/);
  assert.match(page, /f\.networth \?\? t\?\.networth/);
  assert.match(page, /f\.offense \?\? t\?\.offense/);
  assert.match(page, /f\.defense \?\? t\?\.defense/);
  assert.match(page, /f\.peons \?\? t\?\.peons/);
});

test('Command Center derives a read-only history point from a newer Throne receipt', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /const storedHistoryAt = history\.reduce/);
  assert.match(route, /if \(throneData && throneCapturedAt > storedHistoryAt\)/);
  assert.match(route, /source: 'utopiaintel_throne_readthrough'/);
  assert.match(route, /never inserts, updates, or rewrites historical rows/);
});

test('Command Center military data prefers current Throne unit counts over stale training-page counts', () => {
  const route = fs.readFileSync('app/api/page-models/route.ts', 'utf8');
  assert.match(route, /home: toNum\(throneData\?\.unitCounts\?\.\[unit\.name\]\) \?\? unit\.owned/);
  assert.match(route, /offPoints: throneData\?\.offense \?\? parsedMilitary\.offPoints/);
  assert.match(route, /defPoints: throneData\?\.defense \?\? parsedMilitary\.defPoints/);
});
