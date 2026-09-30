const supabaseService = require("./supabase");

const SECTION_KINDS = {
  all: null,
  military: ["military","attack","news","throne","war","council_military"],
  magic: ["magic","ritual","dragon","council_spells"],
  thievery: ["thievery"],
  science: ["science","council_science"],
  buildings: ["buildings","survey","council_internal"],
  kingdom: ["kingdom","council_state"],
  aid: ["aid"],
  exploration: ["exploration"],
  operations: ["attack","thievery","magic","ritual","aid","exploration"],
  news: ["news","province_logs","council_history"],
  throne: ["throne","province_state"],
};

async function getIntel({ kd = "", section = "all", limit = 200, enemyOnly = false } = {}) {
  const sb = supabaseService.getClient();
  if (!sb) return [];
  let q = sb.from("spartan_intel_records")
    .select("id,capture_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,page_kind,intel_type,visibility,parsed_payload,raw_text,metrics")
    .order("captured_at", { ascending: false })
    .limit(limit);

  const kinds = SECTION_KINDS[section];
  if (kinds?.length) q = q.in("page_kind", kinds);

  const code = String(kd || "").trim();
  if (enemyOnly) {
    if (!code) return [];
    q = q.eq("visibility", "enemy");
  } else if (code) {
    q = q.or(`kingdom_id.eq.${code},target_kingdom_id.eq.${code},kingdom_id.is.null,target_kingdom_id.is.null`);
  }

  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

function summarize(rows) {
  const byKind = {};
  const byVisibility = {};
  for (const row of rows) {
    byKind[row.page_kind] = (byKind[row.page_kind] || 0) + 1;
    const v = row.visibility || "unknown";
    byVisibility[v] = (byVisibility[v] || 0) + 1;
  }
  return { count: rows.length, byKind, byVisibility };
}

module.exports = { getIntel, summarize, SECTION_KINDS };
