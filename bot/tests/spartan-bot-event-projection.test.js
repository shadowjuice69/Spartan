const test = require('node:test');
const assert = require('node:assert/strict');
const { runIntegrity } = require('../services/spartanStewardSystem');

test('Discord bot_event flows pass integrity without a province projection', async () => {
  let queried = false;
  const sb = {
    from() {
      queried = true;
      throw new Error('bot-only Intel must not query province projections');
    },
  };

  const result = await runIntegrity(
    sb,
    {
      flow_id: 'bot-flow-test',
      source: 'discord-bot',
      page_kind: 'bot_event',
      province_id: 'province-test',
      kingdom_id: '6:8',
    },
    123,
    'province-test',
    { skipProjection: true },
  );

  assert.equal(result.steward, 'integrity');
  assert.equal(result.decision, 'pass');
  assert.equal(result.details.scope, 'bot-intel-only');
  assert.equal(result.details.projection_required, false);
  assert.equal(queried, false);
});


const { mergeProjectionState, isStructuredGameIntelMessage } = require('../services/spartanQueueProcessor');

test('legacy bot-event projection fields are discarded when a real page arrives', () => {
  const merged = mergeProjectionState(
    { data: { event_type: 'attack', discord: { message_id: 'x' }, acres: 999 } },
    { data: { acres: 120, population: 45000 } },
    { source: 'discord-bot', page_kind: 'bot_event' },
  );
  assert.deepEqual(merged.data, { acres: 120, population: 45000 });
});

test('normal page projections still merge partial-page data', () => {
  const merged = mergeProjectionState(
    { data: { acres: 120, mana: 75 } },
    { data: { acres: 125, population: 45000 } },
    { source: 'universal_capture', page_kind: 'throne' },
  );
  assert.deepEqual(merged.data, { acres: 125, mana: 75, population: 45000 });
});


test('older capture cannot overwrite a newer capture of the same page kind', () => {
  const merged = mergeProjectionState(
    { page_kind: 'throne', captured_at: '2026-11-07T12:00:00.000Z', data: { acres: 900, population: 50000 } },
    { page_kind: 'throne', captured_at: '2026-11-07T10:00:00.000Z', capture_id: 'late-old-capture', data: { acres: 700, population: 42000 } },
    { source: 'universal_capture', page_kind: 'throne' },
  );
  assert.deepEqual(merged.data, { acres: 900, population: 50000 });
  assert.equal(merged.stale_page_capture, true);
  assert.equal(merged.captured_at, '2026-11-07T12:00:00.000Z');
});

test('fresh captures of different page kinds still merge partial data', () => {
  const merged = mergeProjectionState(
    { page_kind: 'throne', captured_at: '2026-11-07T12:00:00.000Z', page_capture_timestamps: { throne: '2026-11-07T12:00:00.000Z' }, data: { acres: 900 } },
    { page_kind: 'science', captured_at: '2026-11-07T12:30:00.000Z', data: { science: { economy: 10 } } },
    { source: 'universal_capture', page_kind: 'throne' },
  );
  assert.deepEqual(merged.data, { acres: 900, science: { economy: 10 } });
  assert.equal(merged.page_capture_timestamps.science, '2026-11-07T12:30:00.000Z');
  assert.equal(merged.stale_page_capture, false);
});

test('legacy projection timestamp does not block a different page kind', () => {
  const merged = mergeProjectionState(
    { page_kind: 'throne', captured_at: '2026-11-07T12:00:00.000Z', data: { acres: 900 } },
    { page_kind: 'science', captured_at: '2026-11-07T08:00:00.000Z', data: { science: { economy: 10 } } },
    { source: 'universal_capture', page_kind: 'throne' },
  );
  assert.deepEqual(merged.data, { acres: 900, science: { economy: 10 } });
  assert.equal(merged.stale_page_capture, false);
});

test('self-spell bot messages are recognized as structured Magic Intel', () => {
  assert.equal(isStructuredGameIntelMessage(':star2::green_heart: Golden Lotus simo# <<__minor protection__>> **16** | 35.6% guilds'), true);
  assert.equal(isStructuredGameIntelMessage(':comet::broken_heart: Evelyn vyciou# <<__pitfalls__ **| A target (3:8)**>> __FAIL__ (-8 wizards)'), true);
});

test('Thievery results with a duration/count field before thieves sent are recognized', () => {
  assert.equal(isStructuredGameIntelMessage(':detective::green_heart: Ding-dong shrugste# <<__rob the vaults__ **| switch (6:1)**>> **13233**|400 sent (0.46)|2.78 (m.3.57)|rNW 0.92'), true);
});

test('moneybag bot transfers are recognized as structured Aid Intel', () => {
  assert.equal(isStructuredGameIntelMessage(':moneybag: Sky [sk#] sent __12,220 gold coins__ to Affair with an Orc [rorz87]'), true);
  assert.equal(isStructuredGameIntelMessage(':moneybag: Evelyn [vyciou#] sent __3,938 gold coins and 22 soldiers__ to Affair with an Orc [rorz87]'), true);
});

test('ordinary bot chat and status messages remain excluded from structured Intel', () => {
  assert.equal(isStructuredGameIntelMessage('Updated aid list'), false);
  assert.equal(isStructuredGameIntelMessage('15k off'), false);
});
