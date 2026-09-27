const database = require("../../services/database");
const permissionService = require("../../services/permissionService");
const auditService = require("../../services/auditService");
const roles = require("../../config/roles");
const { MessageFlags } = require("discord.js");

module.exports = async function adminsHandler(interaction) {
  const action = interaction.options.getString("action") || "list";

  if (action === "add" || action === "remove") {
    if (!permissionService.isOwner(interaction.user.id)) {
      return interaction.reply({ content: `❌ Only the owner can ${action} admins.`, flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser("user");
    if (!user) return interaction.reply({ content: "❌ Select a user.", flags: MessageFlags.Ephemeral });

    if (action === "add") {
      await permissionService.addAdmin(user.id);
      await auditService.log({ action: "ADD_ADMIN", actor: { id: interaction.user.id, username: interaction.user.username }, target: { id: user.id, username: user.username } });
      return interaction.reply({ content: `✅ ${user.username} is now an admin.`, flags: MessageFlags.Ephemeral });
    }

    if (user.id === roles.owner) return interaction.reply({ content: "❌ The owner cannot be removed.", flags: MessageFlags.Ephemeral });
    await permissionService.removeAdmin(user.id);
    await auditService.log({ action: "REMOVE_ADMIN", actor: { id: interaction.user.id, username: interaction.user.username }, target: { id: user.id, username: user.username } });
    return interaction.reply({ content: `✅ ${user.username} is no longer an admin.`, flags: MessageFlags.Ephemeral });
  }

  const db = database.getDb();
  const admins = db.get("admins").value() || [];
  if (!admins.length) return interaction.reply({ content: "👑 No admins configured yet.", flags: MessageFlags.Ephemeral });
  const lines = admins.map(id => `• <@${id}>`);
  return interaction.reply({ content: `👑 **Kingdom Admins**\n\n${lines.join("\n")}`, flags: MessageFlags.Ephemeral });
};
