const axios = require("axios");
const { PDFParse } = require("pdf-parse");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const config = require("../config/config");
const permissionService = require("./permissionService");
const logger = require("./logger");
const { saveAgeUpdate } = require("./ageUpdateService");
const { extractPdfTableText } = require("../parsers/pdfTableText");
const { buildDetailedAgeChangeReport } = require("./ageChangeReport");

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_CHANNEL_REPORT_PAGES = 4;

function extractAge(text) {
  const match = String(text || "").match(/\bage\s*[-_:]?\s*(\d{2,3})\b/i);
  return match ? match[1] : null;
}

function splitReportPages(report, maxLength = 3500) {
  const pages = [];
  let page = "";
  for (const line of String(report || "").split(/\r?\n/)) {
    const next = page ? page + "\n" + line : line;
    if (next.length > maxLength && page) {
      pages.push(page);
      page = line;
    } else {
      page = next;
    }
  }
  if (page) pages.push(page);
  return pages.length ? pages : ["No detailed parser report was generated."];
}

async function sendReportPages(message, report, ageNumber, recordId) {
  const allPages = splitReportPages(report);
  const pages = allPages.slice(0, MAX_CHANNEL_REPORT_PAGES);
  for (let index = 0; index < pages.length; index++) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("📘 Age " + ageNumber + " — Full Parser Report (" + (index + 1) + "/" + allPages.length + ")")
      .setDescription(pages[index])
      .setFooter({ text: "Review record #" + recordId + " • Full report is in the attached .txt; nothing is applied by viewing it." });
    await message.channel.send({ embeds: [embed] });
  }
  if (allPages.length > pages.length) {
    await message.channel.send("📎 " + (allPages.length - pages.length) + " more report page(s) are not repeated here. Everything is in the attached full-review .txt file.");
  }
}

