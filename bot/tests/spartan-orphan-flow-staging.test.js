const test = require('node:test');
const assert = require('node:assert/strict');
const { stageOrphanFlows } = require('../services/spartanQueueProcessor');

test('orphan flow stager calls the service RPC with a bounded batch and returns count', async () => {
  let call;
  const sb = {
    async rpc(name, args) {
      call = { name, args };
      return { data: 46, error: null };
    },
  };

  const staged = await stageOrphanFlows(sb);

  assert.equal(staged, 46);
  assert.deepEqual(call, {
    name: 'spartan_stage_orphan_flows',
    args: { p_limit: 100 },
  });
});

test('orphan flow stager surfaces database errors', async () => {
  const sb = {
    async rpc() {
      return { data: null, error: { message: 'database unavailable' } };
    },
  };

  await assert.rejects(
    () => stageOrphanFlows(sb, 25),
    /spartan_stage_orphan_flows: database unavailable/,
  );
});
