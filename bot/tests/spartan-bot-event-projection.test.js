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
