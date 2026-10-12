const axios = require("axios");
const { PDFParse } = require("pdf-parse");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config/config");
const permissionService = require("./permissionService");
const logger = require("./logger");
const { saveAgeUpdate } = require("./ageUpdateService");

const MAX_FILE_BYTES = 15 * 1024 * 1024;

module.exports = async function ageUpdateMessageHandler(message) {
  if (!config.ageUpdateChannelId || message.channel?.id !== config.ageUpdateChannelId) return false;
  if (message.author?.bot) return true;

  if (!permissionService.isAdmin(message.author.id)) {
    await message.reply("⛔ Age updates can only be submitted by a Spartan administrator.");
    return true;
  }

  const attachment = message.attachments?.first();
  if (!attachment) {
    await message.reply("📘 Attach the Age update as a **PDF or TXT** file. Name it like `Age_117_changes.pdf` or `Age_117_changes.txt`.");
    return true;
  }

  const filename = String(attachment.name || "");
  if (!/\.pdf$/i.test(filename) && !/\.txt$/i.test(filename)) {
    await message.reply("⚠️ Only PDF and TXT age-update files are supported.");
    return true;
  }
  if (attachment.size && attachment.size > MAX_FILE_BYTES) {
    await message.reply("⚠️ That file is over the 15 MB limit. Please upload a smaller PDF or TXT file.");
    return true;
  }

  let parser;
  try {
    const response = await axios.get(attachment.url, {
      responseType: "arraybuffer",
      timeout: 20000,
      maxContentLength: MAX_FILE_BYTES,
      maxBodyLength: MAX_FILE_BYTES
    });
    const buffer = Buffer.from(response.data);
    let extractedText = "";

    if (buffer.subarray(0, 4).toString("ascii") === "%PDF") {
      parser = new PDFParse({ data: buffer });
      const parsedPdf = await parser.getText();
      extractedText = parsedPdf?.text || "";
    } else {
      extractedText = buffer.toString("utf8");
    }

    const updateText = [message.content || "", extractedText].filter(Boolean).join("\n").trim();
    if (!updateText) {
      await message.reply("⚠️ I couldn't extract any text from that file. If it's a scanned PDF, upload a text-based PDF or TXT version.");
      return true;
    }

    const savedUpdate = await saveAgeUpdate(updateText, message.author.id, filename);
    if (!savedUpdate) {
      await message.reply("⚠️ I couldn't save the age update. Check the bot's Supabase connection and logs.");
      return true;
    }
    if (savedUpdate.error === "no_age_number") {
      await message.reply("⚠️ I couldn't detect the age number from the filename. Use a name like `Age_117_changes.pdf`.");
      return true;
    }
    if (savedUpdate.error === "duplicate") {
      await message.reply(`⚠️ An Age ${filename.match(/Age[_\s-]?(\d+)/i)?.[1] || "update"} record already exists and is **${savedUpdate.status}**. No duplicate was created.`);
      return true;
    }

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`age_apply_${savedUpdate.id}`).setLabel("✅ Apply").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`age_revoke_${savedUpdate.id}`).setLabel("❌ Reject").setStyle(ButtonStyle.Danger)
    );
    await message.reply({
      content: [
        `📘 **Age ${savedUpdate.age_number} Update — Pending Review**`,
        "",
        savedUpdate.parsedSummary || "No structured changes were detected.",
        "",
        "This upload is staged for review. Apply is blocked unless the parser finds a sufficiently complete ruleset; proposed-change documents should not replace the active rules."
      ].join("\n"),
      components: [buttons]
    });
    logger.info(`[AGE UPDATE INTAKE] id=${savedUpdate.id} age=${savedUpdate.age_number} submitted_by=${message.author.id}`);
  } catch (error) {
    logger.error(`[AGE UPDATE INTAKE ERROR] ${error.stack || error.message}`);
    await message.reply("⚠️ I couldn't read or stage that age-update file. Check that it is a valid PDF/TXT file and try again.");
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch {}
    }
  }
  return true;
};
