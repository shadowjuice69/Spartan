module.exports = async function ambushHandler(interaction) {
  const targetName = interaction.options.getString("target");
  const who = targetName ? ` for **${targetName}**` : "";
  return interaction.reply({
    content: `🚧 **/spartan-war ambush** isn't built yet${who}. Ambush numbers come from the game's Armies/War Room tab, and no current scraper page captures or parses that — the old \`intel_throne.ambush\` column this used to read no longer exists, and nothing replaced it. Needs a dedicated Armies-tab capture + parser before this can show real numbers instead of a guess.`,
    ephemeral: true,
  });
};
