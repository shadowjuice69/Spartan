const supabaseService = require("../../services/supabase");
const spartanAccess = require("../../services/spartanAccessService");
const canonicalIntel = require("../../services/canonicalIntelService");

const PAGE_KEYS = ["throne", "survey", "science", "magic", "som", "universal"];
const LABEL = { throne: "Thr", survey: "Sur", science: "Sci", magic: "Mag", som: "SoM", universal: "Uni" };

function age(ts) { if (!ts) return "—"; const mins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000)); if (mins < 60) return `${mins}m`; const h = Math.floor(mins / 60); return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`; }
function n(v) { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : null; }
function fmt(v) { return v == null ? "?" : Number(v).toLocaleString(); }

async function registryRows(sb, kd) {
  const { data, error } = await sb.from("spartan_province_registry").select("province_id,province_name,kingdom_code,metadata,last_seen_at").eq("kingdom_code", kd);
  if (error) throw error;
  return data || [];
}
async function registryRow(sb, kd, province) {
  const { data, error } = await sb.from("spartan_province_registry").select("province_id,province_name,kingdom_code,metadata,last_seen_at").eq("kingdom_code", kd).eq("province_name", province).maybeSingle();
  if (error) throw error;
  return data;
}
async function resolveKingdom(sb, me) {
  if (me?.kd_code) return me.kd_code;
  const { data } = await sb.from("spartan_province_registry").select("kingdom_code,last_seen_at").order("last_seen_at", { ascending: false }).limit(1);
  return data?.[0]?.kingdom_code || null;
}

async function check(sb, kd) {
  const rows = await registryRows(sb, kd);
  let covered = 0;
  const lines = rows.slice(0, 25).map(r => {
    const m = r.metadata || {};
    const cells = PAGE_KEYS.map(k => m[`${k}_captured_at`] ? "✓" : "·").join("");
    if (PAGE_KEYS.every(k => m[`${k}_captured_at`])) covered++;
    const missing = PAGE_KEYS.filter(k => !m[`${k}_captured_at`]).map(k => LABEL[k]);
    return `• ${r.province_name.slice(0, 22).padEnd(22)} ${cells} ${missing.join(",") || "OK"}`;
  });
  return `🧭 **Intel check — ${kd}**\n\`Thr Sur Sci Mag SoM Uni\`\n**${rows.length} provinces registered · ${covered}/${Math.min(rows.length, 25)} shown complete**\n${lines.join("\n") || "No registered provinces."}\n\n✓ captured · · missing · reflects the latest stored capture per page type, not a live check`;
}

async function captureHealth(sb, kd, province) {
  const r = await registryRow(sb, kd, province);
  if (!r) return `❌ No registry record for **${province}** in ${kd}.`;
  const m = r.metadata || {};
  return `🩺 **Capture health — ${province} (${kd})**\n${PAGE_KEYS.map(k => `${LABEL[k].padEnd(3)} ${m[`${k}_captured_at`] ? `✓ ${age(m[`${k}_captured_at`])}` : "❌ missing"}`).join(" · ")}\n\nThis reports stored arrivals; it does not infer a page was collected when no record exists.`;
}

async function status(sb, me) {
  const r = await registryRow(sb, me.kd_code, me.name);
  if (!r) return `❌ No registry record found for **${me.name}**.`;
  const m = r.metadata || {}; const t = m.throne || {};
  return `📊 **${me.name} — Status**\n**Offense:** ${fmt(t.off)} · **Defense:** ${fmt(t.def)}\n**oTPA:** ${t.o_tpa ?? "?"} · **oWPA:** ${t.o_wpa ?? "?"} · **BE:** ${t.be ?? "?"}%\n**Gold:** ${fmt(t.gold)} · **Food:** ${fmt(t.food)} · **Runes:** ${fmt(t.runes)}\n**Peasants:** ${fmt(t.peons)} · **Thieves:** ${fmt(t.thieves)} · **Wizards:** ${fmt(t.wizards)}\n_Stored throne intel: ${age(m.throne_captured_at)}_`;
}

async function econ(sb, kd, province) {
  const r = await registryRow(sb, kd, province);
  if (!r) return `❌ No registry record for **${province}**.`;
  const m = r.metadata || {};
  if (m.daily_income == null && m.daily_wages == null) return `❌ No economy capture for **${province}** yet (needs a State-page capture).`;
  const net = (n(m.daily_income) || 0) - (n(m.daily_wages) || 0);
  return `💰 **${province} — Economy**\nPeasants ${fmt(m.peasants)} · idle ${fmt(m.unemployed)} · unfilled jobs ${fmt(m.unfilled_jobs)}\nIncome ${fmt(m.daily_income)}/day · wages ${fmt(m.daily_wages)}/day\n**NET ${net >= 0 ? "+" : ""}${fmt(net)}/day**\nFood grown yesterday ${fmt(m.food_grown_yesterday)} · Runes produced yesterday ${fmt(m.runes_produced_yesterday)}`;
}

