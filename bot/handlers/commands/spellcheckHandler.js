const { EmbedBuilder } = require("discord.js");
const { getKingdomInfo } = require("../../services/kingdomService");
const supabaseService = require("../../services/supabase");

function parseWpaModifiers(text) {
  const match = String(text || "").match(/([+−-])\s*(\d+(?:\.\d+)?)\s*%\s*(offensive\s+)?(?:wizards?\s+per\s+acre|wpa)/i);
  if (!match) return { off: 1, def: 1 };
  const amount = Number(match[2]) / 100;
  const multiplier = match[1] === "-" || match[1] === "−" ? 1 - amount : 1 + amount;
  return match[3]
    ? { off: multiplier, def: 1 }
    : { off: multiplier, def: multiplier };
}

async function loadCurrentAgeModifiers() {
  const neutral = { off: 1, def: 1 };
  const fallback = { age: null, races: {}, personalities: {} };
  const supabase = supabaseService.getClient();
  if (!supabase) return fallback;

  try {
    const [raceResult, personalityResult] = await Promise.all([
      supabase.from("spartan_race_rules").select("age_number,race,bonuses,penalties"),
      supabase.from("spartan_personality_rules").select("age_number,personality,bonuses")
    ]);
    if (raceResult.error || personalityResult.error) {
      throw raceResult.error || personalityResult.error;
    }

    const allRows = [...(raceResult.data || []), ...(personalityResult.data || [])];
    const ages = allRows.map(row => Number(row.age_number)).filter(Number.isFinite);
    if (!ages.length) return fallback;
    const age = Math.max(...ages);
    const races = {};
    const personalities = {};

    for (const row of raceResult.data || []) {
      if (Number(row.age_number) !== age) continue;
      const name = String(row.race || "").toLowerCase().replace(/[^a-z]/g, "");
      if (!name) continue;
      races[name] = {
        ...parseWpaModifiers([row.bonuses, row.penalties].filter(Boolean).join(" ")),
        name: row.race
      };
    }
    for (const row of personalityResult.data || []) {
      if (Number(row.age_number) !== age) continue;
      const name = String(row.personality || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z]/g, "");
      if (!name) continue;
      personalities[name] = {
        ...parseWpaModifiers(row.bonuses),
        name: row.personality
      };
    }
    races.darkelf ||= { ...neutral, name: "Dark Elf" };
    races.darkelf.name = "Dark Elf";
    races.darkelf.off ??= 1;
    races.darkelf.def ??= 1;
    personalities.none = { ...neutral, name: "None" };
    return { age, races, personalities };
  } catch (error) {
    console.error("[SPARTAN SPELLCHECK] Could not load current-age WPA rules:", error.message);
    return fallback;
  }
}

const SPELL_DIFFICULTY = {
  fireball:      { tier: "standard", mult: 2.0, name: "Fireball" },
  storms:        { tier: "standard", mult: 2.0, name: "Storms" },
  droughts:      { tier: "standard", mult: 2.0, name: "Droughts" },
  gluttony:      { tier: "standard", mult: 2.0, name: "Gluttony" },
  greed:         { tier: "standard", mult: 2.0, name: "Greed" },
  chastity:      { tier: "standard", mult: 2.0, name: "Chastity" },
  sloth:         { tier: "standard", mult: 2.0, name: "Sloth" },
  blizzard:      { tier: "standard", mult: 2.0, name: "Blizzard" },
  pitfalls:      { tier: "standard", mult: 2.0, name: "Pitfalls" },
  exposethieves: { tier: "standard", mult: 2.0, name: "Expose Thieves" },
  abolishritual: { tier: "standard", mult: 2.0, name: "Abolish Ritual" },
  magicward:     { tier: "standard", mult: 2.0, name: "Magic Ward" },
  tornadoes:     { tier: "hard", mult: 3.0, name: "Tornadoes" },
  mysticvortex:  { tier: "hard", mult: 3.0, name: "Mystic Vortex" },
  nightmares:    { tier: "hard", mult: 3.0, name: "Nightmares" },
  lightningst:   { tier: "hard", mult: 3.0, name: "Lightning Strike" },
  foolsgold:     { tier: "hard", mult: 3.0, name: "Fools Gold" },
  landlust:      { tier: "hard", mult: 3.0, name: "Land Lust" },
  meteor:        { tier: "mystic", mult: 4.5, name: "Meteor Showers" },
  nightfall:     { tier: "mystic", mult: 4.5, name: "Nightfall" },
};

