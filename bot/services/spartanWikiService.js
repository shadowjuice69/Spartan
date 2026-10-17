const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabaseService = require('./supabase');
const logger = require('./logger');
const { applyAgeToWiki } = require('./wikiAgeGenerator');

const WIKI_PATH = path.resolve(__dirname, '../../utopia-wiki.html');
const DOCUMENT_KEY = 'utopia-reference';

function detectAgeNumber(html) {
  const matches = [
    html.match(/Age\s+(\d+)\s+Changes/i),
    html.match(/Current Age[^\d]{0,80}(\d+)/i),
    html.match(/Age[_\s-]?(\d+)/i)
  ];
  for (const match of matches) {
    const age = Number(match?.[1]);
    if (Number.isInteger(age) && age > 0) return age;
  }
  return null;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function syncWikiFile() {
  const supabase = supabaseService.getClient();
  if (!supabase) return { ok: false, error: 'supabase_unavailable' };
  if (!fs.existsSync(WIKI_PATH)) return { ok: false, error: 'wiki_file_missing' };

  const contentHtml = fs.readFileSync(WIKI_PATH, 'utf8').replace(/\u0000/g, '');
  const ageNumber = detectAgeNumber(contentHtml);
  if (!ageNumber) return { ok: false, error: 'wiki_age_not_detected' };

  const contentText = htmlToText(contentHtml);
  const contentSha256 = crypto.createHash('sha256').update(contentHtml).digest('hex');

  const { data, error } = await supabase.from('spartan_wiki').upsert({
    document_key: DOCUMENT_KEY,
    age_number: ageNumber,
    title: 'Utopia Reference — World of Legends',
    content_html: contentHtml,
    content_text: contentText,
    source: 'github',
    source_path: 'utopia-wiki.html',
    content_sha256: contentSha256,
    approved: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'document_key,age_number' }).select('id,age_number,content_sha256,updated_at').single();

  if (error) throw error;
  logger.info(`[WIKI SYNC] Age ${ageNumber} stored in spartan_wiki sha=${contentSha256.slice(0, 12)}...`);
  return { ok: true, ...data };
}

async function syncWikiHtml(updateText, source = 'age_update') {
  const supabase = supabaseService.getClient();
  if (!supabase) return { ok: false, error: 'supabase_unavailable' };

  const contentHtml = String(updateText || '');
  if (!/<html[\s>]/i.test(contentHtml) || !/<body[\s>]/i.test(contentHtml)) {
    return { ok: false, error: 'not_full_wiki_html' };
  }

  const ageNumber = detectAgeNumber(contentHtml);
  if (!ageNumber) return { ok: false, error: 'wiki_age_not_detected' };

  const contentText = htmlToText(contentHtml);
  const contentSha256 = crypto.createHash('sha256').update(contentHtml).digest('hex');

  const { data, error } = await supabase.from('spartan_wiki').upsert({
    document_key: DOCUMENT_KEY,
    age_number: ageNumber,
    title: 'Utopia Reference — World of Legends',
    content_html: contentHtml,
    content_text: contentText,
    source,
    source_path: source === 'github' ? 'utopia-wiki.html' : 'age update upload',
    content_sha256: contentSha256,
    approved: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'document_key,age_number' }).select('id,age_number,content_sha256,updated_at').single();

  if (error) throw error;
  logger.info(`[WIKI SYNC] Age ${ageNumber} stored from ${source} sha=${contentSha256.slice(0, 12)}...`);
  return { ok: true, ...data };
}


async function updateWikiForAge(ageNumber) {
  const supabase = supabaseService.getClient();
  if (!supabase) return { ok: false, error: 'supabase_unavailable' };
  const age = Number(ageNumber);
  if (!Number.isInteger(age) || age <= 0) return { ok: false, error: 'invalid_age_number' };

  const { data: previous, error: previousError } = await supabase
    .from('spartan_wiki').select('age_number,content_html')
    .eq('document_key', DOCUMENT_KEY).eq('approved', true)
    .lt('age_number', age).order('age_number', { ascending: false })
    .limit(1).maybeSingle();
  if (previousError) throw previousError;
  if (!previous?.content_html) return { ok: false, error: 'no_previous_wiki' };

  const [raceResult, personalityResult, gameResult] = await Promise.all([
    supabase.from('spartan_race_rules').select('*').eq('age_number', age),
    supabase.from('spartan_personality_rules').select('*').eq('age_number', age),
    supabase.from('spartan_game_rules').select('*').eq('age_number', age)
  ]);
  for (const result of [raceResult, personalityResult, gameResult]) {
    if (result.error) throw result.error;
  }
  const ageRows = {
    races: raceResult.data || [],
    personalities: personalityResult.data || [],
    game: gameResult.data || []
  };
  if (!ageRows.races.length || !ageRows.personalities.length || !ageRows.game.length) {
    return { ok: false, error: 'age_rules_incomplete' };
  }

  const contentHtml = applyAgeToWiki(previous.content_html, age, ageRows);
  const contentText = htmlToText(contentHtml);
  const contentSha256 = crypto.createHash('sha256').update(contentHtml).digest('hex');
  const { data, error } = await supabase.from('spartan_wiki').upsert({
    document_key: DOCUMENT_KEY,
    age_number: age,
    title: 'Utopia Reference — World of Legends',
    content_html: contentHtml,
    content_text: contentText,
    source: 'age_update',
    source_path: 'generated from approved age rules',
    content_sha256: contentSha256,
    approved: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'document_key,age_number' })
    .select('id,age_number,content_sha256,updated_at').single();
  if (error) throw error;
  logger.info(`[WIKI AGE GENERATOR] Age ${age} stored sha=${contentSha256.slice(0, 12)}...`);
  return { ok: true, ...data };
}

module.exports = { syncWikiFile, syncWikiHtml, detectAgeNumber, updateWikiForAge };
