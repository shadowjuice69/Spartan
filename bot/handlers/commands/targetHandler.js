const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");
const canonicalIntel = require("../../services/canonicalIntelService");
const { parseThrone } = require("../../services/canonicalIntelParser");
const { rankTargets, gradeValue } = require("../../../lib/spartan/target-ranker");

function n(v) { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : 0; }
function age(ts) { if (!ts) return "Unknown"; return Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 86400000)) + " days"; }
function pct(x) { const v = Math.round(x * 100); return (v > 0 ? "+" : "") + v + "%"; }
function targetFrom(row, parsed) {
  return {
    name: row.province_name, kd: row.kingdom_code, acres: parsed.land,
    nw: parsed.networth, def: parsed.defense, race: parsed.race,
    throne: {
      acres: parsed.land, nw: parsed.networth, def: parsed.defense,
      off: parsed.offense, be: parsed.buildingEffectiveness, race: parsed.race
    },
    capturedAt: row.captured_at
  };
}
function basisNote(row) {
  if (row.basis === "def") return "vs kingdom defense/acre";
  if (row.basis === "nw") return "vs kingdom NW/acre (proxy, confirm with SoT)";
  return "";
}
async function latestThrone(kd, province) {
  const row = await canonicalIntel.getProvinceIntel({ kd, province, pageKind: "throne", visibility: "own" });
  return row ? { row, parsed: parseThrone(row.parsed_payload || { raw_text: row.raw_text }) } : null;
}
async function registeredProvinces(sb) {
  const { data, error } = await sb.from("spartan_province_registry")
    .select("province_name,kingdom_code");
  if (error) throw error;
  return data || [];
}

module.exports = async function targetHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Database not connected.", ephemeral: true });
  await interaction.deferReply({ ephemeral: false });

  const access = await spartanAccess.get(interaction.user.id).catch(() => null);
  const meta = access?.metadata || {};
  const ownProvince = meta.province || access?.username || null;
  const ownKd = String(meta.coordinates || access?.kingdom_code || "").trim();
  const ownCapture = ownProvince && ownKd ? await latestThrone(ownKd, ownProvince) : null;
  const you = {
    nw: ownCapture?.parsed.networth || (meta.nw ? n(meta.nw) : null),
    acres: ownCapture?.parsed.land || (meta.acres ? n(meta.acres) : null)
  };
  const provinceQuery = interaction.options.getString("province");

  if (provinceQuery) {
    const { data, error } = await sb.from("spartan_province_registry")
      .select("province_name,kingdom_code").ilike("province_name", "%" + provinceQuery + "%").limit(1);
    if (error) return interaction.editReply("❌ Lookup failed: " + error.message);
    const selected = data?.[0];
    if (!selected) return interaction.editReply("❌ No registered province matching **" + provinceQuery + "**.");
    const result = await latestThrone(selected.kingdom_code, selected.province_name);
    if (!result) return interaction.editReply("❌ **" + selected.province_name + "** is registered, but no structured own Throne capture exists in canonical website Intel for " + selected.kingdom_code + ". Enemy-page captures currently do not identify this province reliably.");
    const t = result.parsed;
    const target = targetFrom(selected, t);
    let ranked = null;
    try {
      const rows = await registeredProvinces(sb);
      const sameKd = rows.filter(r => r.kingdom_code === selected.kingdom_code);
      const captured = await Promise.all(sameKd.map(async r => {
        const found = await latestThrone(r.kingdom_code, r.province_name);
        return found ? targetFrom(r, found.parsed) : null;
      }));
      const list = rankTargets({ targets: captured.filter(Boolean), you, mode: "value", limit: 200 });
      ranked = list.find(x => x.p.name === selected.province_name) || null;
    } catch (e) { console.error("[SPARTAN TARGET RANK]", e.message); }

    const grade = ranked ? gradeValue(ranked.value) : null;
    const lines = [
      "🎯 **" + selected.province_name + "** (" + selected.kingdom_code + ") — " + (t.race || "Unknown race"),
      ranked ? grade.emoji + " " + grade.letter + " Target Score: " + ranked.value + "/100 (" + pct(ranked.vsKd) + " " + basisNote(ranked) + ")" : "",
      ranked && ranked.gain != null ? "• Est. gain: ~" + Math.floor(ranked.gain) + " acres" + (ranked.capped ? " (capped)" : "") : "",
      "", "📊 **Captured Stats:**",
      t.networth != null ? "• NW: " + fmtNumber(t.networth) + (you.nw ? " (" + Math.round((t.networth / you.nw) * 100) + "% of yours)" : "") : "",
      ranked ? "• NW/acre: " + Math.round(ranked.nwpa) : "",
      t.land != null ? "• Acres: " + fmtNumber(t.land) : "",
      t.offense != null ? "• Offense: " + fmtNumber(t.offense) : "",
      t.defense != null ? "• Defense: " + fmtNumber(t.defense) : "",
      t.buildingEffectiveness != null ? "• BE: " + t.buildingEffectiveness + "%" : "",
      "", "🕐 Canonical Throne capture: " + age(result.row.captured_at)
    ].filter(Boolean).join("\n");
    return interaction.editReply(lines.slice(0, 1900));
  }

  let rows;
  try { rows = await registeredProvinces(sb); }
  catch (e) { return interaction.editReply("❌ Province lookup failed: " + e.message); }
  const poolRows = rows.filter(r => !ownKd || r.kingdom_code !== ownKd);
  const pool = (await Promise.all(poolRows.map(async r => {
    const found = await latestThrone(r.kingdom_code, r.province_name);
    return found ? targetFrom(r, found.parsed) : null;
  }))).filter(Boolean);
  if (!pool.length) return interaction.editReply("❌ No enemy target has a structured canonical Throne capture yet. The bot will not rank stale registry metadata or unlabelled enemy-page captures.");

  const mode = interaction.options.getString("mode");
  const ranked = rankTargets({
    targets: pool, you, rangeOnly: !!you.nw,
    mode: mode === "gain" || mode === "soft" ? mode : "value", limit: 8
  });
  if (!ranked.length) return interaction.editReply("❌ No targets found in your range among provinces with canonical Throne captures.");
  const head = you.nw ? "(vs " + fmtNumber(you.nw) + " NW" + (you.acres ? ", " + fmtNumber(you.acres) + " acres" : "") + ")" : "(set your NW in /spartan to filter by range)";
  const lines = ["🎯 **Top Targets** " + head, ""];
  for (const r of ranked) {
    const g = gradeValue(r.value);
    const ratio = you.nw ? " " + Math.round((r.nw / you.nw) * 100) + "% of you" : "";
    lines.push(g.emoji + " **" + g.letter + " " + r.p.name + "** (" + (r.p.race || "?") + ", " + r.p.kd + ") — score " + r.value);
    lines.push("  📍 " + Math.round(r.acres) + " acres | " + fmtNumber(r.nw) + " NW" + ratio + " | " + pct(r.vsKd) + " vs kd" + (r.gain != null ? " | ~" + Math.floor(r.gain) + " acres gain" : "") + (r.def != null ? " | Def: " + fmtNumber(r.def) : ""));
  }
  lines.push("\nScore uses canonical captured Throne values only. It is a shortlist, not a guarantee of gains; confirm with current SoT/SoM before sending.");
  return interaction.editReply(lines.join("\n").slice(0, 1900));
};

function fmtNumber(value) {
  return value == null ? "?" : Number(value).toLocaleString();
}