module.exports = async function spellcheckHandler(interaction) {
  const kd = await getKingdomInfo();
  const myWizards = interaction.options.getInteger("my_wizards");
  const myLand    = interaction.options.getInteger("my_land");
  const myRace    = interaction.options.getString("my_race").toLowerCase();
  const myPers    = interaction.options.getString("my_personality")?.toLowerCase() || "none";
  const myScience = interaction.options.getNumber("my_channeling") || 1.0;
  const myHonor   = interaction.options.getNumber("my_honor_mod") || 1.0;
  const myMagesFury = interaction.options.getBoolean("mages_fury") || false;
  const focusedChannelling = interaction.options.getBoolean("focused_channelling") || false;
  const theirWizards = interaction.options.getInteger("their_wizards");
  const theirLand    = interaction.options.getInteger("their_land");
  const theirRace    = interaction.options.getString("their_race")?.toLowerCase() || "avian";
  const theirMagicShield = interaction.options.getBoolean("their_magic_shield") || false;
  const myNW    = interaction.options.getInteger("my_nw") || 0;
  const theirNW = interaction.options.getInteger("their_nw") || 0;
  const spell = interaction.options.getString("spell")?.toLowerCase().replace(/\s/g,"") || null;

  const ageRules = await loadCurrentAgeModifiers();
  const myRaceMod = ageRules.races[myRace.replace(/[^a-z]/g, "")] || { off: 1, def: 1, name: myRace };
  const myPersMod = ageRules.personalities[myPers.replace(/[^a-z]/g, "")] || { off: 1, def: 1, name: myPers };
  const theirRaceMod = ageRules.races[theirRace.replace(/[^a-z]/g, "")] || { off: 1, def: 1, name: theirRace };

  const myRawWPA    = myWizards / myLand;
  const theirRawWPA = theirWizards / theirLand;
  const magesFuryMod   = myMagesFury ? 1.25 : 1.0;
  const focusedChannellingMod = (myPers === "mystic" && focusedChannelling) ? 1.20 : 1.0;
  const magicShieldMod = theirMagicShield ? 1.20 : 1.0;
  const myModWPA    = myRawWPA * myScience * myRaceMod.off * myPersMod.off * myHonor * magesFuryMod * focusedChannellingMod;
  const theirModWPA = theirRawWPA * theirRaceMod.def * magicShieldMod;
  const ratio = theirModWPA > 0 ? myModWPA / theirModWPA : 999;

  let nwWarning = "";
  if (myNW > 0 && theirNW > 0) {
    const nwRatio = myNW / theirNW;
    if (nwRatio > 2.0)      nwWarning = "⛔ Your NW is 2x+ their NW — significant auto-fail penalty";
    else if (nwRatio > 1.5) nwWarning = "⚠️ Your NW is 1.5x their NW — moderate auto-fail penalty";
    else if (nwRatio < 0.5) nwWarning = "✅ You are much smaller — NW favors your success";
  }

  let rating, ratingColor, ratingEmoji;
  if (ratio >= 4.5)      { rating = "EXCELLENT"; ratingColor = 0x22c55e; ratingEmoji = "🟢"; }
  else if (ratio >= 3.0) { rating = "STRONG";    ratingColor = 0x4ade80; ratingEmoji = "🟢"; }
  else if (ratio >= 2.0) { rating = "DECENT";    ratingColor = 0xfacc15; ratingEmoji = "🟡"; }
  else if (ratio >= 1.0) { rating = "WEAK";      ratingColor = 0xfb923c; ratingEmoji = "🟠"; }
  else                   { rating = "VERY WEAK"; ratingColor = 0xef4444; ratingEmoji = "🔴"; }

  let spellAdvice = "";
  if (spell && SPELL_DIFFICULTY[spell]) {
    const s = SPELL_DIFFICULTY[spell];
    const pct = Math.round((myModWPA / (theirModWPA * s.mult)) * 100);
    spellAdvice = `\n**${s.name}** (${s.tier} — needs ~${s.mult}x mod WPA)\nYou have ${pct}% of needed — ${pct >= 100 ? "✅ Good chance" : pct >= 75 ? "⚠️ Risky" : "❌ Likely fail"}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🔮 Spellcheck Calculator${ageRules.age != null ? ` — Age ${ageRules.age}` : ""}`)
    .setColor(ratingColor)
    .setDescription(ageRules.age == null ? "⚠️ Current-age Spartan WPA rules could not be loaded. Neutral race/personality modifiers are used instead of stale hardcoded values." : `Race and personality WPA modifiers loaded from Spartan Age ${ageRules.age} rules.`)
    .addFields(
      {
        name: "🧙 Your WPA",
        value: [
          `Wizards: **${myWizards.toLocaleString()}** ÷ Land: **${myLand.toLocaleString()}**`,
          `Raw WPA: **${myRawWPA.toFixed(3)}**`,
          `× Race (${myRaceMod.name}): **${myRaceMod.off}x**`,
          `× Personality (${myPersMod.name}): **${myPersMod.off}x**`,
          `× Channeling Science: **${myScience}x**`,
          `× Honor Mod: **${myHonor}x**`,
          `× Mage's Fury: **${magesFuryMod}x**`,
          `× Focused Channelling: **${focusedChannellingMod}x**`,
          `\n**Your Mod WPA: ${myModWPA.toFixed(3)}**`,
        ].join("\n"),
        inline: false
      },
      {
        name: "🛡️ Their WPA",
        value: [
          `Wizards: **${theirWizards.toLocaleString()}** ÷ Land: **${theirLand.toLocaleString()}**`,
          `Raw WPA: **${theirRawWPA.toFixed(3)}**`,
          `× Race (${theirRaceMod.name}): **${theirRaceMod.def}x**`,
          `× Magic Shield: **${magicShieldMod}x**`,
          `\n**Their Mod WPA: ${theirModWPA.toFixed(3)}**`,
        ].join("\n"),
        inline: false
      },
      {
        name: "📊 Result",
        value: [
          `Ratio: **${ratio.toFixed(2)}x**`,
          `Rating: ${ratingEmoji} **${rating}**`,
          ``,
          `2x = Decent on standard spells`,
          `3x = Strong on standard spells`,
          `4-5x = Decent on mystic spells`,
          nwWarning || "",
          spellAdvice || "",
        ].filter(Boolean).join("\n"),
        inline: false
      }
    )
    ;
  if (kd?.footer) embed.setFooter({ text: kd.footer });

  return interaction.reply({ embeds: [embed], ephemeral: true });
};
