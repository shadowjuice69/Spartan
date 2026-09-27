const RACE_STATS = {
  avian: { eliteDef: 2, defSpec: 10 },
  darkelf: { eliteDef: 2, defSpec: 12 },
  dryad: { eliteDef: 3, defSpec: 11 },
  dwarf: { eliteDef: 7, defSpec: 10 },
  elf: { eliteDef: 4, defSpec: 13 },
  faery: { eliteDef: 16, defSpec: 10 },
  halfling: { eliteDef: 13, defSpec: 10 },
  human: { eliteDef: 5, defSpec: 12 },
  orc: { eliteDef: 3, defSpec: 10 },
  undead: { eliteDef: 4, defSpec: 10 },
};
const SOLDIER_OFFENSE_VALUE = 3; // same for every race per the wiki's Ambush Formula

module.exports = async function ambushHandler(interaction) {
  const targetName = interaction.options.getString("target");
  const theirRace = interaction.options.getString("their_race");
  const theirElites = interaction.options.getInteger("their_elites");
  const theirOffSpecs = interaction.options.getInteger("their_off_specs");
  const theirSoldiers = interaction.options.getInteger("their_soldiers");
  const anonymity = interaction.options.getBoolean("their_anonymity");
  const warSpoils = interaction.options.getBoolean("their_war_spoils");

  if (anonymity || warSpoils) {
    return interaction.reply({
      content: `❌ ${targetName ? `**${targetName}** ` : "This province "}cannot be ambushed — ${anonymity ? "Anonymity" : "War Spoils"} is active.`,
      ephemeral: true,
    });
  }

  const stats = RACE_STATS[theirRace];
  if (!stats) return interaction.reply({ content: `❌ Unknown race **${theirRace}**.`, ephemeral: true });

  const ambushDefense = (theirElites * stats.eliteDef) + (theirOffSpecs * stats.defSpec) + (theirSoldiers * SOLDIER_OFFENSE_VALUE);
  const minRawOffense = ambushDefense * 0.80;
  const recommended = Math.ceil(minRawOffense) + 100;

  const lines = [
    `⚡ **Ambush Threshold${targetName ? ` — ${targetName}` : ""}** (${theirRace})`,
    ``,
    `Ambush Defense = (${theirElites.toLocaleString()} elites × ${stats.eliteDef}) + (${theirOffSpecs.toLocaleString()} off specs × ${stats.defSpec}) + (${theirSoldiers.toLocaleString()} soldiers × ${SOLDIER_OFFENSE_VALUE})`,
    `Ambush Defense = **${ambushDefense.toLocaleString()}**`,
    ``,
    `Min raw offense needed: **${Math.ceil(minRawOffense).toLocaleString()}**`,
    `Recommended send (with +100 buffer): **${recommended.toLocaleString()}**`,
    ``,
    `_War Horses provide no defense here and don't boost your offense either. More than 1 General sent gives no extra ambush offense. An army can only be ambushed once, and this needs their real troop composition from a successful spy op — Throne intel alone never shows this._`,
  ];
  return interaction.reply({ content: lines.join("\n").slice(0, 1900) });
};
