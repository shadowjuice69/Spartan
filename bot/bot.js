require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, PermissionFlagsBits, Options } = require('discord.js');
const discordJsVersion = require('discord.js').version || 'unknown';
const logger = require('./services/logger');
const directMusicAdapter = require('./services/directMusicAdapter');
const musicPlayer = require('./services/musicPlayerService');
const interactions = require('./core/interactions');
const commands = require('./core/commands');
const spartanQueueProcessor = require('./services/spartanQueueProcessor');
const spartanBotBridge = require('./services/spartanBotBridge');
const spartanAI = require('./services/spartanAI');
const { syncWikiFile } = require('./services/spartanWikiService');

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required');
const CLEANUP_CHANNEL_ID = '1546379989484830730';
const CLEANUP_AUTHOR_ID = '1518122625354956820';
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent],
  // Bound retained message history; live message events still process normally.
  makeCache: Options.cacheWithLimits({ MessageManager: 50 }),
  sweepers: { messages: { interval: 300, lifetime: 900 } },
  ws: {
    handshakeTimeout: 60000,
    helloTimeout: 90000,
    readyTimeout: 30000,
  },
});
global.__SPARTAN_DISCORD_CLIENT = client;

client.on('raw', packet => { if (packet?.t === 'MESSAGE_CREATE') logger.info(`[DISCORD RAW MESSAGE_CREATE] channel=${packet.d?.channel_id || 'unknown'} guild=${packet.d?.guild_id || 'DM'} author=${packet.d?.author?.username || 'unknown'} id=${packet.d?.id || 'unknown'}`); });

client.on('interactionCreate', interaction => {
  spartanBotBridge.inboundInteraction(interaction).catch(() => {});
  interactions.handle(interaction).catch(error => {
    logger.error(`[INTERACTION ERROR] ${error.stack || error.message}`);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) interaction.reply({ content: `❌ ${error.message}`, ephemeral: true }).catch(() => {});
  });
});

client.on('messageCreate', async message => {
  spartanBotBridge.inboundMessage(message).catch(() => {});
  try {
    if (message.author?.bot && message.author.id === CLEANUP_AUTHOR_ID) return;
    if (!message.content?.trim().toLowerCase().startsWith('!clearbot')) return;
    if (!message.guild) return;
    if (!message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return;
    const parts = message.content.trim().split(/\s+/);
    const channelId = parts[1] || CLEANUP_CHANNEL_ID;
    const authorId = parts[2] || CLEANUP_AUTHOR_ID;
    if (!/^\d{17,20}$/.test(channelId) || !/^\d{17,20}$/.test(authorId)) return message.reply('❌ Usage: `!clearbot [channel_id] [user_id]`');
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.messages) return message.reply('❌ That channel is not a text channel I can read.');
    let before; let deleted = 0; let scanned = 0;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      scanned += batch.size;
      const targets = batch.filter(m => m.author?.id === authorId);
      if (targets.size) {
        const removable = targets.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const old = targets.filter(m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
        if (removable.size) deleted += (await channel.bulkDelete(removable, true)).size;
        for (const msg of old.values()) { try { await msg.delete(); deleted++; } catch (error) { logger.warn(`[CLEARBOT] Could not delete old message ${msg.id}: ${error.message}`); } }
      }
      before = batch.last().id;
      if (batch.size < 100) break;
    }
    await message.reply(`✅ Cleared ${deleted} message(s) from <#${channelId}> posted by <@${authorId}>. Scanned ${scanned} message(s).`);
    logger.info(`[CLEARBOT] deleted=${deleted} scanned=${scanned} channel=${channelId} author=${message.author.id}`);
  } catch (error) {
    logger.error(`[CLEARBOT ERROR] ${error.stack || error.message}`);
    if (!message.replied) message.reply(`❌ Cleanup failed: ${error.message}`).catch(() => {});
  }
});

