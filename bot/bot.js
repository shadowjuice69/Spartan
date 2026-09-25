require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const discordJsVersion = require('discord.js').version || 'unknown';
const logger = require('./services/logger');
const directMusicAdapter = require('./services/directMusicAdapter');
const musicPlayer = require('./services/musicPlayerService');
const interactions = require('./core/interactions');
const commands = require('./core/commands');
const spartanQueueProcessor = require('./services/spartanQueueProcessor');
const spartanBotBridge = require('./services/spartanBotBridge');
const spartanAI = require('./services/spartanAI');

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required');
const CLEANUP_CHANNEL_ID = '1546379989484830730';
const CLEANUP_AUTHOR_ID = '1518122625354956820';
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent],
  ws: {
    handshakeTimeout: 60000,
    helloTimeout: 90000,
    readyTimeout: 30000,
  },
});
global.__NEXUS_DISCORD_CLIENT = client;

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
    logger.info(`[CLEARBOT] deleted=${deleted} scanned=${scanned} channel=${channelId} author=${authorId} requestedBy=${message.author.id}`);
  } catch (error) {
    logger.error(`[CLEARBOT ERROR] ${error.stack || error.message}`);
    if (!message.replied) message.reply(`❌ Cleanup failed: ${error.message}`).catch(() => {});
  }
});

client.on('debug', message => {
  // Never log the bot token. discord.js may include it in debug output.
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
  spartanAI.start();
  spartanQueueProcessor.start();
  try { directMusicAdapter.initialize(client); musicPlayer.setAdapter(directMusicAdapter); logger.info('🎵 Music backend ready: Direct Discord Voice / yt-dlp / FFmpeg'); }
  catch (error) { musicPlayer.clearAdapter(); logger.error(`[MUSIC INIT ERROR] ${error.stack || error.message}`); }
  try { await commands.register(client); } catch (error) { logger.error(`[COMMAND REGISTRATION ERROR] ${error.stack || error.message}`); }
});

const port = Number(process.env.PORT || 10000);
const universalReceiver = require('./services/universalReceiver');
if (process.env.EMBEDDED_SPARTAN !== 'true') universalReceiver.start();
logger.info(`🚀 Nexus clean core starting | Node ${process.version} | discord.js ${discordJsVersion}`);

// Let discord.js own the Gateway reconnect lifecycle.\n// The old Promise.race() timeout could abandon a live login attempt and start\n// another client.login() while the first WebSocket was still opening. That can\n// create overlapping Gateway sessions and turn a transient network stall into\n// a persistent reconnect loop. discord.js already has Gateway handshake/hello/\n// ready timeouts and reconnect handling, so only retry a login after login()\n// itself actually rejects.\nconst MAX_BACKOFF_MS = 5 * 60 * 1000;\nlet backoffMs = 15 * 1000;\nlet loggedIn = false;\nlet loginInProgress = false;\nlet retryTimer = null;\n\nasync function attemptLogin() {\n  if (loggedIn || loginInProgress) return;\n  loginInProgress = true;\n  logger.info('[DISCORD] Starting gateway login...');\n  try {\n    await client.login(process.env.DISCORD_TOKEN);\n    loggedIn = true;\n    backoffMs = 15 * 1000;\n    logger.info('[DISCORD] Login promise resolved');\n  } catch (error) {\n    logger.error(`[DISCORD LOGIN FAILED] ${error.stack || error.message}`);\n    try { client.destroy(); } catch {}\n    const delay = backoffMs;\n    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);\n    logger.warn(`[DISCORD] Login failed; retrying in ${Math.round(delay / 1000)}s`);\n    retryTimer = setTimeout(() => {\n      retryTimer = null;\n      attemptLogin().catch(() => {});\n    }, delay);\n  } finally {\n    loginInProgress = false;\n  }\n}\n\nattemptLogin().catch(() => {});\n\nclient.on('shardDisconnect', () => {\n  loggedIn = false;\n  // Do not call client.login() here. discord.js automatically reconnects\n  // recoverable shard disconnects and emits shardReconnecting/shardReady.\n}