function validationBlockers(summary) {
  const text = String(summary || "");
  const marker = text.lastIndexOf("\nBLOCKED:");
  if (marker < 0) return [];
  return text.slice(marker + "\nBLOCKED:".length).split(/\r?\n/)
    .map(line => line.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}

function buildDecisionEmbed(ageNumber, recordId, ready, summary) {
  const blockers = validationBlockers(summary);
  const embed = new EmbedBuilder()
    .setColor(ready ? 0x2ECC71 : 0xD64545)
    .setTitle("🔘 Age " + ageNumber + " — Review Controls")
    .setDescription(ready
      ? "The report is complete. Choose **Apply Changes** only after reviewing it. Server-side validation runs again before any active rules are changed."
      : "🛑 **Apply is disabled because validation failed.** Active rules and saved builds have not been changed. Upload a corrected file to refresh this pending review, or choose Cancel Review.")
    .addFields(
      { name: "Review record", value: "#" + recordId, inline: true },
      { name: "Preflight", value: ready ? "Passed; server rechecks on Apply" : "BLOCKED", inline: true }
    )
    .setFooter({ text: "These controls are intentionally placed after the complete report." });
  if (!ready && blockers.length) {
    const detail = blockers.join("\n").slice(0, 1000);
    embed.addFields({ name: "Why Apply is blocked", value: detail || "See the report for validation details.", inline: false });
  }
  return embed;
}

async function sendReviewSequence(message, { review, files, fullReport, ageNumber, recordId, decision, buttons }) {
  // Post in a predictable order, but never let a report-page failure suppress Apply/Cancel controls.
  await message.reply({ embeds: [review], files });
  try {
    await sendReportPages(message, fullReport, ageNumber, recordId);
  } catch (error) {
    logger.warn("[AGE UPDATE] report page failed to send: " + error.message);
  }
  return message.reply({ embeds: [decision], components: [buttons] });
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
          // Do not treat a header-shaped line as proof that a PDF table was reconstructed.
          // Sparse tab separators can shift values into the wrong columns; use this path only
          // when pdf-parse's structural table detector actually returned table objects.
          if (layout.detectedTables > 0) extractedText = layout.text;
          else logger.warn("[AGE UPDATE] No structural PDF tables detected; using full text extraction to preserve all source sections.");
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
        const summary = String(savedUpdate.parsedSummary || "").trim();
        const fullReport = buildDetailedAgeChangeReport(updateText, ageNumber, summary);
        const preview = summary.length > 2600 ? summary.slice(0, 2600) + "\n…The complete report is shown in the following messages and attached as a text file." : summary;
        const ready = Boolean(savedUpdate.parsedReady);
        const review = new EmbedBuilder().setColor(ready ? 0xD6A84F : 0xD64545)
          .setTitle("📘 Age " + ageNumber + " — Existing Pending Review")
          .setDescription(["**Record:** #" + savedUpdate.existingId,
            "**Status:** Pending review — nothing has been applied.", "", "**Parser summary**",
            preview || "🛑 **No structured rules detected. Do not apply this upload.**"].join("\n"))
          .addFields({ name: "Apply readiness", value: ready ? "Preflight passed; Apply revalidates server-side" : "BLOCKED — Apply disabled; see controls after report", inline: false })
          .setFooter({ text: "This is the already-staged upload; no duplicate was created." });
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("age_apply_" + savedUpdate.existingId).setLabel("✅ Review / Apply").setStyle(ButtonStyle.Success).setDisabled(!ready),
          new ButtonBuilder().setCustomId("age_revoke_" + savedUpdate.existingId).setLabel("❌ Cancel Review").setStyle(ButtonStyle.Danger));
        const files = fullReport ? [new AttachmentBuilder(Buffer.from(fullReport, "utf8"), { name: "age-" + ageNumber + "-full-review-" + savedUpdate.existingId + ".txt" })] : [];
        const decision = buildDecisionEmbed(ageNumber, savedUpdate.existingId, ready, summary);
        await sendReviewSequence(message, {
          review, files, fullReport, ageNumber, recordId: savedUpdate.existingId, decision, buttons
        });
      } else await message.reply("⚠️ An Age " + ageNumber + " record already exists and is **" + savedUpdate.status + "**. No duplicate was created.");
      return true;
    }

    const summary = String(savedUpdate.parsedSummary || "").trim();
    const fullReport = buildDetailedAgeChangeReport(updateText, savedUpdate.age_number, summary);
    const preview = summary.length > 2600 ? summary.slice(0, 2600) + "\n…The complete report is shown in the following messages and attached as a text file." : summary;
    const ready = Boolean(savedUpdate.parsedReady);
    const review = new EmbedBuilder().setColor(ready ? 0xD6A84F : 0xD64545)
      .setTitle("📘 Age " + savedUpdate.age_number + " — Review Proposed Changes")
      .setDescription(["**Status:** Pending review — nothing has been applied.", "",
        "**Parser summary**", preview || "🛑 **No structured rules detected. Do not apply this upload.**",
        "", "**Before you apply**",
        "• Check detected sections and counts.",
        "• Omitted rules must be inherited from a verified previous-age baseline.",
        "• Failed validation must leave active rules and saved builds unchanged."].join("\n"))
      .addFields(
        { name: "Target age", value: String(savedUpdate.age_number), inline: true },
        { name: "Review record", value: "#" + savedUpdate.id, inline: true },
        { name: "Apply readiness", value: ready ? "Preflight passed; Apply revalidates server-side" : "BLOCKED — Apply disabled; see controls after report", inline: false })
      .setFooter({ text: "Review the summary before choosing Apply or Cancel Review." });
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("age_apply_" + savedUpdate.id).setLabel("✅ Apply Changes").setStyle(ButtonStyle.Success).setDisabled(!ready),
      new ButtonBuilder().setCustomId("age_revoke_" + savedUpdate.id).setLabel("❌ Cancel Review").setStyle(ButtonStyle.Danger));
    const files = fullReport ? [new AttachmentBuilder(Buffer.from(fullReport, "utf8"), { name: "age-" + savedUpdate.age_number + "-full-review-" + savedUpdate.id + ".txt" })] : [];
    const decision = buildDecisionEmbed(savedUpdate.age_number, savedUpdate.id, ready, summary);
    await sendReviewSequence(message, {
      review, files, fullReport, ageNumber: savedUpdate.age_number, recordId: savedUpdate.id, decision, buttons
    });
    logger.info("[AGE UPDATE INTAKE] id=" + savedUpdate.id + " age=" + savedUpdate.age_number + " submitted_by=" + message.author.id);
  } catch (error) {
    logger.error("[AGE UPDATE INTAKE ERROR] " + (error.stack || error.message));
    await message.reply("⚠️ I couldn't read or stage that age-update file. Check that it is a valid PDF/TXT/HTML file and try again.");
  } finally {
    if (parser) { try { await parser.destroy(); } catch {} }
  }
  return true;
};

module.exports.sendReviewSequence = sendReviewSequence;
module.exports.buildDecisionEmbed = buildDecisionEmbed;
