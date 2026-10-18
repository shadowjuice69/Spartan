const supabaseService = require("./supabase");
const rulesContext = require("./rulesContext");
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
      console.log("[SPARTAN WIKI] Loaded authoritative local wiki:", file);
      return localWikiCache;
    } catch (_) {}
  }
  localWikiCache = "";
  console.warn("[SPARTAN WIKI] Local wiki file was not found");
  return localWikiCache;
}

function stripWikiHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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
    "what", "does", "do", "is", "are", "the", "a", "an", "should", "i", "use",
    "in", "during", "war", "age", "how", "why", "can", "my", "with", "wiki",
    "data", "about", "for", "of", "on", "to", "and", "or", "me", "tell", "give"
  ]);
  const terms = String(question || "").toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
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
      const content = plain.slice(start, end).replace(/\s+/g, " ").trim();
      const score = terms.reduce((count, word) => count + (content.toLowerCase().includes(word) ? 1 : 0), 0);
      scored.push({ title: `Spartan Utopia Wiki — ${term}`, content, score });
      from = idx + term.length;
      hits++;
    }
  }

  const seen = new Set();
  return scored.sort((a, b) => b.score - a.score)
    .filter(row => {
      const key = row.content.slice(0, 220);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ title, content }) => ({ title, content }));
}

async function searchWiki(question) {
  const localResults = searchLocalWiki(question, 5);
  const supabase = supabaseService.getClient();
  if (!supabase) return localResults;

  const words = String(question || "").toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2)
    .slice(0, 5)
    .map(word => word.replace(/[%,()]/g, ""));
  if (!words.length) return localResults;

  const filters = words.flatMap(word => [
    `title.ilike.%${word}%`,
    `content_text.ilike.%${word}%`
  ]).join(",");

  const { data, error } = await supabase
    .from("spartan_wiki")
    .select("title,content_text,age_number")
    .eq("approved", true)
    .or(filters)
    .order("age_number", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[SPARTAN WIKI] Canonical search failed:", error.message);
    return localResults;
  }

  const dbResults = (data || []).map(row => ({
    title: row.title,
    content: String(row.content_text || "").slice(0, 1600),
    age_number: row.age_number
  }));
  const combined = [...localResults, ...dbResults];
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
  try {
    const result = await rulesContext.build(supabase, question);
    if (!result?.found) return null;
    const ageLabel = result.age == null ? "current stored" : `Age ${result.age}`;
    return `Authoritative Spartan rules (${ageLabel}):\n${result.text}`;
  } catch (error) {
    console.error("[SPARTAN RULES] Canonical lookup failed:", error.message);
    return null;
  }
}

async function searchScience(type = "all") {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("spartan_game_rules")
    .select("category,rule_name,value,description,age_number")
    .order("age_number", { ascending: false })
    .limit(250);
  if (error) {
    console.error("[SPARTAN SCIENCE] Canonical lookup failed:", error.message);
    return null;
  }

  const rows = data || [];
  const latestAge = rows.reduce((max, row) => {
    const age = Number(row.age_number);
    return Number.isFinite(age) ? Math.max(max, age) : max;
  }, -Infinity);
  const currentRows = rows.filter(row => latestAge === -Infinity || Number(row.age_number) === latestAge);
  const scienceRows = currentRows.filter(row => {
    const category = String(row.category || "").toLowerCase();
    const name = String(row.rule_name || "").toLowerCase();
    const value = String(row.value ?? "").toLowerCase();
    return category.includes("science") || name.includes("science") ||
      /\b(alchemy|channeling|crime|cunning|finesse|heroism|housing|production|resilience|shielding|siege|sorcery|strategy|tactics|tools|valor|arcana|artisan|bookkeeping)\b/.test(name + " " + value);
  });

  const query = String(type || "all").toLowerCase();
  const filtered = query === "all"
    ? scienceRows
    : scienceRows.filter(row => [row.category, row.rule_name, row.value, row.description]
      .some(value => String(value || "").toLowerCase().includes(query)));
  return filtered.map(row => ({
    science_name: row.rule_name,
    category: row.category || "science",
    effect: typeof row.value === "string" ? row.value : JSON.stringify(row.value),
    multiplier: null,
    race_modifier: null,
    personality_modifier: null,
    notes: row.description || null,
    age_number: row.age_number
  }));
}

function getWikiLink() {
  return "https://sparta-west.onrender.com/wiki";
}

module.exports = { searchWiki, searchRules, searchScience, getWikiLink };
