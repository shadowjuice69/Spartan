const supabaseService = require("../../services/supabase");

module.exports = async function alertsHandler(interaction) {
  const supabase = supabaseService.getClient();
  if (!supabase) return interaction.reply({ content: "❌ Database not connected.", ephemeral: true });

  const action = interaction.options.getString("action") || "list";

  if (action === "set") {
    const label = interaction.options.getString("label");
    const ticksRaw = interaction.options.getString("ticks");
    const message = interaction.options.getString("message");
    if (!label || !ticksRaw || !message) return interaction.reply({ content: "❌ `label`, `ticks`, and `message` are required to set an alert.", ephemeral: true });
    const channelId = interaction.options.getChannel("channel")?.id || interaction.channelId;
    const pingRole = interaction.options.getRole("role")?.id || null;
    const ticks = ticksRaw.split(",").map(t => parseInt(t.trim())).filter(t => !isNaN(t) && t >= 1 && t <= 24);
    if (!ticks.length) return interaction.reply({ content: "❌ Invalid ticks. Use comma-separated numbers 1-24.", ephemeral: true });

    const { error } = await supabase.from("alerts").insert({
      guild_id: interaction.guildId, channel_id: channelId, label, ticks, message,
      ping_role: pingRole, created_by: interaction.user.id, active: true,
    });
    if (error) return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    return interaction.reply({
      content: `✅ Alert **${label}** set for tick(s) **${ticks.join(", ")}**\n📢 Channel: <#${channelId}>${pingRole ? `\n🔔 Ping: <@&${pingRole}>` : ""}`,
      ephemeral: true,
    });
  }

  if (action === "delete") {
    const label = interaction.options.getString("label");
    if (!label) return interaction.reply({ content: "❌ `label` is required to delete an alert.", ephemeral: true });
    const { error } = await supabase.from("alerts").delete().eq("guild_id", interaction.guildId).eq("label", label);
    if (error) return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    return interaction.reply({ content: `✅ Alert **${label}** deleted.`, ephemeral: true });
  }

  const { data, error } = await supabase.from("alerts").select("*").eq("guild_id", interaction.guildId);
  if (error) return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
  if (!data?.length) return interaction.reply({ content: "🔔 No alerts configured for this server yet. Use `action:set` to add one.", ephemeral: true });
  const lines = data.map(a => `• **${a.label}** — tick(s) ${Array.isArray(a.ticks) ? a.ticks.join(", ") : a.ticks} → <#${a.channel_id}>${a.ping_role ? ` (pings <@&${a.ping_role}>)` : ""}${a.active === false ? " _(inactive)_" : ""}`);
  return interaction.reply({ content: `🔔 **Alerts**\n\n${lines.join("\n")}`, ephemeral: true });
};
