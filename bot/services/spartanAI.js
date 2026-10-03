const supabaseService = require('./supabase');
const logger = require('./logger');
const crypto = require('crypto');
const wikiService = require('./wikiService');

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
  // Reference the knowledge already stored in Spartan before asking the model
  // to answer. Rules/Wiki data is authoritative reference material; captured
  // province/event state is observed game state. The AI must not tell users to
  // manually browse the game/wiki and re-capture information that Spartan
  // already has.
  // Use the structured rules already stored in Supabase first. The local Wiki
  // is only a fallback when the structured rules do not contain an answer.
  // This keeps normal AI questions fast and avoids scanning the full Wiki on
  // every request.
  const rulesReference = await wikiService.searchRules(question).catch(() => null);
  let wikiReference = '';
  if (!rulesReference) {
    const wikiResults = await wikiService.searchWiki(question).catch(() => []);
    wikiReference = (wikiResults || [])
      .slice(0, 3)
      .map(entry => `${entry.title || 'Wiki entry'}:\n${String(entry.content || '').slice(0, 1800)}`)
      .join('\n\n');
  }
  const reference = [
    rulesReference ? `STRUCTURED SPARTAN RULES:\n${rulesReference}` : '',
    wikiReference ? `SPARTAN WIKI FALLBACK:\n${wikiReference}` : '',
  ].filter(Boolean).join('\n\n');
  const system = `You are Spartan AI inside Spartan. Treat Spartan's stored rules, Wiki reference, and captured structured data as your authoritative operating context.\n\nReference priority:\n1. Structured Spartan rules for exact mechanics and current ruleset values.\n2. Spartan Wiki reference for additional definitions/explanations.\n3. Captured province/kingdom/event data for observed current state.\n\nIf the requested information exists in these references, answer from them directly. Do NOT tell the user to open the Utopia client, visit an external wiki, manually capture JSON, or add a new state record merely to obtain information Spartan already stores. Only report information as unavailable when the supplied Spartan references genuinely do not contain it. Never invent missing values. Clearly distinguish reference facts, observed state, and recommendations.`;
  const user = `QUESTION:\n${String(question).slice(0, 6000)}\n\nSPARTAN REFERENCE DATA:\n${reference.slice(0, 16000) || 'No matching stored reference found.'}\n\nCURRENT SPARTAN OBSERVED STATE:\n${JSON.stringify(context).slice(0, 18000)}`;
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
