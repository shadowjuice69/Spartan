const RETAINED_BOT_EVENT_ALLOWLIST = Object.freeze({
  '0c975d16-094c-4d5b-80b8-498ed6234fb5': { queueId: 11480, flowId: '5bd8321d-a3df-4de7-aa19-ab02a0e471c9', sourceId: '1564522035852349561' },
  '1a5e34ca-7248-4bfc-b777-8caf0b93d000': { queueId: 11483, flowId: 'a5667004-c6a2-45cd-b3a7-75d14819904b', sourceId: '1564522293000929331' },
  '038c6d6d-8bdf-4135-8118-9762c25e0910': { queueId: 11484, flowId: '3dfcc31b-0d8b-449e-b443-b8816b547224', sourceId: '1564522337460682854' },
  'b248deca-1a6d-4c72-9cbd-b895a0791842': { queueId: 11485, flowId: '94b20c96-ca63-488b-bec7-135208a826b2', sourceId: '1564522380750233632' },
  'edf8edf3-7ec5-478a-96ab-87782077c0a1': { queueId: 11487, flowId: '040cc1c5-f51a-4644-94de-5c08795421af', sourceId: '1564522509087539261' },
  'd5e2d94d-19bd-4b17-9173-036159680afd': { queueId: 11490, flowId: '6b7bbf50-6289-4741-92b5-e7c86157cdab', sourceId: '1564560942488879216' },
});

function captureIdForEvent(eventId) {
  return `bot-${eventId}`;
}

async function findExistingIntel(sb, captureId, sourceId) {
  const captureIds = [...new Set([captureId, captureId.replace(/^bot-/, '')])];
  for (const candidate of captureIds) {
    const { data, error } = await sb.from('spartan_intel_records')
      .select('id,capture_id,source_id')
      .eq('capture_id', candidate)
      .maybeSingle();
    if (error) throw new Error(`recovery capture_id pre-check failed: ${error.message}`);
    if (data) return { reason: 'capture_id', row: data };
  }

  if (sourceId) {
    const { data, error } = await sb.from('spartan_intel_records')
      .select('id,capture_id,source_id')
      .eq('source_id', sourceId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`recovery source_id pre-check failed: ${error.message}`);
    if (data) return { reason: 'source_id', row: data };
  }
  return null;
}

async function recoverRetainedBotEvent(sb, eventId, options = {}) {
  const allowlisted = RETAINED_BOT_EVENT_ALLOWLIST[eventId];
  if (!allowlisted) return { eventId, status: 'rejected', reason: 'not_allowlisted' };
  if (!sb) throw new Error('Supabase client is required');

  const { data: event, error: eventError } = await sb.from('spartan_bot_events')
    .select('event_id,direction,event_type,discord_user_id,discord_channel_id,discord_guild_id,message_id,content,metadata,created_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (eventError) throw new Error(`source event lookup failed for ${eventId}: ${eventError.message}`);
  if (!event) return { eventId, status: 'skipped', reason: 'source_missing' };
  if (event.metadata?.author_bot !== true) return { eventId, status: 'rejected', reason: 'author_not_bot' };
  if (!String(event.content || '').trim()) return { eventId, status: 'rejected', reason: 'empty_content' };
  if (event.message_id !== allowlisted.sourceId) return { eventId, status: 'rejected', reason: 'message_id_mismatch' };

  const captureId = captureIdForEvent(eventId);
  const { data: flow, error: flowError } = await sb.from('spartan_data_flow')
    .select('*')
    .eq('flow_id', allowlisted.flowId)
    .eq('capture_id', captureId)
    .eq('source', 'discord-bot')
    .eq('page_kind', 'bot_event')
    .maybeSingle();
  if (flowError) throw new Error(`source flow lookup failed for ${eventId}: ${flowError.message}`);
  if (!flow) return { eventId, status: 'skipped', reason: 'source_flow_missing' };
  if (flow.source_id !== allowlisted.sourceId) {
    return { eventId, status: 'rejected', reason: 'flow_source_id_mismatch' };
  }
  if (flow.flow_id !== allowlisted.flowId || flow.capture_id !== captureId) {
    return { eventId, status: 'rejected', reason: 'capture_id_mismatch' };
  }

  const existing = await findExistingIntel(sb, captureId, allowlisted.sourceId);
  if (existing) {
    return { eventId, captureId, sourceId: allowlisted.sourceId, status: 'skipped', reason: `existing_${existing.reason}` };
  }

  const capturedAt = event.created_at || flow.received_at;
  if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) {
    return { eventId, captureId, status: 'rejected', reason: 'invalid_original_timestamp' };
  }

  const rawPayload = {
    event_id: event.event_id,
    direction: event.direction,
    event_type: event.event_type,
    discord_user_id: event.discord_user_id,
    discord_channel_id: event.discord_channel_id,
    discord_guild_id: event.discord_guild_id,
    message_id: event.message_id,
    metadata: event.metadata || {},
  };
  const capture = {
    id: null,
    capture_id: captureId,
    source: 'discord-bot',
    province_id: flow.province_id || null,
    kingdom_id: flow.kingdom_id || null,
    page_kind: 'bot_event',
    raw_text: event.content,
    raw_payload: rawPayload,
    parsed_payload: {
      data: {
        content: event.content,
        discord: { event_id: event.event_id, message_id: event.message_id },
        metadata: event.metadata || {},
      },
    },
    content_hash: null,
    captured_at: capturedAt,
    user_id: null,
  };

  if (!options.execute) {
    return {
      eventId, captureId, sourceId: allowlisted.sourceId,
      queueId: allowlisted.queueId, status: 'would_insert',
      pageKind: 'pending_classifier', capturedAt, sourceVaultId: null,
    };
  }

  const projectBotIntel = options.projectBotIntel || require('./spartanQueueProcessor').syncBotIntelRecord;
  const result = await projectBotIntel(sb, flow, capture, { data: {} }, { recoveryMode: true });
  if (!result) return { eventId, captureId, status: 'skipped', reason: 'classifier_rejected' };
  if (result.skippedExisting) {
    return { eventId, captureId, sourceId: allowlisted.sourceId, status: 'skipped', reason: 'projector_existing' };
  }
  return {
    eventId, captureId, sourceId: allowlisted.sourceId, queueId: allowlisted.queueId,
    status: 'inserted', pageKind: result.pageKind, capturedAt, sourceVaultId: null,
  };
}

async function recoverAllowlistedBotEvents(sb, options = {}) {
  const results = [];
  for (const eventId of Object.keys(RETAINED_BOT_EVENT_ALLOWLIST)) {
    results.push(await recoverRetainedBotEvent(sb, eventId, options));
  }
  return {
    checked: results.length,
    inserted: results.filter(result => result.status === 'inserted').length,
    wouldInsert: results.filter(result => result.status === 'would_insert').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    rejected: results.filter(result => result.status === 'rejected').length,
    results,
  };
}

module.exports = {
  RETAINED_BOT_EVENT_ALLOWLIST,
  captureIdForEvent,
  findExistingIntel,
  recoverRetainedBotEvent,
  recoverAllowlistedBotEvents,
};
