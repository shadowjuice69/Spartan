const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");

const CATEGORY_EMOJI = { arcane: "🔮", economy: "💰", military: "⚔️" };

module.exports = async function investHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Database unavailable.", ephemeral: true });

  const buildQuery = interaction.options.getString("build");
  const provinceQuery = interaction.options.getString("province");

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
      coordinates,
      race: meta.race || null,
      personality: meta.personality || null
    } : null;
  } catch (e) { console.error("[SPARTAN IDENTITY RESOLVE]", e.message); }

  const provinceName = provinceQuery || me?.name;
  const kingdomCode = me?.kd_code;
  if (!provinceName) return interaction.reply({ content: "❌ No Spartan province identity found. Register, or specify `province:`.", ephemeral: true });

  const { data: reg, error: regErr } = kingdomCode && !provinceQuery
    ? await sb.from("spartan_province_registry").select("province_name,metadata").eq("kingdom_code", kingdomCode).eq("province_name", provinceName).maybeSingle()
    : await sb.from("spartan_province_registry").select("province_name,metadata").ilike("province_name", `%${provinceName}%`).limit(1).maybeSingle();
  if (regErr) return interaction.reply({ content: `❌ Lookup failed: ${regErr.message}`, ephemeral: true });
  if (!reg) return interaction.reply({ content: `❌ No registry record for **${provinceName}**.`, ephemeral: true });

  const currentBooks = reg.metadata?.science?.science || {};
  const race = reg.metadata?.throne?.race;

  let build = null;
  if (buildQuery) {
    const { data, error } = await sb.from("spartan_builds").select("name,race,personality,science,active").ilike("name", `%${buildQuery}%`).limit(1).maybeSingle();
    if (error) return interaction.reply({ content: `❌ Build lookup failed: ${error.message}`, ephemeral: true });
    build = data;
  } else if (race) {
    const { data: activeMatch } = await sb.from("spartan_builds").select("name,race,personality,science,active").ilike("race", race).eq("active", true).limit(1).maybeSingle();
    build = activeMatch;
    if (!build) {
      const { data: anyMatch } = await sb.from("spartan_builds").select("name,race,personality,science,active").ilike("race", race).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      build = anyMatch;
    }
  }
  if (!build) return interaction.reply({ content: `❌ No build found${buildQuery ? ` matching **${buildQuery}**` : race ? ` for race **${race}**` : ""}. Specify \`build:<name>\`.`, ephemeral: true });
  if (!build.science) return interaction.reply({ content: `❌ Build **${build.name}** has no science weights configured.`, ephemeral: true });

  const lines = [
    `📈 **Investment Plan — ${reg.province_name}**`,
    `Build: **${build.name}**${build.personality ? ` (${build.race} ${build.personality})` : build.race ? ` (${build.race})` : ""}`,
    "",
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

    lines.push(`${CATEGORY_EMOJI[cat] || "📊"} **${cat.charAt(0).toUpperCase() + cat.slice(1)}**`);
    if (rows.length) lines.push(`Invest next: ${rows.slice(0, 3).map(r => `**${r.name}**`).join(" → ")}`);
    for (const r of rows) lines.push(`  ${r.name} — weight ${r.weight}, have ${r.have.toLocaleString()} books`);
    for (const [name, v] of fixed) lines.push(`  ${name} — target ${v.value}% (fixed target, not weight-ranked)`);
    lines.push("");
  }

  lines.push("_Ranks each science by how far its current book share sits below its weight's target share within its category — not by raw book counts alone. Fixed-% sciences aren't ranked here; work them toward their stated target directly._");
  return interaction.reply({ content: lines.join("\n").slice(0, 1900) });
};