client.on('debug', message => {
  if (/provided token/i.test(message)) return;
  if (!/heartbeat acknowledged|sending heartbeat/i.test(message)) logger.info(`[DISCORD DEBUG] ${message}`);
});
client.on('warn', message => logger.warn(`[DISCORD WARN] ${message}`));
client.on('error', error => logger.error(`[DISCORD CLIENT ERROR] ${error.stack || error.message}`));
client.on('shardError', (error, shardId) => logger.error(`[DISCORD SHARD ${shardId} ERROR] ${error.stack || error.message}`));
client.on('shardDisconnect', (event, shardId) => logger.warn(`[DISCORD SHARD ${shardId} DISCONNECT] code=${event?.code || 'unknown'} reason=${event?.reason || 'none'}`));
client.on('shardReconnecting', shardId => logger.warn(`[DISCORD SHARD ${shardId} RECONNECTING]`));
client.on('shardReady', shardId => logger.info(`[DISCORD SHARD ${shardId} READY]`));

client.once('clientReady', async () => {
  logger.info(`[DISCORD READY] Bot online as ${client.user.tag}`);
  logger.info('[SPARTAN] Bot is an ecosystem node: Discord <-> Spartan capture/queue/stewards/projection');
  try {
    const wikiSync = await syncWikiFile();
    if (!wikiSync.ok) logger.warn(`[WIKI SYNC] skipped: ${wikiSync.error}`);
  } catch (error) {
    logger.error(`[WIKI SYNC ERROR] ${error.stack || error.message}`);
  }
  // Retired guild exits configured through Render; active Spartan guilds are unaffected.
  const leaveGuildIds = (process.env.DISCORD_LEAVE_GUILD_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  for (const guildId of leaveGuildIds) {
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me/guilds/' + guildId, {
        method: 'DELETE',
        headers: { Authorization: 'Bot ' + process.env.DISCORD_TOKEN },
      });
      if (response.ok || response.status === 404) {
        logger.info('[DISCORD] Left/confirmed absent from retired guild ' + guildId + ' (HTTP ' + response.status + ')');
      } else {
        const body = await response.text().catch(() => '');
        logger.error('[DISCORD] Failed to leave retired guild ' + guildId + ' (HTTP ' + response.status + '): ' + body);
      }
    } catch (error) {
      logger.error('[DISCORD] Failed to leave retired guild ' + guildId + ': ' + (error.stack || error.message));
    }
  }

  spartanAI.start();
  spartanQueueProcessor.start();
  try { directMusicAdapter.initialize(client); musicPlayer.setAdapter(directMusicAdapter); logger.info('🎵 Music backend ready: Direct Discord Voice / yt-dlp / FFmpeg'); }
  catch (error) { musicPlayer.clearAdapter(); logger.error(`[MUSIC INIT ERROR] ${error.stack || error.message}`); }
  try { await commands.register(client); } catch (error) { logger.error(`[COMMAND REGISTRATION ERROR] ${error.stack || error.message}`); }
});

const port = Number(process.env.PORT || 10000);
const universalReceiver = require('./services/universalReceiver');
if (process.env.EMBEDDED_SPARTAN !== 'true') universalReceiver.start();
logger.info(`🚀 Spartan core starting | Node ${process.version} | discord.js ${discordJsVersion}`);

const MAX_BACKOFF_MS = 5 * 60 * 1000;
let backoffMs = 15 * 1000;
let loggedIn = false;
let loginInProgress = false;
let retryTimer = null;

async function attemptLogin() {
  if (loggedIn || loginInProgress) return;
  loginInProgress = true;
  logger.info('[DISCORD] Starting gateway login...');
  try {
    await client.login(process.env.DISCORD_TOKEN);
    loggedIn = true;
    backoffMs = 15 * 1000;
    logger.info('[DISCORD] Login promise resolved');
  } catch (error) {
    logger.error(`[DISCORD LOGIN FAILED] ${error.stack || error.message}`);
    try { client.destroy(); } catch {}
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    logger.warn(`[DISCORD] Login failed; retrying in ${Math.round(delay / 1000)}s`);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      attemptLogin().catch(() => {});
    }, delay);
  } finally {
    loginInProgress = false;
  }
}

attemptLogin().catch(() => {});

client.on('shardDisconnect', () => {
  loggedIn = false;
});
