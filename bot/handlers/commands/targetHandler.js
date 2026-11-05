const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");
const { rankTargets, gradeValue } = require("../../../lib/spartan/target-ranker");

function n(v) { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : 0; }
function age(ts) { if (!ts) return "Unknown"; return `${Math.round((Date.now() - new Date(ts).getTime()) / 86400000)} days`; }
function pct(x) { const v = Math.round(x * 100); return `${v > 0 ? "+" : ""}${v}%`; }
function toTarget(r) {
  const t = r.metadata?.throne || {};
  return { name: r.province_name, kd: r.kingdom_code, acres: t.acres, nw: t.nw, def: t.def, race: t.race, throne: t, capturedAt: r.metadata?.throne_captured_at };
}
function basisNote(row) {
  if (row.basis === "def") return "vs kingdom defense/acre";
  if (row.basis === "nw") return "vs kingdom NW/acre (proxy, confirm with SOT)";
  return "";
}

module.exports = async function targetHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Database not connected.", ephemeral: true });
  await interaction.deferReply({ ephemeral: false });

  let me = null;
  try {
    const access = await spartanAccess.get(interaction.user.id);
    const meta = access?.metadata || {};
    const coordinates = String(meta.coordinates || access?.kingdom_code || "").trim();
    me = access ? {
      id: interaction.user.id,
      name: meta.province || access.username || null,
      province: meta.province || access.username || null,
      kd_code: coordinates || null,
      nw: meta.nw ?? null,
      acres: meta.acres ?? null,
      coordinates,
      race: meta.race || null,
      personality: meta.personality || null
    } : null;
  } catch (e) { console.error("[SPARTAN IDENTITY RESOLVE]", e.message); }
  const myNW = me?.nw ? n(me.nw) : 0;
  const myAcres = me?.acres ? n(me.acres) : 0;
  const you = { nw: myNW || null, acres: myAcres || null };

  const provinceQuery = interaction.options.getString("province");

  if (provinceQuery) {
    const { data, error } = await sb.from("spartan_province_registry").select("province_name,kingdom_code,metadata").ilike("province_name", `%${provinceQuery}%`).limit(1);
    if (error) return interaction.editReply(`❌ Lookup failed: ${error.message}`);
    if (!data?.length) return interaction.editReply(`❌ No intel found for **${provinceQuery}**.`);
    const row = data[0]; const t = row.metadata?.throne;
    if (!t) return interaction.editReply(`❌ **${row.province_name}** is registered but has no captured Throne intel yet.`);
    const nw = n(t.nw);

    // Rank against the rest of its kingdom so the score means "soft or hard for that kingdom".
    let ranked = null;
    try {
      const { data: kdRows } = await sb.from("spartan_province_registry").select("province_name,kingdom_code,metadata").eq("kingdom_code", row.kingdom_code).not("metadata->throne", "is", null);
      const list = rankTargets({ targets: (kdRows || []).map(toTarget), you, mode: "value", limit: 200 });
      ranked = list.find(x => x.p.name === row.province_name) || null;
    } catch (e) { console.error("[SPARTAN TARGET RANK]", e.message); }

    const grade = ranked ? gradeValue(ranked.value) : null;
    const lines = [
      `🎯 **${row.province_name}** (${row.kingdom_code}) — ${t.race || "Unknown race"}`,
      ranked ? `${grade.emoji} ${grade.letter} Target Score: ${ranked.value}/100 (${pct(ranked.vsKd)} ${basisNote(ranked)})` : "",
      ranked && ranked.gain != null ? `• Est. gain: ~${Math.floor(ranked.gain)} acres${ranked.capped ? " (capped)" : ""}` : "",
      "", `📊 **Stats:**`,
      t.nw != null ? `• NW: ${t.nw}${myNW ? ` (${Math.round((nw / myNW) * 100)}% of yours)` : ""}` : "",
      ranked ? `• NW/acre: ${Math.round(ranked.nwpa)}` : "",
      t.acres != null ? `• Acres: ${t.acres}` : "",
      t.off != null ? `• Offense: ${t.off}` : "",
      t.def != null ? `• Defense: ${t.def}` : "",
      t.be != null ? `• BE: ${t.be}%` : "",
      t.o_tpa != null ? `• oTPA: ${t.o_tpa} | dTPA: ${t.d_tpa ?? "?"}` : "",
      t.o_wpa != null ? `• oWPA: ${t.o_wpa} | dWPA: ${t.d_wpa ?? "?"}` : "",
      t.good_spells != null ? `✨ Spells: ${t.good_spells}` : "",
      "", `🕐 Intel age: ${age(row.metadata?.throne_captured_at)}`,
    ].filter(Boolean).join("\n");
    return interaction.editReply(lines.slice(0, 1900));
  }

  const { data: rows, error } = await sb.from("spartan_province_registry").select("province_name,kingdom_code,metadata").not("metadata->throne", "is", null);
  if (error) return interaction.editReply(`❌ Lookup failed: ${error.message}`);
  if (!rows?.length) return interaction.editReply("❌ No province intel captured yet.");

  // Never rank your own kingdom as targets.
  const ownKd = me?.kd_code || "";
  const pool = rows.filter(r => !ownKd || r.kingdom_code !== ownKd).map(toTarget);
  const mode = interaction.options.getString("mode");
  const ranked = rankTargets({
    targets: pool, you, rangeOnly: !!myNW,
    mode: mode === "gain" || mode === "soft" ? mode : "value", limit: 8,
  });

  if (!ranked.length) return interaction.editReply("❌ No targets found in your range among captured provinces.");

  const head = myNW ? `(vs ${myNW.toLocaleString()} NW${myAcres ? `, ${myAcres.toLocaleString()} acres` : ""})` : "(set your NW in /spartan to filter by range)";
  const lines = [`🎯 **Top Targets** ${head}`, ""];
  for (const r of ranked) {
    const g = gradeValue(r.value);
    const ratio = myNW ? ` ${Math.round((r.nw / myNW) * 100)}% of you` : "";
    lines.push(`${g.emoji} **${g.letter} ${r.p.name}** (${r.p.race || "?"}, ${r.p.kd}) — score ${r.value}`);
    lines.push(`  📍 ${Math.round(r.acres)} acres | ${Math.round(r.nw).toLocaleString()} NW${ratio} | ${pct(r.vsKd)} vs kd${r.gain != null ? ` | ~${Math.floor(r.gain)} acres gain` : ""}${r.def != null ? ` | Def: ${Math.round(r.def).toLocaleString()}` : ""}`);
  }
  lines.push(`\nScore = estimated gain ÷ how heavy the province is for its kingdom (defense/acre when known, else NW/acre). NW/acre is a proxy: confirm with a SOT/SOM before sending. `/spartan-war target province:<name>` shows one target.`);
  return interaction.editReply(lines.join("\n").slice(0, 1900));
};