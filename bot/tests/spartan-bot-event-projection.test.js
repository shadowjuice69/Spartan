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


const { mergeProjectionState } = require('../services/spartanQueueProcessor');

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