async function kdecon(sb, kd) {
  const rows = await registryRows(sb, kd);
  const withEcon = rows.filter(r => (r.metadata || {}).daily_income != null);
  const sorted = withEcon.sort((a, b) => (n(b.metadata.daily_income) || 0) - (n(a.metadata.daily_income) || 0));
  const ti = sorted.reduce((s, r) => s + (n(r.metadata.daily_income) || 0), 0), tw = sorted.reduce((s, r) => s + (n(r.metadata.daily_wages) || 0), 0);
  return `💰 **KD Economy — ${kd}**\n${sorted.slice(0, 25).map(r => `${r.province_name} · ${fmt(r.metadata.daily_income)} income · ${fmt(r.metadata.daily_wages)} wages`).join("\n") || "No economy captures in this kingdom yet."}\n\n**${sorted.length}/${rows.length} provinces with economy data** · income ${fmt(ti)} · wages ${fmt(tw)}\n_Only counts provinces someone has actually captured a State page for._`;
}

async function survey(sb, q, kd) {
  const rows = await registryRows(sb, kd);
  const r = rows.find(x => x.province_name.toLowerCase().includes(String(q || "").toLowerCase()));
  if (!r || !r.metadata?.survey?.buildings) return `❌ No Survey capture found for **${q}** in ${kd}.`;
  const b = r.metadata.survey.buildings;
  return `🏗️ **${r.province_name} — Survey** · ${age(r.metadata.survey_captured_at)}\n${Object.entries(b).filter(([, v]) => v?.qty).slice(0, 12).map(([k, v]) => `${k.replace(/_/g, " ")} ${v.qty} (${v.pct}%)`).join(" · ") || "No building rows parsed."}`;
}

async function tppa(sb, kd) {
  const rows = await registryRows(sb, kd);
  const entries = rows.filter(r => r.metadata?.throne).map(r => {
    const t = r.metadata.throne; const land = n(t.acres);
    const pop = [t.peons, t.soldiers, t.thieves, t.wizards, t.prisoners].reduce((s, v) => s + (n(v) || 0), 0);
    return { name: r.province_name, acres: land, d: land ? pop / land : 0 };
  }).filter(e => e.acres);
  entries.sort((a, b) => b.d - a.d);
  const totalPop = entries.reduce((s, e) => s + e.d * e.acres, 0), totalLand = entries.reduce((s, e) => s + e.acres, 0);
  return `👥 **TPPA — ${kd}** · ${entries.length}/${rows.length} provinces with own-capture data\n${entries.map(e => `${e.name} · ${e.d.toFixed(2)} tppa · ${fmt(e.acres)}a`).join("\n") || "No captured provinces with population data."}\n\n**KD (captured subset):** ${totalLand ? (totalPop / totalLand).toFixed(2) : "?"} tppa · ${fmt(totalLand)} acres\n_Uses peons+soldiers+thieves+wizards+prisoners from each province's own Throne capture — off/def specialist breakdown isn't parsed yet, and provinces nobody has captured aren't counted._`;
}

async function plunders(sb, kd, me) {
  const attackerNW = n(me.nw);
  if (!attackerNW) return "❌ Your networth is unavailable; cannot rank plunder targets without fabricating the NW range.";
  const rows = await registryRows(sb, kd);
  const minNW = attackerNW * .85, maxNW = attackerNW * 1.25;
  const candidates = rows.filter(r => r.metadata?.throne && r.province_name !== me.name).map(r => ({ name: r.province_name, nw: n(r.metadata.throne.nw), acres: n(r.metadata.throne.acres) })).filter(c => c.nw >= minNW && c.nw <= maxNW).sort((a, b) => b.nw - a.nw);
  return `💰 **PLUNDERS — ${me.name}** · NW ${fmt(attackerNW)}\nrange 85–125% NW → ${fmt(minNW)}–${fmt(maxNW)}\n${candidates.slice(0, 10).map(c => `${c.name} · NW ${fmt(c.nw)} · ${fmt(c.acres)}a`).join("\n") || "No in-range targets among captured provinces."}\n\n_Only ranks provinces someone has actually captured via Throne — not the full kingdom roster, and no gold/SoT/protection intel is invented._`;
}

async function left(sb, kd) {
  const rows = await registryRows(sb, kd);
  const withOff = rows.filter(r => n(r.metadata?.throne?.off) != null);
  const sorted = withOff.map(r => ({ name: r.province_name, off: n(r.metadata.throne.off), capturedAt: r.metadata.throne_captured_at }))
    .sort((a, b) => b.off - a.off);
  const total = sorted.reduce((s, r) => s + r.off, 0);
  return `⚔️ **Kingdom Offense — ${kd}** · ${sorted.length}/${rows.length} provinces with captured Offense\n${sorted.slice(0, 25).map(r => `${r.name} · ${fmt(r.off)} off · ${age(r.capturedAt)}`).join("\n") || "No captured Offense in this kingdom yet."}\n\n**Total: ${fmt(total)}**\n_This is each province's last captured Offense total. Travel time is real in this game but isn't captured or displayed anywhere yet, so this can't tell you whether any of that offense is currently marching rather than sitting at home — treat it as a rough total, not a live "ready right now" figure._`;
}

