const supabaseService = require('./supabase');
const logger = require('./logger');
const crypto = require('crypto');

function clean(value, max = 12000) { return String(value || '').slice(0, max); }

const generalChannelAllowlist = (process.env.DISCORD_CHANNEL_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => /^\\d{17,20}$/.test(id));
const intelChannelId = String(process.env.INTEL_CHANNEL_ID || '').trim();
const configuredChannelIds = new Set([
  ...generalChannelAllowlist,
  ...( /^\\d{17,20}$/.test(intelChannelId) ? [intelChannelId] : [] ),
]);

function channelIsConfigured(channelId) {
  // Preserve the existing behavior: an empty DISCORD_CHANNEL_IDS means all channels
  // are accepted. When an allowlist is configured, INTEL_CHANNEL_ID is an extra
  // allowed channel rather than replacing any existing channel IDs.
  if (!generalChannelAllowlist.length) return true;
  return configuredChannelIds.has(String(channelId || '').trim());
}

async function resolveCaptureOwner(sb, event) {
  const select = 'id,account_status,province_name,province_location';
  const discordUserId = String(event.userId || '').trim();
  if (discordUserId) {
    const { data: account, error } = await sb
      .from('spartan_accounts')
      .select(select)
      .eq('discord_user_id', discordUserId)
      .limit(1)
      .maybeSingle();
    if (!error && account?.id && account.account_status === 'active') return account;
  }

  const configuredOwner = String(process.env.SPARTAN_CAPTURE_OWNER_ID || '').trim();
  if (!configuredOwner) throw new Error('Spartan capture owner is not configured for this bot event');

  const { data: owner, error } = await sb
    .from('spartan_accounts')
    .select(select)
    .eq('id', configuredOwner)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`capture owner lookup: ${error.message}`);
  if (!owner?.id) throw new Error('Configured Spartan capture owner does not exist');
  if (owner.account_status !== 'active') throw new Error(`Configured Spartan capture owner is not active (status: ${owner.account_status || 'missing'})`);
  return owner;
}

async function routeIntoSpartan(sb, event) {
  const captureId = `bot-${event.eventId}`;
  const owner = await resolveCaptureOwner(sb, event);
  const ownerId = owner.id;
  const ownerProvinceId = owner.id;
  const ownerKingdomId = owner.province_location || null;
  const payload = { source: 'discord-bot', event_type: event.eventType, direction: event.direction, content: event.content, metadata: event.metadata, discord: { user_id: event.userId, channel_id: event.channelId, guild_id: event.guildId, message_id: event.messageId, command: event.commandName }, owner: { province_id: ownerProvinceId, province_name: owner.province_name, kingdom_id: ownerKingdomId } };
  const { error: captureError } = await sb.from('spartan_capture_vault').insert({ capture_id: captureId, user_id: ownerId, source: 'discord-bot', source_id: event.messageId || event.eventId, page_kind: 'bot_event', province_id: ownerProvinceId, kingdom_id: ownerKingdomId, raw_text: event.content, raw_payload: payload, parsed_payload: { type: 'bot_event', kind: 'bot_event', data: payload }, content_hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'), captured_at: new Date().toISOString() });
  if (captureError) throw new Error(`capture: ${captureError.message}`);
  const { data: flow, error: flowError } = await sb.from('spartan_data_flow').insert({ source: 'discord-bot', source_id: event.messageId || event.eventId, capture_id: captureId, province_id: ownerProvinceId, kingdom_id: ownerKingdomId, page_kind: 'bot_event', status: 'received', stage: 'ingest', current_stage: 'ingest', payload: { capture_id: captureId, event_type: event.eventType, direction: event.direction, owner_province_id: ownerProvinceId, owner_kingdom_id: ownerKingdomId } }).select('flow_id').maybeSingle();
  if (flowError) throw new Error(`flow: ${flowError.message}`);
  const { error: edgeError } = await sb.from('spartan_data_edges').insert({ flow_id: flow.flow_id, from_system: 'discord_bot', to_system: 'spartan_processing_queue', event_type: 'ingest', payload: { capture_id: captureId }, from_node: 'discord_bot', to_node: 'spartan_processing_queue', edge_type: 'ingest', status: 'completed', metadata: { event_type: event.eventType, direction: event.direction } });
  if (edgeError) throw new Error(`edge: ${edgeError.message}`);
  const { error: queueError } = await sb.from('spartan_processing_queue').insert({ flow_id: flow.flow_id, stage: 'bot_event', priority: 90, status: 'pending', payload: { capture_id: captureId } });
  if (queueError) throw new Error(`queue: ${queueError.message}`);
  return flow.flow_id;
}

async function recordEvent({ direction, eventType, userId, channelId, guildId, messageId, commandName, content, metadata = {} }) {
  const sb = supabaseService.getClient();
  if (!sb) return null;
  const eventId = crypto.randomUUID();
  const event = { eventId, direction, eventType, userId, channelId, guildId, messageId, commandName, content: clean(content), metadata };
  const { data, error } = await sb.from('spartan_bot_events').insert({ event_id: eventId, direction, event_type: eventType, discord_user_id: userId || null, discord_channel_id: channelId || null, discord_guild_id: guildId || null, message_id: messageId || null, command_name: commandName || null, content: event.content, metadata }).select('id,event_id').maybeSingle();
  if (error) logger.warn(`[SPARTAN BOT BRIDGE] event write failed: ${error.message}`);
  try { await routeIntoSpartan(sb, event); logger.info(`[SPARTAN BOT BRIDGE] routed ${direction} ${eventType} into Spartan event=${eventId}`); }
  catch (routeError) { logger.warn(`[SPARTAN BOT BRIDGE] Spartan route failed event=${eventId}: ${routeError.message}`); }
  return data || null;
}

async function inboundMessage(message) {
  if (!message || !channelIsConfigured(message.channelId)) return null;
  return recordEvent({ direction: message.author?.bot ? 'outbound' : 'inbound', eventType: 'discord_message', userId: message.author?.id, channelId: message.channelId, guildId: message.guildId, messageId: message.id, content: message.content, metadata: { author_bot: Boolean(message.author?.bot), channel_name: message.channel?.name || null } });
}

async function inboundInteraction(interaction) {
  if (!interaction || !channelIsConfigured(interaction.channelId)) return null;
  const command = interaction?.commandName || null; let subcommand = null;
  try { subcommand = interaction.options?.getSubcommand(false) || null; } catch (_) {}
  return recordEvent({ direction: 'inbound', eventType: 'discord_interaction', userId: interaction?.user?.id, channelId: interaction?.channelId, guildId: interaction?.guildId, messageId: interaction?.id, commandName: command, content: command ? `/${command}` : 'interaction', metadata: { subcommand } });
}

async function outboundMessage({ userId, channelId, guildId, messageId, content, metadata = {} }) { return recordEvent({ direction: 'outbound', eventType: 'discord_message', userId, channelId, guildId, messageId, content, metadata }); }
module.exports = { recordEvent, inboundMessage, inboundInteraction, outboundMessage };
