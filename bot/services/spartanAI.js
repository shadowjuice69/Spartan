const supabaseService = require('./supabase');
const logger = require('./logger');
const crypto = require('crypto');
const rulesContext = require('./rulesContext');

const MODEL = process.env.SPARTAN_AI_MODEL || 'openai/gpt-oss-20b';
const API_URL = process.env.SPARTAN_AI_URL || 'https://openrouter.ai/api/v1/chat/completions';

async function contextFor(sb) {
  const { data } = await sb.from('spartan_state_projection').select('province_id,kingdom_id,state,version,updated_at').order('updated_at', { ascending: false }).limit(20);
  return (data || []).map(row => ({ province_id: row.province_id, kingdom_id: row.kingdom_id, version: row.version, state: row.state, updated_at: row.updated_at }));
}

async function ask({ question, userId, channelId, guildId }) {
  const key = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No Spartan AI provider key is configured.');
  const sb = supabaseService.getClient();
  if (!sb) throw new Error('Supabase unavailable.');
  const sessionId = crypto.randomUUID();
  const context = await contextFor(sb);
  let rules = { found: false, text: '', age: null };
  try { rules = await rulesContext.build(sb, question); } catch (error) { logger.warn(`[SPARTAN AI] rules lookup failed: ${error.message}`); }
  const system = 'You are Spartan AI inside Spartan. Treat the Spartan ecosystem as your authoritative operating context. Preserve uncertainty, never invent game state, and use captured structured data when available. Give concise, actionable Utopia strategy and clearly distinguish observed data from recommendations. When a GAME RULES section is provided, it comes from the Spartan rules database and is authoritative: answer from it and quote its numbers exactly. If a rule is not in that section, say it is not in the Spartan rules database instead of guessing. Never add percentages from different sources together unless the rules state how they stack; list each source separately. War doctrine effects apply only while in war.';
  const rulesBlock = rules.found ? `GAME RULES (Age ${rules.age ?? '?'}, from the Spartan rules database):\n${rules.text.slice(0, 7000)}\n\n` : '';
  const user = `QUESTION:\n${String(question).slice(0, 6000)}\n\n${rulesBlock}CURRENT SPARTAN STATE:\n${JSON.stringify(context).slice(0, 18000)}`;
  await sb.from('spartan_ai_messages').insert({ session_id: sessionId, direction: 'user', content: question, model: MODEL, metadata: { discord_user_id: userId, discord_channel_id: channelId, discord_guild_id: guildId } });
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': process.env.RENDER_EXTERNAL_URL || 'https://sparta-west.onrender.com', 'X-Title': 'Spartan AI' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 900 }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Spartan AI HTTP ${response.status}`);
  const answer = payload?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('Spartan AI returned no answer.');
  await sb.from('spartan_ai_messages').insert({ session_id: sessionId, direction: 'assistant', content: answer, model: MODEL, metadata: { provider: 'openrouter' } });
  await sb.from('spartan_ai_sessions').upsert({ session_id: sessionId, discord_user_id: userId || null, discord_channel_id: channelId || null, discord_guild_id: guildId || null, last_message_at: new Date().toISOString() }, { onConflict: 'session_id' });
  return { answer, sessionId, model: MODEL };
}

function start() { logger.info(`[SPARTAN AI] embedded bot intelligence ready model=${MODEL}`); }
module.exports = { start, ask };
