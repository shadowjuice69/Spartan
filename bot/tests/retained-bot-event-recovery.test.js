const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RETAINED_BOT_EVENT_ALLOWLIST,
  recoverRetainedBotEvent,
} = require('../services/retainedBotEventRecovery');
const { syncBotIntelRecord } = require('../services/spartanQueueProcessor');

const AID_EVENT_ID = '0c975d16-094c-4d5b-80b8-498ed6234fb5';
const AID_CAPTURE_ID = `bot-${AID_EVENT_ID}`;
const AID_SOURCE_ID = '1564522035852349561';
const CAPTURED_AT = '2026-10-27T06:12:00.881742Z';

function makeEvent(eventId = AID_EVENT_ID, overrides = {}) {
  return {
    event_id: eventId,
    direction: 'outbound',
    event_type: 'discord_message',
    discord_user_id: 'discord-user',
    discord_channel_id: 'discord-channel',
    discord_guild_id: 'discord-guild',
    message_id: AID_SOURCE_ID,
    content: ':moneybag: Sky [sk#] sent __8,809 gold coins__ to Chapter One [mezl]',
    metadata: { author_bot: true, channel_name: 'important-spam' },
    created_at: CAPTURED_AT,
    ...overrides,
  };
}

function makeFlow(event = makeEvent()) {
  return {
    flow_id: RETAINED_BOT_EVENT_ALLOWLIST[event.event_id]?.flowId || 'flow-test',
    source: 'discord-bot',
    page_kind: 'bot_event',
    capture_id: `bot-${event.event_id}`,
    source_id: event.message_id,
    province_id: '12eeda5c-be0f-41db-8923-0be2296a8766',
    kingdom_id: '6:8',
    received_at: '2026-10-27T06:12:01.358615Z',
  };
}

function makeSupabase({ event = makeEvent(), flow = makeFlow(event), records = [] } = {}) {
  const tables = {
    spartan_bot_events: [event],
    spartan_data_flow: [flow],
    spartan_intel_records: records,
  };
  return {
    tables,
    from(table) {
      const query = { filters: {}, operation: null, row: null };
      query.select = () => { query.operation = 'select'; return query; };
      query.eq = (key, value) => { query.filters[key] = value; return query; };
      query.limit = () => query;
      query.maybeSingle = async () => {
        const found = (tables[table] || []).find(row =>
          Object.entries(query.filters).every(([key, value]) => row[key] === value)
        );
        return { data: found || null, error: null };
      };
      query.insert = async row => {
        if (table !== 'spartan_intel_records') throw new Error(`Unexpected insert into ${table}`);
        if (tables[table].some(existing => existing.capture_id === row.capture_id)) {
          return { error: { code: '23505', message: 'duplicate capture_id' } };
        }
        tables[table].push(row);
        return { error: null };
      };
      return query;
    },
  };
}

test('allowlist contains exactly the six retained events and excludes queue 11488', () => {
  assert.deepEqual(Object.keys(RETAINED_BOT_EVENT_ALLOWLIST), [
    '0c975d16-094c-4d5b-80b8-498ed6234fb5',
    '1a5e34ca-7248-4bfc-b777-8caf0b93d000',
    '038c6d6d-8bdf-4135-8118-9762c25e0910',
    'b248deca-1a6d-4c72-9cbd-b895a0791842',
    'edf8edf3-7ec5-478a-96ab-87782077c0a1',
    'd5e2d94d-19bd-4b17-9173-036159680afd',
  ]);
  assert.equal(RETAINED_BOT_EVENT_ALLOWLIST['931c2242-3ec9-4e70-8328-6fd4d0fafc96'], undefined);
});

test('allowlisted retained event inserts once, then the second run skips it', async () => {
  const sb = makeSupabase();
  const first = await recoverRetainedBotEvent(sb, AID_EVENT_ID, {
    execute: true,
    projectBotIntel: syncBotIntelRecord,
  });

  assert.equal(first.status, 'inserted');
  assert.equal(first.pageKind, 'aid');
  assert.equal(first.capturedAt, CAPTURED_AT);
  assert.equal(first.sourceVaultId, null);
  assert.equal(sb.tables.spartan_intel_records.length, 1);

  const row = sb.tables.spartan_intel_records[0];
  assert.equal(row.capture_id, AID_CAPTURE_ID);
  assert.equal(row.source_id, AID_SOURCE_ID);
  assert.equal(row.source_vault_id, null);
  assert.equal(row.page_kind, 'aid');
  assert.equal(row.retention_class, 'intel_48h');
  assert.equal(row.expires_at, '2026-10-29T06:12:00.881Z');

  const second = await recoverRetainedBotEvent(sb, AID_EVENT_ID, {
    execute: true,
    projectBotIntel: syncBotIntelRecord,
  });
  assert.equal(second.status, 'skipped');
  assert.equal(second.reason, 'existing_capture_id');
  assert.equal(sb.tables.spartan_intel_records.length, 1);
});

test('non-allowlisted event is rejected before database access', async () => {
  const sb = {
    from() { throw new Error('non-allowlisted event must not query the database'); },
  };
  const result = await recoverRetainedBotEvent(sb, '931c2242-3ec9-4e70-8328-6fd4d0fafc96', {
    execute: true,
    projectBotIntel: syncBotIntelRecord,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'not_allowlisted');
});

test('existing bare capture_id is skipped before insert', async () => {
  const sb = makeSupabase({
    records: [{ id: 1, capture_id: AID_EVENT_ID, source_id: 'different-source' }],
  });
  const result = await recoverRetainedBotEvent(sb, AID_EVENT_ID, {
    execute: true,
    projectBotIntel: syncBotIntelRecord,
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'existing_capture_id');
  assert.equal(sb.tables.spartan_intel_records.length, 1);
});

test('existing Discord source_id is skipped even when capture_id differs', async () => {
  const sb = makeSupabase({
    records: [{ id: 1, capture_id: 'unrelated-capture', source_id: AID_SOURCE_ID }],
  });
  const result = await recoverRetainedBotEvent(sb, AID_EVENT_ID, {
    execute: true,
    projectBotIntel: syncBotIntelRecord,
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'existing_source_id');
  assert.equal(sb.tables.spartan_intel_records.length, 1);
});

test('event must be authored by the verified bot', async () => {
  const event = makeEvent(AID_EVENT_ID, { metadata: { author_bot: false } });
  const sb = makeSupabase({ event, flow: makeFlow(event) });
  const result = await recoverRetainedBotEvent(sb, AID_EVENT_ID, {
    execute: true,
    projectBotIntel: syncBotIntelRecord,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'author_not_bot');
  assert.equal(sb.tables.spartan_intel_records.length, 0);
});

test('dry run reports candidates but never calls the projector', async () => {
  const sb = makeSupabase();
  let called = false;
  const result = await recoverRetainedBotEvent(sb, AID_EVENT_ID, {
    execute: false,
    projectBotIntel: async () => { called = true; },
  });
  assert.equal(result.status, 'would_insert');
  assert.equal(called, false);
  assert.equal(sb.tables.spartan_intel_records.length, 0);
});
