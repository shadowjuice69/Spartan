const supabaseService = require("../../services/supabase");
const nexusIdentityService = require("../../services/nexusIdentityService");

const HIGH_GAIN_RACES = ["elf", "faery", "halfling", "dryad"];
const LOW_GAIN_RACES = ["undead", "orc"];

function n(v) { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : 0; }
function age(ts) { if (!ts) return "Unknown"; return `${Math.round((Date.now() - new Date(ts).getTime()) / 86400000)} days`; }

function scoreTarget(t, myNW) {
  let score = 0;
  const nw = n(t.nw), acres = n(t.acres), def = n(t.def), off = n(t.off);
  const race = String(t.race || "").toLowerCase();
  const ratio = myNW > 0 ? nw / myNW : 0;
  if (ratio >= 0.9 && ratio <= 1.05) score += 30; else if (ratio >= 0.75 && ratio <= 1.1) score += 15;
  if (acres > 2500) score += 25; else if (acres > 2000) score += 18; else if (acres > 1500) score += 10;
  if (HIGH_GAIN_RACES.some(r => race.includes(r))) score += 20;
  if (LOW_GAIN_RACES.some(r => race.includes(r))) score -= 10;
  if (def > 0 && off > 0) { if (def < off * 0.3) score += 20; else if (def < off * 0.5) score += 10; else if (def > off) score -= 15; }
  return score;
}
function gradeScore(score) { if (score >= 70) return "🟢 S"; if (score >= 50) return "🟢 A"; if (score >= 30) return "🟡 B"; if (score >= 10) return "🟠 C"; return "🔴 D"; }

module.exports = async function targetHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Database not connected.", ephemeral: true });
  await interaction.deferReply({ ephemeral: false });

  let me = null;
  try { me = await nexusIdentityService.resolve(interaction.user.id); } catch (e) { console.error("[TARGET IDENTITY RESOLVE]", e.message); }
  const myNW = me?.nw ? n(me.nw) : 0;

  const provinceQuery = interaction.options.getString("province");

  if (provinceQuery) {
    const { data, error } = await sb.from("spartan_province_registry").select("province_name,kingdom_code,metadata").ilike("province_name", `%${provinceQuery}%`).limit(1);
    if (error) return interaction.editReply(`❌ Lookup failed: ${error.message}`);
    if (!data?.length) return interaction.editReply(`❌ No intel found for **${provinceQuery}**.`);
    const row = data[0]; const t = row.metadata?.throne;
    if (!t) return interaction.editReply(`❌ **${row.province_name}** is registered but has no captured Throne intel yet.`);
    const nw = n(t.nw); const score = scoreTarget(t, myNW); const grade = gradeScore(score);
    const lines = [
      `🎯 **${row.province_name}** (${row.kingdom_code}) — ${t.race || "Unknown race"}`,
      `${grade} Target Score: ${score}`, ``, `📊 **Stats:**`,
      t.nw != null ? `• NW: ${t.nw}${myNW ? ` (${Math.round((nw / myNW) * 100)}% of yours)` : ""}` : "",
      t.acres != null ? `• Acres: ${t.acres}` : "",
      t.off != null ? `• Offense: ${t.off}` : "",
      t.def != null ? `• Defense: ${t.def}` : "",
      t.be != null ? `• BE: ${t.be}%` : "",
      t.o_tpa != null ? `• oTPA: ${t.o_tpa} | dTPA: ${t.d_tpa ?? "?"}` : "",
      t.o_wpa != null ? `• oWPA: ${t.o_wpa} | dWPA: ${t.d_wpa ?? "?"}` : "",
      t.good_spells != null ? `✨ Spells: ${t.good_spells}` : "",
      ``, `🕐 Intel age: ${age(row.metadata?.throne_captured_at)}`,
    ].filter(Boolean).join("\n");
    return interaction.editReply(lines.slice(0, 1900));
  }

  const { data: rows, error } = await sb.from("spartan_province_registry").select("province_name,kingdom_code,metadata").not("metadata->throne", "is", null);
  if (error) return interaction.editReply(`❌ Lookup failed: ${error.message}`);
  if (!rows?.length) return interaction.editReply("❌ No province intel captured yet.");

  const scored = rows.map(r => ({ name: r.province_name, kd: r.kingdom_code, t: r.metadata.throne, capturedAt: r.metadata.throne_captured_at, score: scoreTarget(r.metadata.throne, myNW) }))
    .filter(r => { if (!myNW) return true; const ratio = n(r.t.nw) / myNW; return ratio >= 0.75 && ratio <= 1.15; })
    .sort((a, b) => b.score - a.score).slice(0, 8);

  if (!scored.length) return interaction.editReply("❌ No targets found in your NW range among captured provinces.");

  const lines = [`🎯 **Top Targets** ${myNW ? `(vs ${myNW.toLocaleString()} NW)` : ""}`, ``];
  for (const r of scored) {
    const nw = n(r.t.nw); const ratio = myNW ? `${Math.round((nw / myNW) * 100)}%` : "";
    lines.push(`${gradeScore(r.score)} **${r.name}** (${r.t.race || "?"}, ${r.kd}) — ${r.t.nw ?? "?"} NW ${ratio}`);
    if (r.t.acres) lines.push(`  📍 ${r.t.acres} acres${r.t.def != null ? ` | Def: ${r.t.def}` : ""}`);
  }
  lines.push(`\nOnly ranks provinces someone has actually captured via Throne. Use \`/spartan-war target province:<name>\` for full intel on one target.`);
  return interaction.editReply(lines.join("\n").slice(0, 1900));
};
