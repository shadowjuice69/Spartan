const test = require('node:test');
const assert = require('node:assert/strict');

test('canonical website Intel command handlers load successfully', () => {
  const handlers = [
    require('../handlers/commands/intelOpsHandler'),
    require('../handlers/commands/targetHandler'),
    require('../handlers/commands/scienceSummaryHandler'),
    require('../handlers/commands/investHandler')
  ];
  for (const handler of handlers) assert.equal(typeof handler, 'function');
});
