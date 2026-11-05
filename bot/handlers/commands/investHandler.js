const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");
const canonicalIntel = require("../../services/canonicalIntelService");
const { parseScience, parseThrone } = require("../../services/canonicalIntelParser");

const CATEGORY_EMOJI = { arcane: "🔮", economy: "💰", military: "⚔️" };

module.exports = async function investHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Database unavailable.", ephemeral: true });
  const buildQuery = interaction.options.getString("build");
  const provinceQuery = interaction.options.getString("province");

  let provinceName = null, kingdomCode = null;
  if (provinceQuery) {
    const { data, error } = await sb.from("spartan_province_registry")
      .select("province_name,kingdom_code").ilike("province_name", "%" + provinceQuery + "%").limit(1).maybeSingle();
    if (error) return interaction.reply({ content: "❌ Lookup failed: " + error.message, ephemeral: true });
    if (!data) return interaction.reply({ content: "❌ No registered province matching **" + provinceQuery + "**.", ephemeral: true });
    provinceName = data.province_name;
    kingdomCode = data.kingdom_code;
  } else {
    const access = await spartanAccess.get(interaction.user.id).catch(() => null);
    const meta = access?.metadata || {};
    provinceName = meta.province || access?.username || null;
    kingdomCode = String(meta.coordinates || access?.kingdom_code || "").trim() || null;
  }
  if (!provinceName || !kingdomCode) return interaction.reply({ content: "❌ No Spartan province identity found. Register, or specify a registered province.", ephemeral: true });

  const [scienceRow, throneRow] = await Promise.all([
    canonicalIntel.getProvinceIntel({ kd: kingdomCode, province: provinceName, pageKind: "science", visibility: "own" }),
    canonicalIntel.getProvinceIntel({ kd: kingdomCode, province: provinceName, pageKind: "throne", visibility: "own" })
  ]);
  if (!scienceRow) return interaction.reply({ content: "❌ No own website Science capture found for **" + provinceName + "** (" + kingdomCode + ").", ephemeral: true });
  const currentBooks = Object.fromEntries(parseScience(scienceRow.parsed_payload || { raw_text: scienceRow.raw_text }).map(s => [s.name, s.books]));
  const race = throneRow ? parseThrone(throneRow.parsed_payload || { raw_text: throneRow.raw_text }).race : null;

  let build = null;
  if (buildQuery) {
    const { data, error } = await sb.from("spartan_builds").select("name,race,personality,science,active").ilike("name", "%" + buildQuery + "%").limit(1).maybeSingle();
    if (error) return interaction.reply({ content: "❌ Build lookup failed: " + error.message, ephemeral: true });
    build = data;
  } else if (race) {
    const { data: activeMatch } = await sb.from("spartan_builds").select("name,race,personality,science,active").ilike("race", race).eq("active", true).limit(1).maybeSingle();
    build = activeMatch;
    if (!build) {
      const { data: anyMatch } = await sb.from("spartan_builds").select("name,race,personality,science,active").ilike("race", race).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      build = anyMatch;
    }
  }
  if (!build) return interaction.reply({ content: "❌ No build found" + (buildQuery ? " matching **" + buildQuery + "**" : race ? " for race **" + race + "**" : "") + ". Specify build:<name>.", ephemeral: true });
  if (!build.science) return interaction.reply({ content: "❌ Build **" + build.name + "** has no science weights configured.", ephemeral: true });

  const lines = [
    "📈 **Investment Plan — " + provinceName + "**",
    "Build: **" + build.name + "**" + (build.personality ? " (" + build.race + " " + build.personality + ")" : build.race ? " (" + build.race + ")" : ""),
    ""
  ];
  for (const [cat, sciences] of Object.entries(build.science)) {
    const weighted = Object.entries(sciences).filter(([, s]) => s.type === "weight");
    const fixed = Object.entries(sciences).filter(([, s]) => s.type === "actual_pct");
    const totalWeight = weighted.reduce((s, [, v]) => s + (Number(v.value) || 0), 0);
    const totalBooks = weighted.reduce((s, [name]) => s + (Number(currentBooks[name.toLowerCase()]) || 0), 0);
    const rows = weighted.map(([name, v]) => {
      const have = Number(currentBooks[name.toLowerCase()]) || 0;
      const targetShare = totalWeight ? Number(v.value) / totalWeight : 0;
      const haveShare = totalBooks ? have / totalBooks : 0;
      return { name, weight: v.value, have, gap: targetShare - haveShare };
    }).sort((a, b) => b.gap - a.gap);
    lines.push((CATEGORY_EMOJI[cat] || "📊") + " **" + cat.charAt(0).toUpperCase() + cat.slice(1) + "**");
    if (rows.length) lines.push("Invest next: " + rows.slice(0, 3).map(r => "**" + r.name + "**").join(" → "));
    for (const r of rows) lines.push("  " + r.name + " — weight " + r.weight + ", have " + r.have.toLocaleString() + " books");
    for (const [name, v] of fixed) lines.push("  " + name + " — target " + v.value + "% (fixed target, not weight-ranked)");
    lines.push("");
  }
  lines.push("_Ranks each science by how far its current book share sits below its weight's target share within its category — not by raw book counts alone. Fixed-% sciences aren't ranked here; work them toward their stated target directly._");
  return interaction.reply({ content: lines.join("\n").slice(0, 1900) });
};
