const { EmbedBuilder } = require("discord.js");
const { getKingdomInfo } = require("../../services/kingdomService");
const wikiService = require("../../services/wikiService");

const CATEGORY_EMOJI = {
  economy: "💰", military: "⚔️", arcane_arts: "🔮", science: "🔬"
};

module.exports = async function scienceHandler(interaction) {
  const kd = await getKingdomInfo();
  const type = interaction.options.getString("type") || "all";
  const rows = await wikiService.searchScience(type);

  if (!rows || rows.length === 0) {
    return interaction.reply({
      content: `🔬 No current-age Spartan science rules found for **${type}**. This command reads canonical Spartan rules tables, not legacy Age 116 tables.`,
      ephemeral: true
    });
  }

  const grouped = {};
  for (const row of rows) {
    const category = String(row.category || "science").toLowerCase();
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(row);
  }

  const age = rows.find(row => row.age_number != null)?.age_number;
  const embed = new EmbedBuilder()
    .setTitle(`🔬 Spartan Science Reference${age != null ? ` — Age ${age}` : ""}`)
    .setColor(0x6366f1);
  if (kd?.footer) embed.setFooter({ text: kd.footer });

  for (const [category, sciences] of Object.entries(grouped)) {
    const emoji = CATEGORY_EMOJI[category] || "📊";
    const label = category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const lines = sciences.map(row => {
      let line = `**${row.science_name || row.rule_name}** — ${row.effect ?? row.value ?? "No value recorded"}`;
      if (row.notes) line += `\n  └ ${row.notes}`;
      return line;
    });
    embed.addFields({ name: `${emoji} ${label}`, value: lines.join("\n").slice(0, 1024), inline: false });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
};
