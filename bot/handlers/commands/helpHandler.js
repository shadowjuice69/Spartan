const { EmbedBuilder } = require("discord.js");
const commandRegistry = require("../../services/commandRegistry");

function buildCommandFields() {
  const groups = new Map();

  for (const entry of commandRegistry.list()) {
    if (!groups.has(entry.command)) groups.set(entry.command, []);
    groups.get(entry.command).push(entry);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([command, entries]) => ({
      name: `/${command}`,
      value: entries
        .slice()
        .sort((a, b) => (a.subcommand || "").localeCompare(b.subcommand || ""))
        .map(entry => {
          const description = entry.description ? ` — ${entry.description}` : "";
          return `• ` + "`" + `/${command} ${entry.subcommand}` + "`" + `${description}`;
        })
        .join("\n"),
      inline: false
    }));
}

module.exports = async function helpHandler(interaction) {
  const fields = buildCommandFields();
  const embed = new EmbedBuilder()
    .setTitle("⚔️ Spartan Command Guide")
    .setColor(0x38bdf8)
    .setDescription("Available Spartan commands and what they do. Some commands require registered access or administrator permissions.")
    .addFields(...fields)
    .addFields({
      name: "🌐 War Room Dashboard & Intel Sync",
      value: "Use the Spartan dashboard and configured intel sync commands.",
      inline: false
    })
    .setTimestamp();

  // This handler uses only the in-memory command registry. It must not depend on
  // Supabase, kingdom settings, province details, or the current Age.
  return interaction.reply({ embeds: [embed], ephemeral: true });
};
