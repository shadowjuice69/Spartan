const supabaseService = require("./supabase");

const ACTIVE_GAME_URL_PATTERN = "%/wol/%";

const SECTION_KINDS = {
  all: null,
  military: ["military", "attack", "news", "throne", "war", "target_finder", "council_military"],
  magic: ["magic", "ritual", "dragon", "council_spells"],
  thievery: ["thievery"],
  science: ["science", "council_science"],
  buildings: ["buildings", "survey", "council_internal"],
  kingdom: ["kingdom", "council_state"],
  aid: ["aid"],
  exploration: ["exploration"],
  operations: ["attack", "thievery", "magic", "ritual", "aid", "exploration"],
  news: ["news", "province_logs", "council_history"],
  throne: ["throne", "province_state"],
};

function isBotEventRecord(row) {
  const payload = row?.parsed_payload || {};
  const data = payload.data || {};
  return row?.page_kind === "bot_event" || payload.kind === "bot_event" || payload.type === "bot_event" ||
    data.kind === "bot_event" || data.type === "bot_event";
}

function latestPerProvinceAndKind(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    if (isBotEventRecord(row)) continue;
    const payload = row?.parsed_payload || {};
    const provinceKey = row?.province_id || payload.prov || payload.province ||
      payload.data?.owner?.province_name || row?.target_province_id || "unknown";
    const key = [
      provinceKey, row?.page_kind || "unknown", row?.visibility || "unknown",
      row?.target_kingdom_id || "", row?.target_province_id || ""
    ].join("|");
    // The query is newest-first, so the first row for each key is canonical.
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

function extractProvinceReportExcerpt(value) {
  const text = String(value || "");
  const match = text.match(/The Province of\s+.+?\(\\d+:\\d+\)/i);
  return match ? text.slice(match.index).trim() : null;
}

async function getIntel({ kd = "", section = "all", limit = 200, enemyOnly = false } = {}) {
  const sb = supabaseService.getClient();
  const code = String(kd || "").trim();
  if (!sb || !code || !Object.prototype.hasOwnProperty.call(SECTION_KINDS, section)) return [];

  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 200));
  let q = sb.from("spartan_intel_records")
    .select("id,capture_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,page_kind,intel_type,visibility,parsed_payload,raw_text,metrics")
    .or(`kingdom_id.eq.${code},target_kingdom_id.eq.${code}`)
    // The active Spartan game is World of Legends (Age 117). Genesis captures can
    // share the same stored kingdom context, so scope reads by the source URL.
    .ilike("url", ACTIVE_GAME_URL_PATTERN)
    .order("captured_at", { ascending: false })
    .limit(Math.min(1000, safeLimit * 25));

  const kinds = SECTION_KINDS[section];
  if (kinds?.length) q = q.in("page_kind", kinds);
  if (enemyOnly) q = q.eq("visibility", "enemy");

  const { data, error } = await q;
  if (error) {
    console.error("[CANONICAL INTEL] query failed:", error.message);
    return [];
  }
  return latestPerProvinceAndKind(data || []).slice(0, safeLimit);
}

async function getProvinceIntel({ kd = "", province = "", pageKind = "", visibility = "own" } = {}) {
  const sb = supabaseService.getClient();
  const code = String(kd || "").trim();
  const name = String(province || "").trim();
  if (!sb || !code || !name) return null;
  let q = sb.from("spartan_intel_records")
    .select("id,capture_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,page_kind,intel_type,visibility,parsed_payload,raw_text,metrics,age,game_year,game_tick")
    .eq("kingdom_id", code)
    .eq("visibility", visibility)
    .eq("parsed_payload->>prov", name)
    .ilike("url", ACTIVE_GAME_URL_PATTERN)
    .order("captured_at", { ascending: false })
    .limit(1);
  if (pageKind) q = q.eq("page_kind", pageKind);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("[CANONICAL INTEL] province query failed:", error.message);
    return null;
  }
  return data && !isBotEventRecord(data) ? data : null;
}

async function getLatestProvinceIntel({ kd = "", province = "", pageKinds = [] } = {}) {
  const kinds = Array.isArray(pageKinds) ? pageKinds : [pageKinds];
  const rows = await Promise.all(kinds.map(pageKind => getProvinceIntel({ kd, province, pageKind })));
  return Object.fromEntries(kinds.map((kind, index) => [kind, rows[index]]));
}

function summarize(rows) {
  const byKind = {};
  const byVisibility = {};
  for (const row of rows) {
    byKind[row.page_kind] = (byKind[row.page_kind] || 0) + 1;
    const visibility = row.visibility || "unknown";
    byVisibility[visibility] = (byVisibility[visibility] || 0) + 1;
  }
  return { count: rows.length, byKind, byVisibility };
}

module.exports = { getIntel, getProvinceIntel, getLatestProvinceIntel, summarize, SECTION_KINDS, isBotEventRecord, latestPerProvinceAndKind, extractProvinceReportExcerpt };
