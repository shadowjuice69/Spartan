const supabaseService = require("./supabase");
const fs = require("fs");
const path = require("path");

let localWikiCache = null;

function loadLocalWiki() {
  if (localWikiCache !== null) return localWikiCache;
  const candidates = [
    path.join(process.cwd(), "utopia-wiki.html"),
    path.join(__dirname, "../../utopia-wiki.html"),
  ];
  for (const file of candidates) {
    try {
      localWikiCache = fs.readFileSync(file, "utf8");
      console.log("[WIKI] Loaded authoritative local utopia-wiki.html:", file);
      return localWikiCache;
    } catch (_) {}
  }
  localWikiCache = "";
  console.warn("[WIKI] Authoritative utopia-wiki.html was not found locally");
  return localWikiCache;
}

function stripWikiHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function searchLocalWiki(question, limit = 5) {
  const html = loadLocalWiki();
  if (!html) return [];
  const plain = stripWikiHtml(html);
  const stopWords = new Set([
    "what","does","do","is","are","the","a","an","should","i","use","in",
    "during","war","age","how","why","can","my","with","wiki","data",
    "about","for","of","on","to","and","or","me","tell","give"
  ]);
  const terms = String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (!terms.length) return [];

  const lower = plain.toLowerCase();
  const scored = [];
  for (const term of terms) {
    let from = 0;
    let hits = 0;
    while (hits < 8) {
      const idx = lower.indexOf(term, from);
      if (idx < 0) break;
      const start = Math.max(0, idx - 650);
      const end = Math.min(plain.length, idx + term.length + 900);
      const snippet = plain.slice(start, end).replace(/\s+/g, " ").trim();
      const score = terms.reduce((n, t) => n + (snippet.toLowerCase().includes(t) ? 1 : 0), 0);
      scored.push({ title: `Utopia Wiki — ${term}`, content: snippet, score });
      from = idx + term.length;
      hits++;
    }
  }

  const seen = new Set();
  return scored
    .sort((a,b) => b.score - a.score)
    .filter(row => {
      const key = row.content.slice(0, 220);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({title, content}) => ({title, content}));
}

async function searchWiki(question) {
  // Search Spartan's authoritative local Wiki snapshot first. This is the
  // same utopia-wiki.html shipped with the repo, so AI answers do not depend
  // on a stale external page or a manually copied rule list.
  const localResults = searchLocalWiki(question, 5);

  const supabase = supabaseService.getClient();
  if (!supabase) return localResults;

  let searchTerm = question.toLowerCase().trim();

  const stopWords = [
    "what","does","do","is","are","the","a","an",
    "should","i","use","in","during","war","age",
    "how","why","can","my","with"
  ];

  const words = searchTerm
    .replace(/[^\w\s']/g, "")
    .split(/\s+/)
    .filter(w => !stopWords.includes(w));

  searchTerm = words.join(" ");
  const { data: exactMatch } = await supabase
    .from("wiki_entries").select("*").ilike("title", searchTerm).limit(1);
  const dbResults = exactMatch && exactMatch.length > 0 ? exactMatch : (await supabase
    .from("wiki_entries").select("*")
    .textSearch("search_vector", searchTerm, { type: "websearch", config: "english" }).limit(2)).data;

  const combined = [...(localResults || []), ...(dbResults || [])];
  const seen = new Set();
  return combined.filter(row => {
    const key = `${row.title || ""}|${String(row.content || "").slice(0, 300)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

async function searchRules(question) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;
  let q = question.toLowerCase().trim();

  const stopWords = [
    "what","does","do","is","are","the","a","an",
    "should","i","use","in","during","war","age",
    "how","why","can","my","with","wiki","data"
  ];

  const words = q
    .replace(/[^\w\s']/g, "")
    .split(/\s+/)
    .filter(w => !stopWords.includes(w));


  q = words.join(" ");

  const lines = [];

  // Search each word individually to handle apostrophes and partial matches
  const searchWords = words.filter(w => w.length > 2);
  let exactSpells = [];
  for (const word of searchWords) {
    const { data: wordResults } = await supabase
      .from("spell_rules")
      .select("spell_name, rule_name, value, description")
      .ilike("spell_name", `%${word}%`)
      .eq("active", true);
    if (wordResults && wordResults.length > 0) {
      exactSpells = [...exactSpells, ...wordResults];
    }
  }
  // Deduplicate
  exactSpells = exactSpells.filter((v, i, a) => a.findIndex(t => t.spell_name === v.spell_name && t.rule_name === v.rule_name) === i);

  console.log("[SPELL SEARCH]", q, exactSpells);

  if (exactSpells && exactSpells.length > 0) {
    lines.push(`🔮 **Spell Rules (Age 116)**`);
    for (const row of exactSpells) {
      lines.push(`• **${row.spell_name}** — ${row.rule_name}: ${row.value}`);
      if (row.description) lines.push(`  ${row.description}`);
    }
    lines.push('');
  }

  const RACES = ["avian","dark elf","darkelf","dryad","dwarf","elf","faery","halfling","human","orc","undead"];
  const raceName = RACES.find(name => q.includes(name)) || null;
  const { data: raceData } = raceName ? await supabase
    .from("race_rules").select("race_name, rule_name, value, age_number")
    .ilike("race_name", raceName).limit(50) : { data: [] };
  if (raceData && raceData.length > 0) {
    lines.push(`⚔️ **${raceData[0].race_name} (Age ${raceData[0].age_number} Rules)**`);
    for (const row of raceData) lines.push(`• ${row.rule_name}: ${row.value}`);
    lines.push('');
  }

  const { data: persData } = await supabase
    .from("personality_rules").select("personality_name, rule_name, value, age_number")
    .ilike("personality_name", `%${q}%`).limit(10);
  if (persData && persData.length > 0) {
    lines.push(`🎭 **${persData[0].personality_name} Rules**`);
    for (const row of persData) lines.push(`• ${row.rule_name}: ${row.value}`);
    lines.push('');
  }

  const { data: gameData } = await supabase
    .from("game_rules").select("category, rule_name, value")
    .ilike("value", `%${q}%`).limit(3);
  if (gameData && gameData.length > 0) {
    lines.push(`📋 **Related Game Rules**`);
    for (const row of gameData) lines.push(`• [${row.category}] ${row.value}`);
    lines.push('');
  }

  const { data: scienceData } = await supabase
    .from("science_rules")
    .select("science_name, category, effect, multiplier, race_modifier, personality_modifier, notes")
    .or(`science_name.ilike.%${q}%,effect.ilike.%${q}%,category.ilike.%${q}%`)
    .eq("active", true).limit(5);
  if (scienceData && scienceData.length > 0) {
    lines.push(`🔬 **Science (Age 116)**`);
    for (const row of scienceData) {
      let line = `• **${row.science_name}** [${row.category}] — ${row.effect} (×${row.multiplier})`;
      if (row.race_modifier)        line += ` | Race: ${row.race_modifier}`;
      if (row.personality_modifier) line += ` | Pers: ${row.personality_modifier}`;
      if (row.notes)                line += ` ⚠️ ${row.notes}`;
      lines.push(line);
    }
    lines.push('');
  }

  const { data: spellData } = await supabase
    .from("spell_rules").select("spell_name, rule_name, value, description")
    .or(`spell_name.ilike.%${q}%,description.ilike.%${q}%`)
    .eq("active", true).limit(6);
  if (spellData && spellData.length > 0) {
    lines.push(`🔮 **Spell Rules (Age 116)**`);
    const grouped = {};
    for (const row of spellData) {
      if (!grouped[row.spell_name]) grouped[row.spell_name] = [];
      grouped[row.spell_name].push(`${row.rule_name}: ${row.value}`);
    }
    for (const [spell, rules] of Object.entries(grouped)) {
      lines.push(`• **${spell}** — ${rules.join(' | ')}`);
    }
    lines.push('');
  }

  console.log("[SEARCH RULES QUERY]", q);
  console.log("[SEARCH RULES RESULTS]", lines);

  return lines.length > 0 ? lines.join('\n') : null;
}

async function searchScience(type) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;
  if (type === 'all') {
    const { data } = await supabase
      .from("science_rules").select("*").eq("active", true)
      .order("category").order("science_name");
    return data;
  }
  const { data } = await supabase
    .from("science_rules").select("*")
    .or(`science_name.ilike.%${type}%,category.ilike.%${type}%`)
    .eq("active", true).limit(5);
  return data;
}

function getWikiLink() {
  return "https://shadowjuice69.github.io/utopia-war-room/utopia-wiki.html";
}

module.exports = { searchWiki, searchRules, searchScience, getWikiLink };
