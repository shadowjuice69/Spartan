const supabaseService = require("./supabase");
const logger = require("./logger");
const { buildReview, toRows } = require("./ageRuleMerge");
const { recalculateBuildLibrary } = require("./buildAgeRecalculator");

// One active path for every supported upload: generic extraction -> parse -> baseline merge -> validate.
// Approval always repeats the review; the intake preview is never trusted as authorization to apply.
async function saveAgeUpdate(updateText, userId, filename) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  updateText = String(updateText).replace(/\u0000/g, "");
  try {
    const match = String(filename || "").match(/Age[_\s-]?(\d+)/i);
    const ageNumber = match ? parseInt(match[1], 10) : null;
    if (!ageNumber) {
      logger.info("[AGE UPDATE] Rejected - no age number in filename: " + filename);
      return { error: "no_age_number" };
    }

    const { data: existing, error: existingError } = await supabase
      .from("age_updates")
      .select("id,status,raw_text")
      .eq("age_number", ageNumber)
      .eq("status", "pending")
      .order("id", { ascending: false })
      .limit(1);
    if (existingError) throw existingError;

    const review = await buildReview(supabase, updateText, ageNumber);
    const parsedSummary = review.summary;
    const parsedReady = review.ready;

    if (existing?.length) {
      const pending = existing[0];
      if (String(pending.raw_text || "") === updateText) {
        return { error: "duplicate", existingId: pending.id, status: pending.status, parsedSummary, parsedReady };
      }
      const updated = await supabase.from("age_updates")
        .update({ raw_text: updateText, source: "discord", submitted_by: userId })
        .eq("id", pending.id).eq("status", "pending").select().single();
      if (updated.error) throw updated.error;
      logger.info("[AGE UPDATE REFRESHED] ID " + updated.data.id + " AGE " + ageNumber);
      return { ...updated.data, parsedSummary, parsedReady, refreshed: true };
    }

    const { data, error } = await supabase.from("age_updates").insert({
      age_number: ageNumber, raw_text: updateText, source: "discord",
      submitted_by: userId, status: "pending"
    }).select().single();
    if (error) throw error;
    logger.info("[AGE UPDATE SAVED] ID " + data.id + " AGE " + ageNumber +
      " baseline=" + review.baseline.source + (review.baseline.age ? ":" + review.baseline.age : ""));
    return { ...data, parsedSummary, parsedReady };
  } catch (err) {
    logger.error("[AGE UPDATE ERROR] " + (err.stack || err.message));
    return null;
  }
}

async function approveAgeUpdate(id, adminId) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;

  try {
    const { data: update, error: fetchError } = await supabase.from("age_updates")
      .select("*").eq("id", id).eq("status", "pending").maybeSingle();
    if (fetchError) throw fetchError;
    if (!update) {
      const { data: current } = await supabase.from("age_updates")
        .select("id,age_number,status").eq("id", id).maybeSingle();
      if (current && current.status !== "pending") {
        logger.info("[AGE APPROVE] ID " + id + " is already " + current.status + "; ignoring repeat click");
        return { alreadyHandled: true, status: current.status, age_number: current.age_number };
      }
      throw new Error("Age update " + id + " was not found");
    }

    const ageNumber = Number(update.age_number);
    const review = await buildReview(supabase, update.raw_text, ageNumber);
    if (!review.ready) {
      const reason = "Validation failed (" + review.issues.length + "): " +
        review.issues.slice(0, 10).join("; ") + ". Nothing was applied.";
      logger.warn("[AGE APPROVE BLOCKED] ID " + id + " AGE " + ageNumber + ": " + reason);
      return { blocked: true, age_number: ageNumber, reason, stats: {
        races: Object.keys(review.merged.races || {}).length,
        personalities: Object.keys(review.merged.personalities || {}).length, gameRows: 0
      } };
    }

    const rows = toRows(ageNumber, review.merged);
    if (!rows.races.length || !rows.personalities.length || !rows.game.length) {
      throw new Error("Refusing to apply an age update with an empty rules section.");
    }

    const { error: atomicApplyError } = await supabase.rpc("spartan_apply_age_update_atomic", {
      p_age_number: ageNumber, p_update_id: id, p_admin_id: String(adminId),
      p_race_rows: rows.races, p_personality_rows: rows.personalities, p_game_rows: rows.game
    });
    if (atomicApplyError) throw atomicApplyError;

    const { data, error } = await supabase.from("age_updates")
      .select("*").eq("id", id).eq("status", "approved").single();
    if (error) throw error;

    let recalculation = null;
    try {
      recalculation = await recalculateBuildLibrary(ageNumber, id, review.merged);
    } catch (err) {
      logger.error("[AGE BUILD RECALC ERROR] " + err.message);
      recalculation = { error: err.message };
    }
    let wiki = null;
    try {
      const wikiService = require("./spartanWikiService");
      wiki = await wikiService.updateWikiForAge(ageNumber);
      if (wiki?.ok) {
        try {
          wiki.githubSync = await wikiService.syncApprovedWikiToGitHub(ageNumber);
        } catch (syncError) {
          logger.error("[AGE WIKI GITHUB SYNC ERROR] " + (syncError.stack || syncError.message));
          wiki.githubSync = { ok: false, error: "github_sync_failed" };
        }
      }
    } catch (err) {
      logger.error("[AGE WIKI UPDATE ERROR] " + (err.stack || err.message));
      wiki = { ok: false, error: err.message || "wiki_update_failed" };
    }
    logger.info("[AGE UPDATE APPROVED] ID " + id + " AGE " + ageNumber +
      "; races=" + rows.races.length + ", personalities=" + rows.personalities.length +
      ", game_rules=" + rows.game.length);
    return { ...data, stats: {
      races: rows.races.length, personalities: rows.personalities.length, gameRows: rows.game.length,
      summary: review.summary.split("\n").slice(0, 4).join("\n"), recalculation, wiki
    }, parsed: review.merged };
  } catch (err) {
    logger.error("[AGE APPROVE ERROR] " + (err.stack || err.message));
    return null;
  }
}

async function denyAgeUpdate(id, adminId) {
  const supabase = supabaseService.getClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("age_updates")
      .update({ status: "rejected", approved_by: adminId, approved_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending").select().single();
    if (error) throw error;
    logger.info("[AGE UPDATE REJECTED] ID " + id + " BY " + adminId);
    return data;
  } catch (err) {
    logger.error("[AGE DENY ERROR] " + err.message);
    return null;
  }
}

module.exports = { saveAgeUpdate, approveAgeUpdate, denyAgeUpdate };
