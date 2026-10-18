const wikiService = require("../../services/wikiService");

module.exports = async function wikiHandler(interaction) {
  await interaction.reply({
    content:
      `📖 **Spartan Utopia Wiki**\n${wikiService.getWikiLink()}`,
    ephemeral: true,
  });
};
