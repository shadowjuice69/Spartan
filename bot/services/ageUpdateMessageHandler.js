const axios = require("axios");
const { PDFParse } = require("pdf-parse");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const config = require("../config/config");
const permissionService = require("./permissionService");
const logger = require("./logger");
const { saveAgeUpdate } = require("./ageUpdateService");

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function extractAge(text) {
  const match = String(text || "").match(/\bage\s*[-_:]?\s*(\d{2,3})\b/i);
  return match ? match[1] : null;
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section|article)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

module.exports = async function ageUpdateMessageHandler(message) {
  if (!config.ageUpdateChannelId || message.channel?.id !== config.ageUpdateChannelId) return false;
  if (message.author?.bot) return true;

  if (!permissionService.isAdmin(message.author.id)) {
    await message.reply("⛔ Age updates can only be submitted by a Spartan administrator.");
    return true;
  }

  const attachment = message.attachments?.first();
  let filename = String(attachment?.name || "");
  let extractedText = "";
  let parser;

  try {
    if (attachment) {
      if (!/\.(pdf|txt|html?)$/i.test(filename)) {
        await message.reply("⚠️ Only PDF, TXT, and HTML age-update files are supported.");
        return true;
      }
      if (attachment.size && attachment.size > MAX_FILE_BYTES) {
        await message.reply("⚠️ That file is over the 15 MB limit. Please upload a smaller file.");
        return true;
      }

      const response = await axios.get(attachment.url, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: MAX_FILE_BYTES,
        maxBodyLength: MAX_FILE_BYTES
      });
      const buffer = Buffer.from(response.data);

      if (/\.pdf$/i.test(filename) || buffer.subarray(0, 4).toString("ascii") === "%PDF") {
        if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
          await message.reply("⚠️ The attachment is named as a PDF but doesn't contain a valid PDF header.");
          return true;
        }
        parser = new PDFParse({ data: buffer });
        const parsedPdf = await parser.getText();
        extractedText = parsedPdf?.text || "";
      } else {
        extractedText = buffer.toString("utf8");
        if (/\.html?$/i.test(filename)) extractedText = htmlToText(extractedText);
      }
    }

    const updateText = [message.content || "", extractedText].filter(Boolean).join("\n").trim();
    if (!updateText) {
      await message.reply("📘 Send the Age update as a PDF/TXT/HTML attachment or paste its text in this channel.");
      return true;
    }

    const ageNumber = extractAge(filename) || extractAge(updateText);
    if (!ageNumber) {
      await message.reply("⚠️ I couldn't detect the age number. Include a heading such as Age 117 - Proposed Changes or name the file Age_117_changes.pdf.");
      return true;
    }

    // ageUpdateService derives the age from the filename; normalize pasted text and filenames without an age.
    if (!extractAge(filename)) filename = "Age_" + ageNumber + "_changes" + (/\.pdf$/i.test(filename) ? ".pdf" : ".txt");

    const savedUpdate = await saveAgeUpdate(updateText, message.author.id, filename);
    if (!savedUpdate) {
      await message.reply("⚠️ I couldn't save the age update. Check the bot's Supabase connection and logs.");
      return true;
    }
    if (savedUpdate.error === "no_age_number") {
      await message.reply("⚠️ I couldn't detect the age number. Include it in the heading or filename and try again.");
      return true;
    }
    if (savedUpdate.error === "duplicate") {
      if (savedUpdate.status === "pending") {
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("age_apply_" + savedUpdate.existingId).setLabel("🔎 Review / Apply").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("age_revoke_" + savedUpdate.existingId).setLabel("❌ Cancel Review").setStyle(ButtonStyle.Danger)
        );
        await message.reply({
          content: "📘 **Age " + ageNumber + " — Existing Pending Review** (record #" + savedUpdate.existingId + "). I kept the staged record to avoid duplicates. The review controls refer to that saved upload; its parser summary is shown when available.",
          components: [buttons]
        });
      } else {
        await message.reply("⚠️ An Age " + ageNumber + " record already exists and is **" + savedUpdate.status + "**. No duplicate was created.");
      }
      return true;
    }

    const summary = String(savedUpdate.parsedSummary || "").trim();
    const ready = Boolean(summary);
    const review = new EmbedBuilder()
      .setColor(ready ? 0xD6A84F : 0xD64545)
      .setTitle("📘 Age " + savedUpdate.age_number + " — Review Proposed Changes")
      .setDescription([
        "**Status:** Pending review — nothing has been applied.",
        "",
        "**Parser summary**",
        summary || "🛑 **No structured rules detected. Do not apply this upload.** The PDF/text extraction or Age 117 parser needs repair first.",
        "",
        "**Before you apply**",
        "• Check the detected sections and counts above.",
        "• Proposed-change sheets can omit unchanged rules; unchanged entries must be merged from a verified baseline, not silently discarded.",
        "• Apply is only safe when validation passes. A failed validation must leave the current rules and saved builds unchanged."
      ].join("\n"))
      .addFields(
        { name: "Target age", value: String(savedUpdate.age_number), inline: true },
        { name: "Review record", value: "#" + savedUpdate.id, inline: true },
        { name: "Apply readiness", value: ready ? "Parser found structured entries; final validation still required" : "BLOCKED — empty parse", inline: false }
      )
      .setFooter({ text: "Review the summary before choosing Apply or Cancel Review." });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("age_apply_" + savedUpdate.id).setLabel("✅ Apply Changes").setStyle(ButtonStyle.Success).setDisabled(!ready),
      new ButtonBuilder().setCustomId("age_revoke_" + savedUpdate.id).setLabel("❌ Cancel Review").setStyle(ButtonStyle.Danger)
    );
    await message.reply({ embeds: [review], components: [buttons] });
    logger.info("[AGE UPDATE INTAKE] id=" + savedUpdate.id + " age=" + savedUpdate.age_number + " submitted_by=" + message.author.id);
  } catch (error) {
    logger.error("[AGE UPDATE INTAKE ERROR] " + (error.stack || error.message));
    await message.reply("⚠️ I couldn't read or stage that age-update file. Check that it is a valid PDF/TXT/HTML file and try again.");
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch {}
    }
  }
  return true;
};
