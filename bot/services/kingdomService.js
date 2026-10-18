const supabaseService = require("./supabase");

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60000;

async function getKingdomInfo() {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  const [kingdomResult, ageResult] = await Promise.all([
    supabase.from("spartan_kingdom_registry")
      .select("kingdom_code,kingdom_name,game_type,metadata")
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase.from("spartan_game_rules")
      .select("age_number")
      .order("age_number", { ascending: false })
      .limit(1)
  ]);

  if (kingdomResult.error) {
    console.error("[SPARTAN KINGDOM] Registry lookup failed:", kingdomResult.error.message);
  }
  if (ageResult.error) {
    console.error("[SPARTAN KINGDOM] Current-age lookup failed:", ageResult.error.message);
  }

  const kingdom = kingdomResult.data?.[0] || null;
  const age = ageResult.data?.[0]?.age_number ?? null;
  const name = kingdom?.kingdom_name || "Spartan";
  const code = kingdom?.kingdom_code || null;
  const kingdomLabel = code ? `${name} Kingdom (${code})` : name;
  const ageLabel = age == null ? "Current Utopia Age" : `Utopia Age ${age}`;

  cache = {
    name,
    code,
    age,
    personality: null,
    footer: `${kingdomLabel} • ${ageLabel} • Spartan`
  };
  cacheTime = Date.now();
  return cache;
}

async function setKingdomInfo(name, code) {
  const supabase = supabaseService.getClient();
  if (!supabase) return false;

  const { error } = await supabase.from("spartan_kingdom_registry").upsert({
    kingdom_code: code,
    kingdom_name: name,
    game_type: "utopia",
    active: true,
    metadata: { source: "spartan-admin" }
  }, { onConflict: "kingdom_code" });

  if (error) {
    console.error("[SPARTAN KINGDOM] Registry update failed:", error.message);
    return false;
  }

  cache = null;
  cacheTime = 0;
  return true;
}

module.exports = { getKingdomInfo, setKingdomInfo };
