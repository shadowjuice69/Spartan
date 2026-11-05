const { EmbedBuilder } = require("discord.js");
const { getKingdomInfo } = require("../../services/kingdomService");
const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");
const canonicalIntel = require("../../services/canonicalIntelService");
const { parseScience } = require("../../services/canonicalIntelParser");

const CATEGORY_LABEL = { economy: "Economy", military: "Military", arcane_arts: "Arcane Arts" };
const CATEGORY_EMOJI = { economy: "💰", military: "⚔️", arcane_arts: "🔮" };

module.exports = async function scienceSummaryHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Database unavailable.", ephemeral: true });
  const targetProvince = interaction.options.getString("province") || null;
  const librariesPct = interaction.options.getNumber("libraries") || 0;

  let provinceName = null, kingdomCode = null;
  if (targetProvince) {
    const { data, error } = await sb.from("spartan_province_registry")
      .select("province_name,kingdom_code").ilike("province_name", "%" + targetProvince + "%").limit(1).maybeSingle();
    if (error) return interaction.reply({ content: "❌ Lookup failed: " + error.message, ephemeral: true });
    if (!data) return interaction.reply({ content: "❌ Province **" + targetProvince + "** not found.", ephemeral: true });
    provinceName = data.province_name;
    kingdomCode = data.kingdom_code;
  } else {
    const access = await spartanAccess.get(interaction.user.id).catch(() => null);
    const meta = access?.metadata || {};
    provinceName = meta.province || access?.username || null;
    kingdomCode = String(meta.coordinates || access?.kingdom_code || "").trim() || null;
    if (!provinceName || !kingdomCode) return interaction.reply({ content: "❌ No Spartan province identity found. Register or specify a province.", ephemeral: true });
  }

  const row = await canonicalIntel.getProvinceIntel({ kd: kingdomCode, province: provinceName, pageKind: "science", visibility: "own" });
  if (!row) return interaction.reply({ content: "❌ No own website Science capture found for **" + provinceName + "** (" + kingdomCode + ").", ephemeral: true });
  const sciences = parseScience(row.parsed_payload || { raw_text: row.raw_text });
  if (!sciences.length) return interaction.reply({ content: "❌ Science capture exists for **" + provinceName + "**, but no book/effect rows could be parsed.", ephemeral: true });

  const grouped = {};
  for (const science of sciences) {
    if (!grouped[science.category]) grouped[science.category] = [];
    grouped[science.category].push(science);
  }
  const kd = await getKingdomInfo();
  const capturedAt = row.captured_at ? "<t:" + Math.floor(new Date(row.captured_at).getTime() / 1000) + ":R>" : "unknown";
  const libNote = librariesPct > 0 ? " · Libraries: " + librariesPct + "% (informational only; game-reported effects already include bonuses)" : "";
  const embed = new EmbedBuilder()
    .setTitle("🔬 Science Summary — " + provinceName)
    .setColor(0x6366f1)
    .setDescription("Kingdom: **" + kingdomCode + "**" + libNote + " · Captured: " + capturedAt);
  if (kd?.footer) embed.setFooter({ text: kd.footer });

  for (const [category, rows] of Object.entries(grouped)) {
    const lines = rows.sort((a, b) => b.books - a.books).map(s =>
      "**" + s.name + "** — " + s.effect + "% " + (s.description || "") + " *(" + s.books.toLocaleString() + " books)*"
    );
    embed.addFields({
      name: (CATEGORY_EMOJI[category] || "📊") + " " + (CATEGORY_LABEL[category] || category),
      value: lines.join("\n").slice(0, 1024),
      inline: false
    });
  }
  return interaction.reply({ embeds: [embed], ephemeral: true });
};
