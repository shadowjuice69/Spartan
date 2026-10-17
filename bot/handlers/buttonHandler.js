const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { approveAgeUpdate, denyAgeUpdate } = require("../services/ageUpdateService");
const permissionService = require("../services/permissionService");
const { wikiStatusLine } = require("../services/wikiAgeGenerator");

function blockedAgeReviewControls(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("age_apply_" + id)
      .setLabel("Apply blocked — validation failed")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("age_revoke_" + id)
      .setLabel("❌ Cancel Review")
      .setStyle(ButtonStyle.Danger)
  );
}

module.exports = async function buttonHandler(interaction) {
  console.log(`Button pressed: ${interaction.customId}`);

  if (interaction.customId === "continue_registration") {
    const modal = new ModalBuilder()
      .setCustomId("utopia_register_2")
      .setTitle("Register — Step 2 of 2");

    const timezone = new TextInputBuilder()
      .setCustomId("timezone")
      .setLabel("Timezone (e.g. UTC-5, EST, GMT+2)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const waveTimes = new TextInputBuilder()
      .setCustomId("wave_times")
      .setLabel("Best Wave Times (e.g. 8pm-12am)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(timezone),
      new ActionRowBuilder().addComponents(waveTimes)
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId.startsWith("age_apply_")) {
    if (!permissionService.isAdmin(interaction.user.id)) {
      return interaction.reply({ content: "⛔ Only Spartan administrators can apply an age update.", ephemeral: true });
    }
    const id = interaction.customId.replace("age_apply_", "");

    if (!id || id === "undefined") {
      return interaction.reply({
        content: "⚠️ This approval button is expired. Upload the age update again.",
        ephemeral: true
      });
    }

    await interaction.deferUpdate();
    // Remove the buttons while applying so a second click cannot start a second run.
    await interaction.editReply({ components: [] }).catch(() => {});

    const result = await approveAgeUpdate(id, interaction.user.id);

    if (result && result.alreadyHandled) {
      return interaction.followUp({ content: "ℹ️ Age update #" + id + " was already " + result.status + ". Nothing was changed.", flags: 64 });
    }

    if (!result) {
      return interaction.editReply({
        content: "⚠️ The age update could not be processed. The submission remains pending unless the server reports otherwise. Check Render logs, or upload a corrected file to refresh this review.",
        components: [blockedAgeReviewControls(id)]
      });
    }

    if (result.blocked) {
      return interaction.editReply({
        content: [
          `🛑 **Age ${result.age_number} was NOT applied**`,
          "",
          result.reason,
          "",
          "The active age and saved builds were left unchanged. This submission is still pending. Upload a corrected file to refresh the same pending review, or use Cancel Review below."
        ].join("\n"),
        components: [blockedAgeReviewControls(id)]
      });
    }

    const buildRefresh = result.stats.recalculation || { total: 0, updated: 0, unchanged: 0, failed: [] };

    await interaction.editReply({
      content: [
        `✅ **Age ${result.age_number} Applied** by ${interaction.user}`,
        ``,
        result.stats.summary,
        ``,
        `📊 **Rows written:** ${result.stats.races} race rules • ${result.stats.personalities} personality rules • ${result.stats.gameRows} game rules`,
        `🧠 **Build Library:** ${buildRefresh.updated} changed • ${buildRefresh.unchanged} validated • ${buildRefresh.failed.length} failed of ${buildRefresh.total}`,
        wikiStatusLine(result.stats.wiki, result.age_number),
        buildRefresh.failed.length ? `⚠️ Failed builds: ${buildRefresh.failed.map((b) => b.name).slice(0, 10).join(", ")}` : `✅ All active saved builds were processed for the new Age.`
      ].join("\n"),
      components: []
    });

    const supabaseService = require("../services/supabase");
    const supabase = supabaseService.getClient();
    if (supabase) {
      const { data: setting } = await supabase
        .from("bot_settings")
        .select("value")
        .eq("key", "alert_channel")
        .limit(1);

      const channelId = setting?.[0]?.value;
      if (channelId) {
        const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.send([
            `📘 **Age ${result.age_number} Rules Now Active**`,
            ``,
            result.stats.summary,
            ``,
            `🧠 Build Library recalculated: ${buildRefresh.updated} changed • ${buildRefresh.unchanged} validated • ${buildRefresh.failed.length} failed`,
            `Applied by ${interaction.user}`,
            wikiStatusLine(result.stats.wiki, result.age_number)
          ].join("\n"));
        }
      }
    }

    return;
  }

  if (interaction.customId.startsWith("age_revoke_")) {
    if (!permissionService.isAdmin(interaction.user.id)) {
      return interaction.reply({ content: "⛔ Only Spartan administrators can reject an age update.", ephemeral: true });
    }
    const id = interaction.customId.replace("age_revoke_", "");

    const result = await denyAgeUpdate(id, interaction.user.id);

    if (!result) {
      return interaction.reply({
        content: "⚠️ Failed to revoke age update.",
        ephemeral: true
      });
    }

    return interaction.update({
      content: `❌ Age Update #${id} Revoked by ${interaction.user}`,
      components: []
    });
  }
};
