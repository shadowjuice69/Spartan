const { EmbedBuilder } = require("discord.js");
const {
  calculateThievery, resolveModifiers, getOp,
  calcModTPA, calcOpSuccess, densLossReduction, crimeSciencePersonalityMult,
} = require("../../../lib/spartan/thievery-engine");
// ^ path assumes bot/ and lib/ are siblings at repo root (true now that bot lives inside the Spartan repo).

module.exports = async function thieveryHandler(interaction) {
  try {
    const opName            = interaction.options.getString("op", true);
    const myThieves         = interaction.options.getInteger("my_thieves", true);
    const myLand            = interaction.options.getInteger("my_land", true);
    const theirThieves      = interaction.options.getInteger("their_thieves", true);
    const theirLand         = interaction.options.getInteger("their_land", true);
    const targetResource    = interaction.options.getInteger("target_resource", true);
    const myRace            = interaction.options.getString("my_race", true);
    const myPersonality     = interaction.options.getString("my_personality") || "none";
    const theirRace         = interaction.options.getString("their_race") || null;
    const war               = interaction.options.getBoolean("war") || false;
    const invisibility      = interaction.options.getBoolean("invisibility") || false;
    const myCrimeSciencePct = interaction.options.getNumber("my_crime_science_pct") || 0;
    const myDensPct         = interaction.options.getNumber("my_dens_pct") || 0;
    const myHonorMod        = interaction.options.getNumber("my_honor_mod") ?? 1;
    const myRitualMod       = interaction.options.getNumber("my_ritual_mod") ?? 1;
    const theirWatchTowers  = interaction.options.getNumber("their_watchtowers") || 0;
    const selfNW            = interaction.options.getNumber("my_nw") || 1;
    const targetNW          = interaction.options.getNumber("their_nw") || 1;
    const guile             = interaction.options.getNumber("guile") ?? 1;
    const cunning           = interaction.options.getNumber("cunning") ?? 1;
    const illuminate        = interaction.options.getNumber("their_illuminate") ?? 1;
    const shielding         = interaction.options.getNumber("their_shielding") ?? 0;
    const stance            = interaction.options.getNumber("stance") ?? 1;

    // Race/personality bonuses & penalties auto-applied — no manual "racial mod" number entry.
    const { racialMod, personalityMod, scienceMod, targetRaceMod, targetPersonalityMod } = resolveModifiers({
      myRace, myPersonality, theirRace, crimeScienceBonusPct: myCrimeSciencePct,
    });

    // --- (1) Op Success / catch chance ---
    const myModTPA = calcModTPA({
      thieves: myThieves, land: myLand, invisibility,
      crimeScienceBonusPct: myCrimeSciencePct,
      personalityScienceMult: crimeSciencePersonalityMult(myPersonality),
      race: myRace, densPct: myDensPct, honorMod: myHonorMod, ritualMod: myRitualMod,
    });
    const theirModTPA = calcModTPA({
      thieves: theirThieves, land: theirLand, invisibility: false,
      crimeScienceBonusPct: 0, personalityScienceMult: 1,
      race: theirRace, densPct: 0, honorMod: 1, ritualMod: 1,
    });
    const success = calcOpSuccess({ myModTPA, theirModTPA, theirWatchTowerPct: theirWatchTowers });
    const lossReduction = densLossReduction(myDensPct);

    // --- (2) Yield ---
    const y = calculateThievery({
      opName, war, available: myThieves, targetResource,
      racialMod, personalityMod, scienceMod,
      watchTowers: theirWatchTowers, selfNW, targetNW,
      targetRaceMod, targetPersonalityMod,
      guile, cunning, targetIlluminate: illuminate, targetShielding: shielding, stance,
    });

    const op = getOp(opName);
    const fmt = n => Math.round(n).toLocaleString();

    const modifierLines = [];
    if (racialMod !== 1) modifierLines.push(`Race TPA/offense bonus: **+${((racialMod - 1) * 100).toFixed(0)}%**`);
    if (personalityMod !== 1) modifierLines.push(`Personality TPA bonus (Yield only): **+${((personalityMod - 1) * 100).toFixed(0)}%**`);
    if (scienceMod !== 1) modifierLines.push(`Crime Science effect (incl. personality boost): **+${((scienceMod - 1) * 100).toFixed(1)}%**`);
    if (targetRaceMod !== 1) modifierLines.push(`Target's sabotage-damage-taken penalty: **+${((targetRaceMod - 1) * 100).toFixed(0)}%**`);
    if (!modifierLines.length) modifierLines.push("No race/personality thievery modifiers apply here.");

    const embed = new EmbedBuilder()
      .setTitle(`🗡️ ${op.name}${op.approx ? " (wiki figures approximate)" : ""}`)
      .setColor(success.ratio >= 2 ? 0x22c55e : success.ratio >= 1.5 ? 0xf59e0b : 0xef4444)
      .addFields(
        { name: "Modifiers", value: modifierLines.join("\n"), inline: false },
        {
          name: `${success.rating.emoji} Op Success — ${success.rating.label}`,
          value:
            `Mod TPA ratio (you/them): **${success.ratio}x**\n` +
            `Their catch chance from Watch Towers: **${(success.catchChance * 100).toFixed(1)}%**\n` +
            `Your thief-loss reduction from Dens: **${(lossReduction * 100).toFixed(1)}%**`,
          inline: false,
        },
        {
          name: "Send Plan (Yield)",
          value:
            `Optimal thieves to send: **${fmt(y.recommended)}**\n` +
            `Thieves you can send: **${fmt(Math.min(y.recommended, myThieves))}** ${y.actualSend < y.recommended ? "(NOT ENOUGH TO HIT CAP)" : "(CAP SEND)"}\n` +
            `Maximum operation amount: **${fmt(y.maxGross)} ${y.unit}**`,
          inline: false,
        },
        {
          name: "Yield",
          value:
            `Gross at your send: **${fmt(y.theoreticalGross)} ${y.unit}**\n` +
            (y.estimatedNet === null
              ? "Estimated net: not documented for war on this op"
              : `Estimated net received: **${fmt(y.estimatedNet)} ${y.unit}**`),
          inline: false,
        },
      )
      .setFooter({ text: op.warDocumented ? "Send formula: (target resource × max% cap) ÷ gains/thief ÷ race mod." : "⚠️ This op has no documented war-time figures in the wiki — normal figures used regardless of war flag." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error("[THIEVERY HANDLER ERROR]", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${err.message || "Thievery calculation failed."}`, ephemeral: true });
    }
  }
};
