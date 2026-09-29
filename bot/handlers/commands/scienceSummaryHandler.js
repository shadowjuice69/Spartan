const { EmbedBuilder } = require("discord.js");
const { getKingdomInfo } = require("../../services/kingdomService");
const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");

const CATEGORY_LABEL = {
  alchemy: "economy", artisan: "economy", bookkeeping: "economy", housing: "economy", production: "economy", tools: "economy",
  channeling: "arcane_arts", cunning: "arcane_arts", finesse: "arcane_arts", sorcery: "arcane_arts",
  crime: "military", heroism: "military", resilience: "military", shielding: "military", siege: "military", strategy: "military", tactics: "military", valor: "military", arcana: "military",
};
const CATEGORY_EMOJI = { economy: "💰", military: "⚔️", arcane_arts: "🔮" };

module.exports = async function scienceSummaryHandler(interaction) {
  const kd = await getKingdomInfo();
  const supabase = supabaseService.getClient();
  if (!supabase) return interaction.reply({ content: "❌ Database unavailable.", ephemeral: true });

  const targetProvince = interaction.options.getString("province") || null;
  const librariesPct = interaction.options.getNumber("libraries") || 0;

  let provinceName, kingdomCode;
  if (targetProvince) {
    const { data, error } = await supabase.from("spartan_province_registry").select("province_name,kingdom_code,metadata").ilike("province_name", `%${targetProvince}%`).limit(1);
    if (error) return interaction.reply({ content: `❌ Lookup failed: ${error.message}`, ephemeral: true });
    if (!data?.length) return interaction.reply({ content: `❌ Province **${targetProvince}** not found.`, ephemeral: true });
    provinceName = data[0].province_name; kingdomCode = data[0].kingdom_code; var metadata = data[0].metadata || {};
  } else {
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
    if (!me) return interaction.reply({ content: "❌ No Spartan province identity found. Register or specify a province.", ephemeral: true });
    const { data, error } = await supabase.from("spartan_province_registry").select("province_name,kingdom_code,metadata").eq("kingdom_code", me.kd_code).eq("province_name", me.name).maybeSingle();
    if (error) return interaction.reply({ content: `❌ Lookup failed: ${error.message}`, ephemeral: true });
    if (!data) return interaction.reply({ content: `❌ No registry record found for **${me.name}**.`, ephemeral: true });
    provinceName = data.province_name; kingdomCode = data.kingdom_code; var metadata = data.metadata || {};
  }

  const science = metadata.science?.science;
  const effects = metadata.science?.science_effects;
  if (!science && !effects) return interaction.reply({ content: `❌ No Science capture for **${provinceName}** yet.`, ephemeral: true });

  const scienceKeys = ["alchemy", "artisan", "bookkeeping", "channeling", "crime", "cunning", "finesse", "heroism", "housing", "production", "resilience", "shielding", "siege", "sorcery", "strategy", "tactics", "tools", "valor", "arcana"];

  const grouped = {};
  for (const key of scienceKeys) {
    const bookCount = Number(science?.[key]) || 0;
    const gameEffect = effects?.[key];
    if (!bookCount && !gameEffect) continue;
    const cat = CATEGORY_LABEL[key] || "military";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ name: key, books: bookCount, bonus: gameEffect ? gameEffect.replace("%", "") : null });
  }

  if (!Object.keys(grouped).length) return interaction.reply({ content: `❌ Science capture for **${provinceName}** has no parsed book/effect data yet.`, ephemeral: true });

  const libNote = librariesPct > 0 ? ` · Libraries: ${librariesPct}% (informational only — game-reported %s below already include your actual bonuses)` : "";
  const capturedAt = metadata.science_captured_at ? `<t:${Math.floor(new Date(metadata.science_captured_at).getTime() / 1000)}:R>` : "unknown";
  const embed = new EmbedBuilder()
    .setTitle(`🔬 Science Summary — ${provinceName}`)
    .setColor(0x6366f1)
    .setDescription(`Kingdom: **${kingdomCode}**${libNote} | Captured: ${capturedAt}`)
    .setFooter({ text: kd.footer });

  for (const [cat, sciences] of Object.entries(grouped)) {
    const emoji = CATEGORY_EMOJI[cat] || "📊";
    const catName = cat.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
    const lines = sciences.sort((a, b) => b.books - a.books)
      .map(s => `**${s.name}** — \`${s.bonus != null ? s.bonus + "%" : "no captured effect"}\` *(${s.books > 0 ? s.books.toLocaleString() : "—"} books)*`)
      .join("\n");
    embed.addFields({ name: `${emoji} ${catName}`, value: lines.slice(0, 1024) });
  }

  return interaction.reply({ embeds: [embed] });
};