const UNSUPPORTED = {
  incoming: "Army movement (who's marching where, ETA) isn't captured by any current scraper page yet — needs a War Room/Military page parser that records outgoing/incoming armies with return time. Travel time is real in this game, the site just hasn't been built to track it yet.",
  eta: "Same gap as incoming — no army-in-transit data is captured anywhere yet.",
  oprate: "Per-operation success/failure (spy, thievery, spells) isn't tracked anywhere in the current schema — the old intel_ops table this used to read is gone and nothing replaced it. Needs a dedicated operations-log capture.",
};

module.exports = async function intelOpsHandler(interaction) {
  const sb = supabaseService.getClient(); if (!sb) return interaction.reply({ content: "❌ Supabase is unavailable.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "canonical") {
    const section = interaction.options.getString("section") || "all";
    const access = await spartanAccess.get(interaction.user.id).catch(() => null);
    const kd = access?.metadata?.coordinates || access?.kingdom_code || "";
    const rows = await canonicalIntel.getIntel({ kd, section, limit: 40 });
    const summary = canonicalIntel.summarize(rows);
    const lines = rows.slice(0, 18).map((r) => {
      const payload = r.parsed_payload || {};
      const province = payload.prov || payload.province || payload.data?.owner?.province_name || r.province_id || "Province";
      const when = r.captured_at ? new Date(r.captured_at).toLocaleString() : "—";
      const target = r.target_kingdom_id ? ` → ${r.target_kingdom_id}` : "";
      const excerpt = r.raw_text || payload.data_simple || payload.data?.content || JSON.stringify(payload);
      return `• **${String(province).slice(0, 32)}** — ${String(r.page_kind || "intel").toUpperCase()} ${r.visibility === "enemy" ? "ENEMY" : "OWN"}${target} · ${when}\n  ${String(excerpt).slice(0, 220)}`;
    });
    const body = `🧠 **CANONICAL SPARTAN INTEL — ${section.toUpperCase()}**\n**${summary.count} records** · ${Object.entries(summary.byKind).map(([k,v]) => `${k}:${v}`).join(" · ")}\n\n${lines.join("\n") || "No canonical Intel is available for this section."}`;
    return interaction.reply({ content: body.slice(0, 1900), ephemeral: false });
  }
  if (UNSUPPORTED[sub]) return interaction.reply({ content: `🚧 **/spartan-intel ${sub}** isn't built yet. ${UNSUPPORTED[sub]}`, ephemeral: true });
  let me = null;
  try {
    const access = await spartanAccess.get(interaction.user.id);
    const meta = access?.metadata || {};
    const coordinates = String(meta.coordinates || access?.kingdom_code || "").trim();
    me = access ? {
      id: interaction.user.id,
      name: meta.province || access.username || null,
      province: meta.province || access.username || null,
      kd_code: coordinates || null,
      nw: meta.nw ?? null,
      coordinates,
      race: meta.race || null,
      personality: meta.personality || null
    } : null;
  } catch (e) { console.error("[SPARTAN IDENTITY RESOLVE]", e.message); }
  const kingdomOnly = new Set(["check", "kdecon", "left"]);
  if (!me && !kingdomOnly.has(sub)) return interaction.reply({ content: "❌ No Spartan province identity found. Register/link your province first.", ephemeral: true });
  const kd = await resolveKingdom(sb, me);
  if (!kd) return interaction.reply({ content: "❌ No kingdom Intel is available yet.", ephemeral: true });
  let out;
  try {
    switch (sub) {
      case "check": out = await check(sb, kd); break;
      case "capturehealth": out = await captureHealth(sb, kd, me.name); break;
      case "status": out = await status(sb, me); break;
      case "econ": out = await econ(sb, kd, me.name); break;
      case "kdecon": out = await kdecon(sb, kd); break;
      case "survey": out = await survey(sb, interaction.options.getString("province"), kd); break;
      case "tppa": out = await tppa(sb, kd); break;
      case "plunders": out = await plunders(sb, kd, me); break;
      case "left": out = await left(sb, kd); break;
      default: out = "❌ Unknown Intel command.";
    }
    return interaction.reply({ content: String(out || "❌ No Intel result.").slice(0, 1900), ephemeral: false });
  } catch (e) { console.error(`[INTEL] ${sub} failed`, e); return interaction.reply({ content: `❌ Intel command failed: ${e.message}`, ephemeral: true }); }
};
