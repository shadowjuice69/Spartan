const axios = require("axios");
const { PDFParse } = require("pdf-parse");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const config = require("../config/config");
const permissionService = require("./permissionService");
const logger = require("./logger");
const { saveAgeUpdate } = require("./ageUpdateService");
const { buildDetailedAgeChangeReport } = require("./ageChangeReport");
const { extractPdfTableText } = require("../parsers/pdfTableText");

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function splitReportPages(text, maxChars = 3300) {
  const pages = [];
  let page = "";
  for (const line of String(text || "").split(/\r?\n/)) {
    const pieces = line.length > maxChars
      ? line.match(new RegExp(".{1," + maxChars + "}", "g")) || [line]
      : [line];
    for (const piece of pieces) {
      const next = page ? page + "\n" + piece : piece;
      if (next.length > maxChars && page) {
        pages.push(page);
        page = piece;
      } else page = next;
    }
  }
  if (page || !pages.length) pages.push(page || "No detailed report was generated.");
  return pages;
}

async function sendRemainingReportPages(channel, ageNumber, recordId, pages) {
  for (let index = 1; index < pages.length; index++) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("📘 Age " + ageNumber + " — Full Change Report (" + (index + 1) + "/" + pages.length + ")")
      .setDescription(pages[index]);
    await channel.send({ embeds: [embed] });
  }
}

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
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").trim();
}

module.exports = async function ageUpdateMessageHandler(message) {
  if (!config.ageUpdateChannelId || message.channel?.id !== config.ageUpdateChannelId) return false;
  if (message.author?.bot) return true;
  if (!permissionService.isAdmin(message.author.id)) {
    await message.reply("⛔ Age updates can only be submitted by a Spartan administrator.");
    return true;
  }

  const attachments = message.attachments;
  const attachment = attachments?.find((item) => /\.pdf$/i.test(String(item.name || ""))) || attachments?.first();
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
        responseType: "arraybuffer", timeout: 20000,
        maxContentLength: MAX_FILE_BYTES, maxBodyLength: MAX_FILE_BYTES
      });
      const buffer = Buffer.from(response.data);
      if (/\.pdf$/i.test(filename) || buffer.subarray(0, 4).toString("ascii") === "%PDF") {
        if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
          await message.reply("⚠️ The attachment is named as a PDF but doesn't contain a valid PDF header.");
          return true;
        }
        try {
          const layout = await extractPdfTableText(buffer);
          if (layout.tableCount > 0) extractedText = layout.text;
          else logger.warn("[AGE UPDATE] PDF had no detectable tables; falling back to plain text extraction.");
        } catch (layoutError) {
          logger.warn("[AGE UPDATE] PDF layout extraction failed: " + layoutError.message);
        }
        if (!extractedText) {
          parser = new PDFParse({ data: buffer });
          const parsedPdf = await parser.getText();
          extractedText = parsedPdf?.text || "";
        }
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
        const summary = buildDetailedAgeChangeReport(updateText, ageNumber, savedUpdate.parsedSummary);
        const summaryPages = splitReportPages(summary);
        const preview = summaryPages[0];
        const ready = Boolean(savedUpdate.parsedReady);
        const review = new EmbedBuilder().setColor(ready ? 0xD6A84F : 0xD64545)
          .setTitle("📘 Age " + ageNumber + " — Existing Pending Review (Page 1/" + summaryPages.length + ")")
          .setDescription(["**Record:** #" + savedUpdate.existingId,
            "**Status:** Pending review — nothing has been applied.", "", "**Parser summary**",
            preview || "🛑 **No structured rules detected. Do not apply this upload.**"].join("\n"))
          .addFields({ name: "Apply readiness", value: ready ? "Structured entries detected; final validation still required" : "BLOCKED — validation failed", inline: false })
          .setFooter({ text: "This is the already-staged upload; no duplicate was created." });
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("age_apply_" + savedUpdate.existingId).setLabel("✅ Review / Apply").setStyle(ButtonStyle.Success).setDisabled(!ready),
          new ButtonBuilder().setCustomId("age_revoke_" + savedUpdate.existingId).setLabel("❌ Cancel Review").setStyle(ButtonStyle.Danger));
        const files = summary ? [new AttachmentBuilder(Buffer.from(summary, "utf8"), { name: "age-" + ageNumber + "-review-" + savedUpdate.existingId + ".txt" })] : [];
        await message.reply({ embeds: [review], components: [buttons], files });
        await sendRemainingReportPages(message.channel, ageNumber, savedUpdate.existingId, summaryPages);
      } else await message.reply("⚠️ An Age " + ageNumber + " record already exists and is **" + savedUpdate.status + "**. No duplicate was created.");
      return true;
    }

    const summary = buildDetailedAgeChangeReport(updateText, ageNumber, savedUpdate.parsedSummary);
    const summaryPages = splitReportPages(summary);
    const preview = summaryPages[0];
    const ready = Boolean(savedUpdate.parsedReady);
    const review = new EmbedBuilder().setColor(ready ? 0xD6A84F : 0xD64545)
      .setTitle("📘 Age " + savedUpdate.age_number + " — Review Proposed Changes (Page 1/" + summaryPages.length + ")")
      .setDescription(["**Status:** Pending review — nothing has been applied.", "",
        "**Parser summary**", preview || "🛑 **No structured rules detected. Do not apply this upload.**",
        "", "**Before you apply**",
        "• Check detected sections and counts.",
        "• Omitted rules must be inherited from a verified previous-age baseline.",
        "• Failed validation must leave active rules and saved builds unchanged."].join("\n"))
      .addFields(
        { name: "Target age", value: String(savedUpdate.age_number), inline: true },
        { name: "Review record", value: "#" + savedUpdate.id, inline: true },
        { name: "Apply readiness", value: ready ? "Structured entries detected; final validation still required" : "BLOCKED — validation failed", inline: false })
      .setFooter({ text: "Review the summary before choosing Apply or Cancel Review." });
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("age_apply_" + savedUpdate.id).setLabel("✅ Apply Changes").setStyle(ButtonStyle.Success).setDisabled(!ready),
      new ButtonBuilder().setCustomId("age_revoke_" + savedUpdate.id).setLabel("❌ Cancel Review").setStyle(ButtonStyle.Danger));
    const files = summary ? [new AttachmentBuilder(Buffer.from(summary, "utf8"), { name: "age-" + savedUpdate.age_number + "-review-" + savedUpdate.id + ".txt" })] : [];
    await message.reply({ embeds: [review], components: [buttons], files });
    await sendRemainingReportPages(message.channel, savedUpdate.age_number, savedUpdate.id, summaryPages);
    logger.info("[AGE UPDATE INTAKE] id=" + savedUpdate.id + " age=" + savedUpdate.age_number + " submitted_by=" + message.author.id);
  } catch (error) {
    logger.error("[AGE UPDATE INTAKE ERROR] " + (error.stack || error.message));
    await message.reply("⚠️ I couldn't read or stage that age-update file. Check that it is a valid PDF/TXT/HTML file and try again.");
  } finally {
    if (parser) { try { await parser.destroy(); } catch {} }
  }
  return true;
};
