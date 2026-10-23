"use client";

import { logout } from "./login/actions";
import UtopiaClock from "./components/UtopiaClock";
import {
  C, DataTable, Donut, Empty, Gauge, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, pct, seriesFrom, usePageModel,
} from "@/components/spartan/ui";

const label = { fontSize: 10, letterSpacing: ".16em", color: "#7d8fa0" } as const;
const tile = { padding: 12, borderRadius: 12, background: "rgba(255,255,255,.04)" } as const;
const CAT_COLOR: Record<string, string> = { Economy: C.lime, Military: C.red, "Arcane Arts": C.violet };

type Alert = { level: "warn" | "bad" | "info"; text: string };

function signedFmt(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
}

export default function Home() {
  const { data, error, loading, reload } = usePageModel("command");
  const m = data?.model;
  const t = m?.throne;
  const f = m?.throneFields || {};
  const s = m?.state;
  const mil = m?.military?.current ?? m?.military;
  const sci = m?.science;
  const bld = m?.buildings;
  const kd = m?.kingdom;
  const events: any[] = m?.events || [];
  const history: any[] = data?.history || [];
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const delta = (key: string) => {
    const a = Number(last?.[key]);
    const b = Number(prev?.[key]);
    return Number.isFinite(a) && Number.isFinite(b) && prev ? a - b : null;
  };
  const since = (key: string) => {
    const d = delta(key);
    return d == null ? undefined : `${signedFmt(d)} since last capture`;
  };

  const acres = f.acres ?? s?.land ?? last?.acres;
  const nw = f.networth ?? s?.networth ?? last?.networth;
  const off = f.offense ?? mil?.offPoints ?? last?.offense;
  const def = f.defense ?? mil?.defPoints ?? last?.defense;
  const peasants = s?.population?.peasants ?? f.peons ?? last?.peons;
  const pop = s?.population;
  const trends: any[] = s?.trends || [];
  const net = (name: string) => trends.find((x) => x.label === name);
  const buildEff = t?.buildingEfficiency ?? f.build_efficiency ?? bld?.stats?.efficiency;

  const hasAny = Boolean(t || s || mil || sci || bld || kd || history.length);

  // ---------------------------------------------------------------- needs attention
  const alerts: Alert[] = [];
  const netFood = net("Net Food");
  const foodNow = f.food;
  if (netFood && netFood.yesterday < 0) {
    const days = foodNow ? Math.floor(foodNow / Math.abs(netFood.yesterday)) : null;
    alerts.push({ level: days != null && days <= 3 ? "bad" : "warn", text: `Food is shrinking by ${fmt(Math.abs(netFood.yesterday))} per day${days != null ? ` (about ${days} days left)` : ""}.` });
  }
  const netGold = net("Net Gold");
  if (netGold && netGold.yesterday < 0) alerts.push({ level: "warn", text: `Gold is falling by ${fmt(Math.abs(netGold.yesterday))} per day.` });
  if (s?.economy?.employment != null && s.economy.employment < 100) alerts.push({ level: "warn", text: `Employment is ${pct(s.economy.employment, 0)}: ${fmt(s.economy.unemployed)} peasants have no job.` });
  if (buildEff != null && buildEff < 100) alerts.push({ level: "warn", text: `Building efficiency is ${pct(buildEff, 0)}.` });
  if (pop?.max && pop.total && pop.total >= pop.max) alerts.push({ level: "info", text: "Population is at its maximum." });
  const expiring = (t?.spells || []).filter((x: any) => x.days <= 1);
  if (expiring.length) alerts.push({ level: "warn", text: `Expiring within a day: ${expiring.map((x: any) => x.name).join(", ")}.` });
  if (t?.ritual && t.ritual.days <= 2) alerts.push({ level: "warn", text: `${t.ritual.name} ritual ends in ${t.ritual.days} day${t.ritual.days === 1 ? "" : "s"}.` });
  if (t?.thievesReady != null && t.thievesReady < 100) alerts.push({ level: "info", text: `Thieves are ${pct(t.thievesReady, 0)} ready.` });
  if (t?.wizardsReady != null && t.wizardsReady < 100) alerts.push({ level: "info", text: `Wizards are ${pct(t.wizardsReady, 0)} ready.` });
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const hitsToday = events.filter((e) => e.acres < 0 && new Date(e.at).getTime() > dayAgo);
  if (hitsToday.length) alerts.push({ level: "bad", text: `You lost land ${hitsToday.length} time${hitsToday.length === 1 ? "" : "s"} in the last 24 hours (${fmt(Math.abs(hitsToday.reduce((n, e) => n + e.acres, 0)))} acres).` });
  if (s?.protection && !/none|no /i.test(s.protection)) alerts.push({ level: "info", text: `Multi-attack protection: ${s.protection}.` });
  const alertColor = { bad: C.red, warn: C.amber, info: C.cyan } as const;

  // ---------------------------------------------------------------- panel data
  const popSlices = pop ? [
    { label: "Peasants", value: pop.peasants || 0, color: C.cyan },
    { label: "Army", value: Math.max(0, (pop.army || 0) - (pop.thieves || 0) - (pop.wizards || 0)), color: C.red },
    { label: "Thieves", value: pop.thieves || 0, color: C.amber },
    { label: "Wizards", value: pop.wizards || 0, color: C.violet },
  ] : [];
  const armyFromMil = (mil?.army || []).map((u: any, i: number) => ({
    label: u.role || u.name, value: (u.home || 0) + (u.away || 0), color: [C.amber, C.red, C.cyan, C.violet][i % 4],
    text: u.away ? `${fmt(u.home)} home · ${fmt(u.away)} away` : fmt(u.home),
  }));
  const armyFromFields = ([
    ["Offense specs", f.off_specs, C.red], ["Defense specs", f.def_specs, C.cyan], ["Elites", f.elites, C.violet], ["Soldiers", f.soldiers, C.amber],
    ["War horses", f.war_horses, C.lime], ["Thieves", f.thieves, C.pink], ["Wizards", f.wizards, C.blue],
  ] as Array<[string, number | null, string]>).filter((r) => r[1] != null).map(([l, v, c]) => ({ label: l, value: Number(v), color: c }));
  const army = armyFromMil.length ? armyFromMil : armyFromFields;
  const resources = ([["Gold", f.gold, C.amber], ["Food", f.food, C.green], ["Runes", f.runes, C.violet], ["Peasants", peasants, C.cyan]] as Array<[string, number | null, string]>)
    .filter((r) => r[1] != null).map(([l, v, c]) => ({ label: l, value: Number(v), color: c }));
  const sciCats: any[] = sci?.categories || [];
  const topSciences = sciCats.flatMap((c) => c.items.map((i: any) => ({ ...i, cat: c.name }))).sort((a, b) => b.effect - a.effect).slice(0, 6);
  const buildRows: any[] = (bld?.rows || []).filter((r: any) => r.qty > 0);
  const barren = buildRows.find((r) => r.name === "Barren Land");
  const topBuildings = buildRows.filter((r) => r.name !== "Barren Land").sort((a, b) => b.qty - a.qty).slice(0, 8);
  const ownName = String(data?.province || "").toLowerCase();

  return (
    <Shell
      title={t?.province || data?.province || "Command Center"}
      eyebrow="SPARTAN // COMMAND CENTER"
      accent={C.lime}
      subtitle={t ? `${t.race ?? ""} · ${t.ruler ?? ""} · ${t.date ?? ""}`.replace(/^ · | · $/g, "").replace(/ ·  · /g, " · ") : "Your province, kingdom and forces at a glance."}
      data={data}
      error={error}
      loading={loading}
      reload={reload}
      right={<form action={logout}><button className="sp-btn" type="submit">Log out</button></form>}
    >
      <UtopiaClock />
      {!data && !error && <Skeletons count={8} />}
      {data && !hasAny && (
        <Panel>
          <Empty title="No province data yet" hint="Open your Throne in Utopia with the Spartan scraper running. This page fills in within seconds." />
        </Panel>
      )}

      {data && hasAny && (
        <>
          <Grid>
            <Stat span={4} label="Land" value={acres} sub={s?.landRank ? `Rank ${s.landRank.rank} of ${fmt(s.landRank.of)}` : since("acres")} color={C.lime} delay={0} />
            <Stat span={4} label="Networth" value={nw} sub={s?.networthRank ? `Rank ${s.networthRank.rank} of ${fmt(s.networthRank.of)}` : since("networth")} color={C.violet} delay={1} />
            <Stat span={4} label="Offense" value={off} sub={t?.ratios?.offSpa != null ? `${t.ratios.offSpa} per acre` : since("offense")} color={C.red} delay={2} />
            <Stat span={4} label="Defense" value={def} sub={t?.ratios?.defSpa != null ? `${t.ratios.defSpa} per acre` : since("defense")} color={C.cyan} delay={3} />
            <Stat span={4} label="Peasants" value={peasants} sub={pop?.max ? `${fmt(pop.total)} of ${fmt(pop.max)} max pop` : since("peons")} color={C.green} delay={4} />
            <Stat span={4} label="Build efficiency" value={buildEff} text={buildEff != null ? pct(buildEff, 0) : "—"} sub={s?.economy?.employment != null ? `${pct(s.economy.employment, 0)} employment` : undefined} color={C.amber} delay={5} />
          </Grid>

          <Grid>
            <Panel span={7} title="PROVINCE OVER TIME" sub="Each throne visit adds a point" delay={1}>
              <LineChart height={230} series={[seriesFrom(history, "networth", "Networth", C.violet, compact), seriesFrom(history, "offense", "Offense", C.red, compact), seriesFrom(history, "defense", "Defense", C.cyan, compact)]} />
            </Panel>
            <Panel span={5} title="NEEDS ATTENTION" sub="Worked out from your latest numbers" delay={2}
              right={<Tag color={alerts.some((a) => a.level === "bad") ? C.red : alerts.length ? C.amber : C.green}>{alerts.length ? `${alerts.length} ITEM${alerts.length === 1 ? "" : "S"}` : "ALL CLEAR"}</Tag>}>
              {alerts.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.035)", borderLeft: `3px solid ${alertColor[a.level]}`, fontSize: 13, lineHeight: 1.45 }}>{a.text}</div>
                  ))}
                </div>
              ) : <Empty title="Nothing needs attention" hint="Food, gold, jobs, spells and readiness all look fine from the latest captures." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={4} title="FORCES" sub={mil?.generals != null ? `${fmt(mil.generals)} generals${mil.horses != null ? ` · ${fmt(mil.horses)} war horses` : ""}` : undefined} delay={1}>
              {army.length ? <HBars items={army} /> : <Empty title="No army data" hint="Open Council → Military or your Throne." />}
            </Panel>
            <Panel span={4} title="POPULATION" sub={pop?.max ? `${fmt(pop.total)} of ${fmt(pop.max)} max` : undefined} delay={2}>
              {popSlices.length ? <Donut slices={popSlices} centerBottom="Population" /> : <Empty title="No state capture" hint="Open Council → State to fill this in." />}
            </Panel>
            <Panel span={4} title="ECONOMY" delay={3}>
              {resources.length ? <HBars items={resources} /> : <Empty title="No resource data" hint="Open your Throne." />}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={label}>DAILY INCOME</div><b style={{ fontSize: 18 }}>{fmt(s?.economy?.dailyIncome)}</b></div>
                <div><div style={label}>DAILY WAGES</div><b style={{ fontSize: 18 }}>{fmt(s?.economy?.dailyWages)}</b></div>
                <div><div style={label}>NET GOLD / DAY</div><b style={{ fontSize: 18, color: netGold && netGold.yesterday < 0 ? C.red : C.green }}>{netGold ? signedFmt(netGold.yesterday) : "—"}</b></div>
                <div><div style={label}>NET FOOD / DAY</div><b style={{ fontSize: 18, color: netFood && netFood.yesterday < 0 ? C.red : C.green }}>{netFood ? signedFmt(netFood.yesterday) : "—"}</b></div>
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={6} title="MILITARY READINESS" sub={mil ? "From Council → Military" : undefined} delay={2}>
              {mil ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 6 }}>
                    <Gauge value={mil.offEff} max={150} label="Offensive eff." text={pct(mil.offEff, 1)} color={C.red} size={130} />
                    <Gauge value={mil.defEff} max={150} label="Defensive eff." text={pct(mil.defEff, 1)} color={C.cyan} size={130} />
                  </div>
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
                    <div style={tile}><div style={label}>OFFENSE AT HOME</div><b style={{ fontSize: 18 }}>{compact(mil.offPoints)}</b></div>
                    <div style={tile}><div style={label}>DEFENSE AT HOME</div><b style={{ fontSize: 18 }}>{compact(mil.defPoints)}</b></div>
                    <div style={tile}><div style={label}>WAGE RATE</div><b style={{ fontSize: 18 }}>{pct(mil.wageRate, 0)}</b></div>
                  </div>
                </>
              ) : <Empty title="No military capture" hint="Open Council → Military with the scraper running." />}
            </Panel>
            <Panel span={6} title="SCIENCE" sub={sciCats.length ? `${fmt(sciCats.reduce((n, c) => n + c.totalBooks, 0))} books across ${sciCats.reduce((n, c) => n + c.scientists, 0)} scientists` : undefined} delay={3}>
              {sciCats.length ? (
                <>
                  <HBars items={sciCats.map((c) => ({ label: c.name, value: c.totalBooks, color: CAT_COLOR[c.name] || C.cyan, text: `${fmt(c.totalBooks)} books` }))} />
                  <div style={{ ...label, margin: "12px 0 4px" }}>STRONGEST EFFECTS</div>
                  <HBars max={Math.max(10, ...topSciences.map((x) => x.effect))} items={topSciences.map((x) => ({ label: x.name, value: x.effect, color: CAT_COLOR[x.cat] || C.cyan, text: `${x.effect > 0 ? "+" : ""}${x.effect.toFixed(1)}%` }))} />
                </>
              ) : <Empty title="No science capture" hint="Open Council → Science." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={6} title="BUILDINGS" sub={bld ? `${fmt(bld.totalAcres)} acres${barren ? ` · ${fmt(barren.qty)} barren` : ""}` : undefined} delay={3}>
              {topBuildings.length ? (
                <>
                  <HBars items={topBuildings.map((r) => ({ label: r.name, value: r.pct, color: C.lime, text: `${r.pct}% · ${fmt(r.qty)}` }))} />
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
                    <div style={tile}><div style={label}>EFFICIENCY</div><b style={{ fontSize: 18 }}>{pct(bld.stats.efficiency, 1)}</b></div>
                    <div style={tile}><div style={label}>JOBS</div><b style={{ fontSize: 18 }}>{fmt(bld.stats.jobs)}</b></div>
                    <div style={tile}><div style={label}>WORKERS</div><b style={{ fontSize: 18 }}>{fmt(bld.stats.workers)}</b></div>
                  </div>
                </>
              ) : <Empty title="No building capture" hint="Open Council → Internal Affairs." />}
            </Panel>
            <Panel span={6} title="ACTIVE SPELLS & RITUAL" delay={4}>
              {t?.ritual && (
                <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: "rgba(177,140,255,.09)", border: "1px solid rgba(177,140,255,.3)" }}>
                  <Tag color={C.violet}>RITUAL</Tag> <b>{t.ritual.name}</b> <span style={{ color: "#8597a8" }}>· {t.ritual.effectiveness}% effective · {t.ritual.days} days left</span>
                </div>
              )}
              {t?.spells?.length ? (
                <HBars max={Math.max(30, ...t.spells.map((x: any) => x.days))} items={t.spells.map((x: any) => ({ label: x.name, value: x.days, color: x.days <= 1 ? C.amber : C.cyan, text: `${x.days} days` }))} />
              ) : <Empty title="No active spells captured" hint="Spells appear on your Throne page." />}
              {t && <div style={{ marginTop: 12, fontSize: 12, color: "#8597a8" }}>Thieves ready {pct(t.thievesReady, 0)} · Wizards ready {pct(t.wizardsReady, 0)}</div>}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="KINGDOM" sub={kd ? `${kd.name ?? ""} (${kd.code ?? ""})${kd.stance ? ` · ${kd.stance}` : ""}` : undefined} delay={4}>
              {kd ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
                    <div style={tile}><div style={label}>PROVINCES</div><b style={{ fontSize: 20 }}>{fmt(kd.totalProvinces)}</b></div>
                    <div style={tile}><div style={label}>TOTAL LAND</div><b style={{ fontSize: 20 }}>{compact(kd.land?.total)}</b>{kd.landRank && <div style={{ fontSize: 11, color: "#8597a8" }}>Rank {kd.landRank.rank} of {fmt(kd.landRank.of)}</div>}</div>
                    <div style={tile}><div style={label}>TOTAL NETWORTH</div><b style={{ fontSize: 20 }}>{compact(kd.networth?.total)}</b>{kd.networthRank && <div style={{ fontSize: 11, color: "#8597a8" }}>Rank {kd.networthRank.rank} of {fmt(kd.networthRank.of)}</div>}</div>
                    <div style={tile}><div style={label}>WARS WON</div><b style={{ fontSize: 20 }}>{fmt(kd.wars?.won)}</b>{kd.wars?.score != null && <div style={{ fontSize: 11, color: "#8597a8" }}>War score {kd.wars.score}</div>}</div>
                    {kd.attitude?.ours && <div style={tile}><div style={label}>OUR ATTITUDE</div><b style={{ fontSize: 20 }}>{kd.attitude.ours.label}</b></div>}
                    {kd.attitude?.theirs && <div style={tile}><div style={label}>THEIR ATTITUDE</div><b style={{ fontSize: 20 }}>{kd.attitude.theirs.label}</b></div>}
                  </div>
                  {kd.provinces?.length > 0 && (
                    <DataTable<any> initialSort="acres" maxHeight={360} columns={[
                      { key: "slot", label: "#", value: (r) => r.slot, align: "right" },
                      { key: "name", label: "PROVINCE", value: (r) => r.name, render: (r) => <span>{r.name}{r.name.toLowerCase() === ownName && <> <Tag color={C.lime}>YOU</Tag></>}{r.monarch && <> <Tag color={C.amber}>MONARCH</Tag></>}{r.online && <> <Tag color={C.green}>ONLINE</Tag></>}</span> },
                      { key: "race", label: "RACE", value: (r) => r.race },
                      { key: "acres", label: "LAND", value: (r) => r.acres, render: (r) => fmt(r.acres), align: "right" },
                      { key: "networth", label: "NETWORTH", value: (r) => r.networth, render: (r) => fmt(r.networth), align: "right" },
                      { key: "nwpa", label: "NW / ACRE", value: (r) => r.nwpa, render: (r) => fmt(r.nwpa), align: "right" },
                    ]} rows={kd.provinces} />
                  )}
                </>
              ) : <Empty title="No kingdom capture" hint="Open Kingdom → Details in Utopia with the scraper running." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="RECENT PROVINCE EVENTS" sub="Attacks, ops and spells against you" delay={5}>
              {events.length ? (
                <DataTable<any> initialSort="at" desc maxHeight={320} columns={[
                  { key: "at", label: "WHEN", value: (r) => new Date(r.at).getTime(), render: (r) => ago(r.at) },
                  { key: "type", label: "EVENT", value: (r) => r.type, render: (r) => <Tag color={r.acres < 0 ? C.red : C.cyan}>{String(r.type).replace(/_/g, " ").toUpperCase()}</Tag> },
                  { key: "who", label: "FROM → TO", value: (r) => r.attacker || "", render: (r) => `${r.attacker || "—"} → ${r.defender || r.targetKingdom || "—"}` },
                  { key: "acres", label: "ACRES", value: (r) => r.acres, render: (r) => signedFmt(r.acres), align: "right" },
                  { key: "troops", label: "TROOPS LOST", value: (r) => r.troops, render: (r) => fmt(r.troops), align: "right" },
                  { key: "thieves", label: "THIEVES LOST", value: (r) => r.thieves, render: (r) => fmt(r.thieves), align: "right" },
                  { key: "wizards", label: "WIZARDS LOST", value: (r) => r.wizards, render: (r) => fmt(r.wizards), align: "right" },
                ]} rows={events} />
              ) : <Empty title="No recent events" hint="Attacks and ops against you appear here once they are recorded." />}
            </Panel>
          </Grid>

          <details className="sp-details">
            <summary>DATA FRESHNESS</summary>
            <div className="sp-kv">
              {(m?.freshness || []).map((x: any) => <div key={x.label}><span>{x.label}</span><b>{x.at ? ago(x.at) : "no capture"}</b></div>)}
            </div>
            {data.unavailable?.length > 0 && <div style={{ padding: "0 18px 16px", fontSize: 12, color: C.amber }}>Could not load: {data.unavailable.join(", ")}. Try Refresh in a moment.</div>}
          </details>
        </>
      )}
    </Shell>
  );
}
