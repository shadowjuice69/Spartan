const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");
const canonicalIntel = require("../../services/canonicalIntelService");
const { parseThrone, parseBuildings, parseBuildingOutputs } = require("../../services/canonicalIntelParser");

const PAGE_KEYS = [
  { key: "throne", kind: "throne", label: "Thr" },
  { key: "survey", kind: "buildings", label: "Sur" },
  { key: "science", kind: "science", label: "Sci" },
  { key: "magic", kind: "magic", label: "Mag" },
  { key: "som", kind: "military", label: "Mil" },
  { key: "universal", kind: "utopiaintel", label: "Uni" }
];

function age(ts) {
  if (!ts) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
function fmt(v) { return v == null ? "?" : Number(v).toLocaleString(); }
function signed(v) { return v == null ? "?" : `${v > 0 ? "+" : ""}${fmt(v)}`; }

async function registryRows(sb, kd) {
  const { data, error } = await sb.from("spartan_province_registry")
    .select("province_id,province_name,kingdom_code,last_seen_at")
    .eq("kingdom_code", kd)
    .order("province_name", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function registryRow(sb, kd, province) {
  const { data, error } = await sb.from("spartan_province_registry")
    .select("province_id,province_name,kingdom_code,last_seen_at")
    .eq("kingdom_code", kd)
    .ilike("province_name", province)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function resolveKingdom(sb, me) {
  if (me?.kd_code) return me.kd_code;
  return null;
}
async function provinceThrone(kd, province) {
  return canonicalIntel.getProvinceIntel({ kd, province, pageKind: "throne", visibility: "own" });
}
async function provinceBuildings(kd, province) {
  return canonicalIntel.getProvinceIntel({ kd, province, pageKind: "buildings", visibility: "own" });
}
async function ownThrone(kd, province) {
  const row = await provinceThrone(kd, province);
  return row ? { row, parsed: parseThrone(row.parsed_payload || { raw_text: row.raw_text }) } : null;
}
async function captureHealth(kd, province) {
  const captures = await canonicalIntel.getLatestProvinceIntel({
    kd, province, pageKinds: PAGE_KEYS.map(p => p.kind)
  });
  const rows = PAGE_KEYS.map(p => ({ ...p, row: captures[p.kind] }));
  return `🩺 **Capture health — ${province} (${kd})**\n${rows.map(p => `${p.label.padEnd(3)} ${p.row ? `✓ ${age(p.row.captured_at)}` : "❌ missing"}`).join(" · ")}\n\nRead from website-captured canonical Intel. A missing page means no matching own capture exists.`;
}
async function check(sb, kd) {
  const provinces = (await registryRows(sb, kd)).slice(0, 25);
  const results = await Promise.all(provinces.map(async p => {
    const captures = await canonicalIntel.getLatestProvinceIntel({ kd, province: p.province_name, pageKinds: PAGE_KEYS.map(x => x.kind) });
    const missing = PAGE_KEYS.filter(x => !captures[x.kind]).map(x => x.label);
    return { name: p.province_name, captures, missing };
  }));
  const covered = results.filter(x => !x.missing.length).length;
  const lines = results.map(x => `• ${x.name.slice(0, 22).padEnd(22)} ${PAGE_KEYS.map(p => x.captures[p.kind] ? "✓" : "·").join("")} ${x.missing.join(",") || "OK"}`);
  return `🧭 **Intel check — ${kd}**\nThr Sur Sci Mag Mil Uni\n**${provinces.length} registered provinces · ${covered}/${provinces.length} complete**\n${lines.join("\n") || "No registered provinces."}\n\n✓ captured · · missing · based on canonical website captures`;
}
async function status(kd, province, identity = {}) {
  const result = await ownThrone(kd, province);
  if (!result) return `❌ **${province}** is registered, but no own Throne capture exists in website Intel for ${kd}.`;
  const t = result.parsed;
  return `📊 **${province} — Status** · ${age(result.row.captured_at)}\n**Race:** ${identity.race || t.race || "?"} · **Personality:** ${identity.personality || "?"} · **Land:** ${fmt(t.land)} · **BE:** ${t.buildingEffectiveness == null ? "?" : `${t.buildingEffectiveness}%`}\n**Offense:** ${fmt(t.offense)} · **Defense:** ${fmt(t.defense)} · **Networth:** ${fmt(t.networth)}\n**Peasants:** ${fmt(t.peasants)} · **Soldiers:** ${fmt(t.soldiers)} · **Thieves:** ${fmt(t.thieves)} · **Wizards:** ${fmt(t.wizards)} · **Prisoners:** ${fmt(t.prisoners)}\n**Gold:** ${fmt(t.gold)} · **Food:** ${fmt(t.food)} · **Runes:** ${fmt(t.runes)} · **Trade balance:** ${signed(t.tradeBalance)}\n_oTPA/oWPA and home/march splits are not present in this Throne capture._`;
}
async function econ(kd, province) {
  const [result, buildings] = await Promise.all([ownThrone(kd, province), provinceBuildings(kd, province)]);
  if (!result) return "❌ No own Throne capture for **" + province + "** in " + kd + ".";
  const t = result.parsed;
  const output = buildings ? parseBuildingOutputs(buildings.parsed_payload || { raw_text: buildings.raw_text }) : {};
  return "💰 **" + province + " — Captured Economy** · " + age(result.row.captured_at) +
    "\nGold " + fmt(t.gold) + " · Food " + fmt(t.food) + " · Runes " + fmt(t.runes) +
    "\nTrade balance " + signed(t.tradeBalance) +
    "\nPeasants " + fmt(t.peasants) + " · Land " + fmt(t.land) + "a" +
    "\n**Daily Survey output:** bank gold " + fmt(output.goldPerDay) + " · food " + fmt(output.foodPerDay) +
    " · runes " + fmt(output.runesPerDay) + " · wizards " + fmt(output.wizardsPerDay) +
    "\n_Wages and full net income are not present in these captures, so no net figure is fabricated._";
}
async function provinceRows(kd) {
  const registered = await registryRows(supabaseService.getClient(), kd);
  return Promise.all(registered.map(async p => {
    const result = await ownThrone(kd, p.province_name);
    if (!result) return null;
    const buildings = await provinceBuildings(kd, p.province_name);
    const outputs = buildings ? parseBuildingOutputs(buildings.parsed_payload || { raw_text: buildings.raw_text }) : {};
    return { name: p.province_name, row: result.row, ...result.parsed, outputs };
  })).then(rows => rows.filter(Boolean));
}
async function kdecon(kd) {
  const rows = await provinceRows(kd);
  const sum = key => rows.reduce((total, r) => total + (r[key] || 0), 0);
  const outputSum = key => rows.reduce((total, r) => total + (r.outputs?.[key] || 0), 0);
  const lines = rows.slice(0, 25).map(r =>
    r.name + " · " + fmt(r.gold) + " gc · " + fmt(r.food) + " food · " + fmt(r.runes) + " runes · TB " + signed(r.tradeBalance)
  );
  return "💰 **KD Captured Economy — " + kd + "**\n" + (lines.join("\n") || "No own Throne captures found.") +
    "\n\n**Captured stock (subset):** " + fmt(sum("gold")) + " gc · " + fmt(sum("food")) + " food · " +
    fmt(sum("runes")) + " runes · trade balance " + signed(sum("tradeBalance")) +
    "\n**Daily Survey outputs:** " + fmt(outputSum("goldPerDay")) + " bank gold · " + fmt(outputSum("foodPerDay")) +
    " food · " + fmt(outputSum("runesPerDay")) + " runes · " + fmt(outputSum("wizardsPerDay")) + " wizards" +
    "\n_Not a full kingdom total unless every province has current own Throne and Survey captures; daily outputs exclude wages._";
}
async function survey(kd, provinceQuery) {
  const rows = await registryRows(supabaseService.getClient(), kd);
  const p = rows.find(x => x.province_name.toLowerCase().includes(String(provinceQuery || "").toLowerCase()));
  if (!p) return `❌ No registered province matching **${provinceQuery}** in ${kd}.`;
  const row = await provinceBuildings(kd, p.province_name);
  if (!row) return `❌ **${p.province_name}** has no own Survey/Buildings capture in website Intel.`;
  const buildings = parseBuildings(row.parsed_payload || { raw_text: row.raw_text });
  return `🏗️ **${p.province_name} — Survey** · ${age(row.captured_at)}\n${buildings.slice(0, 18).map(b => `${b.name} ${fmt(b.quantity)} (${b.percent}%)`).join(" · ") || "Capture exists, but building rows could not be parsed."}`;
}
async function tppa(kd) {
  const rows = await provinceRows(kd);
  const entries = rows.filter(r => r.land > 0).map(r => {
    const population = [r.peasants, r.soldiers, r.thieves, r.wizards, r.prisoners].reduce((s, v) => s + (v || 0), 0);
    return { name: r.name, land: r.land, population, density: population / r.land, capturedAt: r.row.captured_at };
  }).sort((a, b) => b.density - a.density);
  const pop = entries.reduce((s, r) => s + r.population, 0), land = entries.reduce((s, r) => s + r.land, 0);
  return `👥 **TPPA — ${kd}** · ${entries.length} captured provinces\n${entries.map(r => `${r.name} · ${r.density.toFixed(2)} tppa · ${fmt(r.land)}a · ${age(r.capturedAt)}`).join("\n") || "No captured population data."}\n\n**Captured subset:** ${land ? (pop / land).toFixed(2) : "?"} tppa · ${fmt(land)} acres\n_Includes peasants, soldiers, thieves, wizards and prisoners shown on Throne; this is not a specialist-only TPA figure._`;
}
async function plunders(kd, me) {
  const own = await ownThrone(kd, me.name);
  const attackerNW = own?.parsed.networth;
  if (!attackerNW) return `❌ Your own canonical Throne capture has no Networth value; cannot rank targets.`;
  const rows = await provinceRows(kd);
  const minNW = attackerNW * 0.85, maxNW = attackerNW * 1.25;
  const candidates = rows.filter(r => r.name.toLowerCase() !== me.name.toLowerCase() && r.networth != null && r.networth >= minNW && r.networth <= maxNW)
    .sort((a, b) => b.networth - a.networth);
  return `💰 **Plunder candidates — ${me.name}** · NW ${fmt(attackerNW)}\nAllowed range 85–125%: ${fmt(minNW)}–${fmt(maxNW)}\n${candidates.slice(0, 12).map(r => `${r.name} · NW ${fmt(r.networth)} · ${fmt(r.land)}a`).join("\n") || "No in-range targets among captured provinces."}\n_Only provinces with own Throne captures are included; this is a NW shortlist, not a guarantee of plunder value or protection status._`;
}
async function left(kd) {
  const rows = await provinceRows(kd);
  const sorted = rows.filter(r => r.offense != null).sort((a, b) => b.offense - a.offense);
  const total = sorted.reduce((s, r) => s + r.offense, 0);
  return `⚔️ **Kingdom Offense — ${kd}** · ${sorted.length} captured provinces\n${sorted.slice(0, 25).map(r => `${r.name} · ${fmt(r.offense)} off · ${age(r.row.captured_at)}`).join("\n") || "No captured offense values."}\n\n**Captured subset total: ${fmt(total)}**\n_Throne Off. Points are total province offense, not a live march-ready/home split._`;
}
async function canonical(interaction, section) {
  const access = await spartanAccess.get(interaction.user.id).catch(() => null);
  const kd = access?.metadata?.coordinates || access?.kingdom_code || "";
  if (!kd) return interaction.reply({ content: "❌ Your Spartan registration has no kingdom coordinates. Re-register/link your province.", ephemeral: true });
  const rows = await canonicalIntel.getIntel({ kd, section, limit: 40 });
  const summary = canonicalIntel.summarize(rows);
  const lines = rows.slice(0, 14).map(r => {
    const payload = r.parsed_payload || {};
    const province = payload.prov || payload.province || payload.data?.owner?.province_name || r.province_id || "Province";
    const when = r.captured_at ? new Date(r.captured_at).toLocaleString() : "—";
    const target = r.target_kingdom_id ? ` → ${r.target_kingdom_id}` : "";
    const excerpt = r.raw_text || payload.data_simple || payload.data?.content || JSON.stringify(payload);
    return `• **${String(province).slice(0, 30)}** — ${String(r.page_kind || "intel").toUpperCase()} ${r.visibility === "enemy" ? "ENEMY" : "OWN"}${target} · ${when}\n  ${String(excerpt).slice(0, 150)}`;
  });
  const body = `🧠 **CANONICAL SPARTAN INTEL — ${section.toUpperCase()}**\n**${summary.count} records** · ${Object.entries(summary.byKind).map(([k,v]) => `${k}:${v}`).join(" · ")}\n\n${lines.join("\n") || "No canonical Intel is available for this section."}`;
  return interaction.reply({ content: body.slice(0, 1900), ephemeral: false });
}

const UNSUPPORTED = {
  incoming: "Live incoming army movements are not stored in the website Intel records or the current attacks table. This command will not invent an ETA.",
  eta: "Live army return ETAs are not stored in the website Intel records. The historical attack log is not a live army tracker.",
  oprate: "The website captures operation reports, but does not currently store a complete success/failure denominator. A true operation-rate percentage cannot be calculated reliably."
};

module.exports = async function intelOpsHandler(interaction) {
  const sb = supabaseService.getClient();
  if (!sb) return interaction.reply({ content: "❌ Supabase is unavailable.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "canonical") return canonical(interaction, interaction.options.getString("section") || "all");
  if (UNSUPPORTED[sub]) return interaction.reply({ content: `🚧 **/spartan-intel ${sub}** — ${UNSUPPORTED[sub]}`, ephemeral: true });

  let me = null;
  try {
    const access = await spartanAccess.get(interaction.user.id);
    const meta = access?.metadata || {};
    const coordinates = String(meta.coordinates || access?.kingdom_code || "").trim();
    me = access ? {
      id: interaction.user.id,
      name: meta.province || access.username || null,
      kd_code: coordinates || null,
      nw: meta.nw ?? null,
      race: meta.race || null,
      personality: meta.personality || null
    } : null;
  } catch (e) { console.error("[SPARTAN IDENTITY RESOLVE]", e.message); }
  const kingdomOnly = new Set(["check", "kdecon", "left"]);
  if (!me && !kingdomOnly.has(sub)) return interaction.reply({ content: "❌ No Spartan province identity found. Use /spartan register first.", ephemeral: true });
  const kd = await resolveKingdom(sb, me);
  if (!kd) return interaction.reply({ content: "❌ Your Spartan registration has no kingdom coordinates. Re-register/link your province.", ephemeral: true });
  if (!me?.name && !kingdomOnly.has(sub)) return interaction.reply({ content: "❌ Your Spartan registration has no province name. Re-register/link your province.", ephemeral: true });

  try {
    let out;
    switch (sub) {
      case "check": out = await check(sb, kd); break;
      case "capturehealth": out = await captureHealth(kd, me.name); break;
      case "status": out = await status(kd, me.name, me); break;
      case "econ": out = await econ(kd, me.name); break;
      case "kdecon": out = await kdecon(kd); break;
      case "survey": out = await survey(kd, interaction.options.getString("province")); break;
      case "tppa": out = await tppa(kd); break;
      case "plunders": out = await plunders(kd, me); break;
      case "left": out = await left(kd); break;
      default: out = "❌ Unknown Intel command.";
    }
    return interaction.reply({ content: String(out || "❌ No Intel result.").slice(0, 1900), ephemeral: false });
  } catch (e) {
    console.error(`[INTEL] ${sub} failed`, e);
    return interaction.reply({ content: `❌ Intel command failed: ${e.message}`, ephemeral: true });
  }
};
