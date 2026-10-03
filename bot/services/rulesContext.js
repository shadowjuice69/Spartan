// Looks up Utopia rules in the Spartan Supabase tables and returns a text block
// the AI can treat as authoritative. Small tables, so they are loaded whole and
// cached, then matched against the question in JS (handles "heretic halfling",
// "dark elf", "war hero", plurals, apostrophes and so on).

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const squash = (s) => norm(s).replace(/\s/g, '');
const stripThe = (s) => norm(s).replace(/^the /, '');

const STOP = new Set(['what', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'should', 'i', 'use', 'in', 'during', 'how', 'why', 'can', 'my', 'with', 'of', 'to', 'for', 'and', 'or', 'on', 'it', 'me', 'about', 'tell', 'give', 'get', 'info', 'rules', 'rule', 'good', 'best', 'work', 'works']);

async function loadAll(sb) {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const [races, pers, game] = await Promise.all([
    sb.from('spartan_race_rules').select('*'),
    sb.from('spartan_personality_rules').select('*'),
    sb.from('spartan_game_rules').select('*'),
  ]);
  for (const r of [races, pers, game]) if (r.error) throw new Error(r.error.message);
  const ages = [...races.data, ...pers.data, ...game.data].map((r) => r.age_number).filter((n) => Number.isFinite(n));
  const age = ages.length ? Math.max(...ages) : null;
  const inAge = (rows) => rows.filter((r) => age == null || r.age_number == null || r.age_number === age);
  cache = { at: Date.now(), data: { age, races: inAge(races.data), pers: inAge(pers.data), game: inAge(game.data) } };
  return cache.data;
}

function mentions(question, name) {
  const q = ' ' + norm(question) + ' ';
  const n = stripThe(name);
  if (q.includes(' ' + n + ' ') || q.includes(' ' + n + 's ')) return true;
  return n.includes(' ') && q.includes(' ' + squash(n) + ' ');
}

function longestOnly(rows, key) {
  const names = rows.map((r) => stripThe(r[key]));
  return rows.filter((r, i) => !names.some((other, j) => j !== i && other.length > names[i].length && other.includes(names[i])));
}

function raceBlock(r) {
  const out = [`RACE: ${r.race}${r.archetype ? ` (${r.archetype})` : ''}`];
  if (r.bonuses) out.push(`  Bonuses: ${r.bonuses}`);
  if (r.penalties) out.push(`  Penalties: ${r.penalties}`);
  if (r.unique_name) out.push(`  Unique: ${r.unique_name}${r.unique_desc ? ' - ' + r.unique_desc : ''}`);
  if (r.war_doctrine) out.push(`  War doctrine (applies only while in war): ${r.war_doctrine}`);
  if (r.units) out.push(`  Units: ${r.units}`);
  if (r.spells) out.push(`  Spells: ${r.spells}`);
  return out.join('\n');
}

function persBlock(p) {
  const out = [`PERSONALITY: ${p.personality}`];
  if (p.bonuses) out.push(`  Bonuses: ${p.bonuses}`);
  if (p.start_bonus) out.push(`  Start bonus: ${p.start_bonus}`);
  if (p.unique_name) out.push(`  Unique: ${p.unique_name}${p.unique_desc ? ' - ' + p.unique_desc : ''}`);
  if (p.spells) out.push(`  Spells: ${p.spells}`);
  return out.join('\n');
}

const valueText = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

async function wikiHits(sb, words) {
  try {
    const terms = words.slice(0, 4).map((w) => w.replace(/[%,()]/g, ''));
    if (!terms.length) return [];
    const filter = terms.flatMap((w) => [`title.ilike.%${w}%`, `content_text.ilike.%${w}%`]).join(',');
    const { data, error } = await sb.from('spartan_wiki').select('title,content_text,age_number').eq('approved', true).or(filter).limit(2);
    return error ? [] : data || [];
  } catch { return []; }
}

async function build(sb, question) {
  const data = await loadAll(sb);
  const races = longestOnly(data.races.filter((r) => mentions(question, r.race)), 'race');
  const pers = longestOnly(data.pers.filter((p) => mentions(question, p.personality)), 'personality');
  const words = norm(question).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

  const game = data.game.filter((g) => {
    const hay = norm(`${g.category} ${g.rule_name} ${g.description || ''}`);
    return words.some((w) => hay.includes(w));
  }).slice(0, 8);

  const wiki = races.length || pers.length ? [] : await wikiHits(sb, words);

  const parts = [];
  if (races.length) parts.push(...races.map(raceBlock));
  if (pers.length) parts.push(...pers.map(persBlock));
  if (races.length && pers.length) parts.push('NOTE: a race and a personality are chosen together, so their bonuses apply at the same time.');
  if (game.length) {
    parts.push('GAME RULES:\n' + game.map((g) => `  - [${g.category}] ${g.rule_name}: ${valueText(g.value)}${g.description ? ' (' + g.description + ')' : ''}`).join('\n'));
  }
  if (wiki.length) parts.push(...wiki.map((w) => `WIKI: ${w.title}\n${String(w.content_text || '').slice(0, 1500)}`));

  return { age: data.age, found: parts.length > 0, text: parts.join('\n\n') };
}

function clearCache() { cache = { at: 0, data: null }; }

module.exports = { build, clearCache };
