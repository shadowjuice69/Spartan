"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { logout } from "./login/actions";
import JeevesSummary from "@/components/spartan/JeevesSummary";
import { getCommandIntel } from "@/lib/spartan/client-intel-cache";

type Snapshot = {
  observed_at: string;
  province_name?: string;
  kingdom_id?: string | null;
  acres: number | null;
  networth: number | null;
  population: number | null;
  soldiers: number | null;
  off_specs: number | null;
  def_specs: number | null;
  elites: number | null;
  thieves: number | null;
  wizards: number | null;
  offense: number | null;
  defense: number | null;
  mana: number | null;
  build_efficiency: number | null;
};

type History = { snapshots: Snapshot[]; events: Array<{ id: number; occurred_at: string; event_type: string; raw_text?: string | null }>; identity?: { provinceName?: string | null; kingdomId?: string | null } };
type Clock = { chicagoTime: string; chicagoDate: string; utopia: { year: number; month: number; day: number; tick: number }; nextTickAt: string; nextYearLabel: string; ticksUntilNextYear: number; sync: boolean; anchorGameDate?: string; anchorCapturedAt?: string };

const navCommand = [
  ["Command", "/"], ["Province", "/command/province"], ["War Room", "/command/war-room"],
  ["Build Lab", "/command/build-lab"], ["Draft Calc", "/command/draft-calc"], ["Wiki", "/command/wiki"], ["Tools", "/command/tools"],["Scraper Generator","/command/scraper"],
] as const;
const navIntel = [
  ["Intel", "/command/intel"], ["Kingdom", "/command/kingdom"], ["Military", "/command/military"], ["Magic", "/command/magic"], ["Thievery", "/command/thievery"],
  ["Science", "/command/science"], ["Buildings", "/command/buildings"], ["Throne", "/command/throne"], ["Enemy Intel", "/command/enemy-intel"],
] as const;
const months = ["January", "February", "March", "April", "May", "June", "July"];

function fmt(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString() : "—"; }
function shortTime(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function intelSummary(row:any) { const p=row?.payload; if(!p || typeof p!=="object") return "Classified intelligence record"; const preferred=["summary","title","spell","spellName","operation","op","attacker","target","category","science","building","province","event_type","attackType","result"]; for(const key of preferred){const v=p[key]; if(v!==undefined&&v!==null&&v!=="") return String(v)} return Object.entries(p).slice(0,3).map(([k,v])=>`${k.replaceAll("_"," ")}: ${String(v)}`).join(" · ") || "Classified intelligence record"; }

export default function Home() {
  const [history, setHistory] = useState<History | null>(null);
  const [clock, setClock] = useState<Clock | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [kingdom, setKingdom] = useState<any>(null);
  const [enemy, setEnemy] = useState<any>(null);
  const [latestIntel, setLatestIntel] = useState<any>(null);

  async function load() {
    try {
      const [intel, t] = await Promise.all([
        getCommandIntel(),
        fetch("/api/time", { cache: "no-store", headers: { accept: "application/json" } }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Utopia clock unavailable"); return d; }),
      ]);
      const [h, k, e, i] = intel;
      setHistory(h); setClock(t); setKingdom(k); setEnemy(e); setLatestIntel(i); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Command Center data unavailable"); }
  }

  useEffect(() => { load(); const refresh = setInterval(load, 20000); const seconds = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(refresh); clearInterval(seconds); }; }, []);

  const latest = history?.snapshots?.at(-1);
  const previous = history?.snapshots?.at(-2);
  const delta = (key: keyof Snapshot) => { const a = Number(latest?.[key]); const b = Number(previous?.[key]); return Number.isFinite(a) && Number.isFinite(b) ? `${a - b >= 0 ? "+" : ""}${(a - b).toLocaleString()}` : "—"; };
  const countdown = clock ? shortTime(Date.parse(clock.nextTickAt) - now) : "--:--:--";
  const gameDate = clock?.utopia ? `${months[clock.utopia.month - 1]} ${clock.utopia.day}, YR${clock.utopia.year}` : "SYNCING…";
  const chart = useMemo(() => (history?.snapshots || []).map(s => Number(s.acres)).filter(Number.isFinite), [history]);
  const max = Math.max(...chart, 1), min = Math.min(...chart, max);
  const intelRecords = latestIntel?.records || [];
  const intelCounts = latestIntel?.counts || {};
  const latestByKind = (kind: string) => intelRecords.find((r:any) => r.page_kind === kind) || null;

  return <main className="shell">
    <aside className="side">
      <div className="brand"><b>S</b><div><strong>SPARTAN</strong><small>UTOPIA COMMAND</small></div></div>
      <div className="label">COMMAND SYSTEMS</div>
      {navCommand.map(([name, path]) => <Link key={name} href={path} className={name === "Command" ? "nav active" : "nav"}>{name}{name === "Command" && <em>LIVE</em>}</Link>)}
      <div className="label">INTEL DATA</div>
      {navIntel.map(([name, path]) => <Link key={name} href={path} className="nav">{name}</Link>)}
      <div className="online"><i/> <div><strong>DATA CORE ONLINE</strong><small>Persistent capture storage</small></div></div>
    </aside>

    <section className="main">
      <header><span>SPARTAN / LIVE PROVINCE COMMAND CENTER</span><div><span className="live">● LIVE SYNC</span><form action={logout}><button>LOG OUT ↗</button></form></div></header>
      <div className="content">
        <section className="hero"><div><small>SPARTAN // PROVINCE TELEMETRY</small><h1>{history?.identity?.provinceName || "Province"}</h1><p>Kingdom {history?.identity?.kingdomId || "—"} · {latest ? new Date(latest.observed_at).toLocaleString() : "No capture"}</p></div><div className="clock"><small>UTOPIA GAME DATE</small><strong>{gameDate}</strong><span>TICK {clock?.utopia?.tick ?? "—"} / 24</span><b>NEXT TICK <i>{countdown}</i></b><small>COUNTDOWN · 1 TICK = 1 REAL HOUR</small></div></section>

        <section className="timebar"><div><small>REAL TIME · CHICAGO</small><strong>{clock?.chicagoTime || "—"}</strong><span>{clock?.chicagoDate || "—"} · {clock?.sync ? "SERVER SYNC · LIVE" : "CLOCK OFFLINE"}</span></div><div><small>NEXT YEAR</small><strong>{clock?.nextYearLabel || "—"}</strong><span>{clock ? `${clock.ticksUntilNextYear} game days remaining` : "—"}</span></div><div><small>CLOCK SOURCE</small><strong>{clock?.sync ? "PERSISTENT" : "OFFLINE"}</strong><span>{clock?.anchorGameDate ? `Anchor ${clock.anchorGameDate}` : "No authoritative anchor"}</span></div></section>

        {error && <div className="error">DATA CORE ERROR · {error}<button onClick={load}>RETRY</button></div>}

        <JeevesSummary />

        <section className="pulse">
          <div className="pulse-head"><div><small>SPARTAN // OPERATIONAL PULSE</small><h2>Command health at a glance</h2></div><span className="pulse-live">● LIVE CORE</span></div>
          <div className="pulse-grid">
            <article><small>PROVINCE FEED</small><strong>{latest?.observed_at ? "ONLINE" : "WAITING"}</strong><span>{latest?.observed_at ? `Last capture · ${new Date(latest.observed_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "Waiting for telemetry"}</span></article>
            <article><small>KINGDOM INTEL</small><strong>{kingdom?.latest?.members?.length ? "ONLINE" : "WAITING"}</strong><span>{kingdom?.latest?.members?.length ? `${fmt(kingdom.latest.members.length)} provinces indexed` : "Waiting for kingdom capture"}</span></article>
            <article><small>ENEMY PICTURE</small><strong>{enemy?.provinces?.length ? `${fmt(enemy.provinces.length)} TARGETS` : "CLEAR / WAITING"}</strong><span>{enemy?.count ? `${fmt(enemy.count)} evidence records` : "No classified evidence"}</span></article>
            <article><small>GAME CLOCK</small><strong>{clock?.sync ? "SYNCED" : "OFFLINE"}</strong><span>{clock?.nextTickAt ? `Next tick · ${countdown}` : "Waiting for authoritative clock"}</span></article><article><small>INTEL CORE</small><strong>{intelRecords.length ? "FLOWING" : "WAITING"}</strong><span>{intelRecords.length ? `${fmt(intelRecords.length)} recent classified records` : "Waiting for classified Intel"}</span></article>
          </div>
        </section>

        <section className="intel-grid">
          <Link href="/command/kingdom" className="intel-card">
            <div className="intel-top"><small>KINGDOM INTELLIGENCE</small><b>OPEN →</b></div>
            <strong>{kingdom?.kingdom?.code || history?.identity?.kingdomId || "—"}</strong>
            <span>{kingdom?.latest?.members?.length || 0} kingdom provinces visible</span>
            <div className="intel-metrics"><i>LAND <b>{fmt(kingdom?.latest?.totalLand)}</b></i><i>NETWORTH <b>{fmt(kingdom?.latest?.totalNw)}</b></i><i>CAPTURES <b>{fmt(kingdom?.capturesAvailable)}</b></i></div>
          </Link>
          <Link href="/command/enemy-intel" className="intel-card enemy">
            <div className="intel-top"><small>ENEMY INTELLIGENCE</small><b>OPEN →</b></div>
            <strong>{fmt(enemy?.provinces?.length || 0)} TARGET PROFILES</strong>
            <span>{enemy?.count ? `${fmt(enemy.count)} shared evidence records classified` : "No classified enemy evidence yet"}</span>
            <div className="intel-metrics"><i>KNOWN PROVINCES <b>{fmt(enemy?.provinces?.length || 0)}</b></i><i>RECORDS <b>{fmt(enemy?.count || 0)}</b></i><i>STATUS <b>{enemy?.count ? "LIVE" : "WAITING"}</b></i></div>
          </Link>
          <Link href="/command/province" className="intel-card">
            <div className="intel-top"><small>PROVINCE INTELLIGENCE</small><b>OPEN →</b></div>
            <strong>{latest?.province_name || history?.identity?.provinceName || "YOUR PROVINCE"}</strong>
            <span>{latest?.observed_at ? `Last observation ${new Date(latest.observed_at).toLocaleString()}` : "Waiting for captured province data"}</span>
            <div className="intel-metrics"><i>ACRES <b>{fmt(latest?.acres)}</b></i><i>OFFENSE <b>{fmt(latest?.offense)}</b></i><i>DEFENSE <b>{fmt(latest?.defense)}</b></i></div>
          </Link>
        </section>

        <section className="intel-grid system-grid">{[["MILITARY","/command/military",["military","som","attack","news"],"Military intelligence"],["MAGIC","/command/magic",["magic","ritual","dragon"],"Spells, rituals and dragons"],["THIEVERY","/command/thievery",["thievery"],"Thievery operations"],["SCIENCE","/command/science",["science"],"Science intelligence"],["BUILDINGS","/command/buildings",["survey","buildings"],"Building and survey intelligence"],["THRONE","/command/throne",["throne","province_state"],"Province state intelligence"],["NEWS","/command/news",["news","attack","war"],"News and event intelligence"]].map(([label,href,kinds,sub]:any)=>{const count=(kinds as string[]).reduce((n,k)=>n+Number(intelCounts[k]||0),0);const recent=(kinds as string[]).map(k=>latestByKind(k)).find(Boolean);return <Link key={label} href={href} className="intel-card system-card"><div className="intel-top"><small>{label}</small><b>OPEN →</b></div><strong>{count?fmt(count):"READY"}</strong><span>{count?`${sub} · newest ${new Date(recent?.captured_at||recent?.created_at).toLocaleString()}`:`${sub} · waiting for matching capture`}</span></Link>})}</section><section className="panel latest-feed"><div className="panelhead"><div><small>LIVE INTELLIGENCE</small><h2>Newest classified information</h2></div><Link href="/command/intel" className="feed-link">OPEN INTEL →</Link></div>{intelRecords.length?intelRecords.slice(0,10).map((r:any,i:number)=><Link key={r.id||r.capture_id||i} href="/command/intel" className="feed-row"><time>{r.captured_at?new Date(r.captured_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—"}</time><b>{String(r.page_kind||"intel").toUpperCase()}</b><span>{intelSummary(r)}</span></Link>):<div className="empty feed-empty">No classified Intel is available yet.</div>}</section><section className="stats">
          {[["Acres", latest?.acres, "acres"], ["Networth", latest?.networth, "networth"], ["Peasants", latest?.population, "population"], ["Offense", latest?.offense, "offense"], ["Defense", latest?.defense, "defense"], ["Building Eff.", latest?.build_efficiency, "build_efficiency"]].map(([label, value, key]) => <article key={String(label)}><small>{label}</small><strong>{fmt(value)}</strong><span>{delta(key as keyof Snapshot)}</span></article>)}
        </section>

        <div className="grid">
          <section className="panel"><div className="panelhead"><div><small>HISTORICAL TELEMETRY</small><h2>Province trajectory</h2></div><b>{history?.snapshots?.length || 0} <small>captures</small></b></div>{chart.length > 1 ? <div className="chart">{chart.map((v, i) => <span key={i} style={{ left: `${(i / (chart.length - 1)) * 100}%`, bottom: `${((v - min) / ((max - min) || 1)) * 80 + 10}%` }}/>)}</div> : <div className="empty">Waiting for historical telemetry.</div>}<div className="chartfoot"><span>LOSSLESS CAPTURE HISTORY</span><strong>{fmt(latest?.acres)} ACRES</strong></div></section>
          <section className="panel"><div className="panelhead"><div><small>SYSTEMS</small><h2>Current state</h2></div></div><div className="rows">{[["Military", latest?.offense, latest?.defense], ["Magic", latest?.mana, null], ["Thievery", null, null], ["Buildings", latest?.build_efficiency, null], ["Population", latest?.population, null]].map(([name,a,b]) => <div key={String(name)}><strong>{name}</strong><span>{a == null ? "NO CAPTURED VALUE" : b == null ? fmt(a) : `${fmt(a)} / ${fmt(b)}`}</span></div>)}</div></section>
        </div>

        <section className="panel events"><div className="panelhead"><div><small>RECENT CHANGES</small><h2>Live event stream</h2></div></div>{history?.events?.length ? history.events.map(e => <div className="event" key={e.id}><time>{new Date(e.occurred_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</time><b>{e.event_type}</b><span>{e.raw_text || "Recorded by Spartan history core"}</span></div>) : <div className="empty">No events recorded yet.</div>}</section>
      </div>
    </section>

    <style>{`*{box-sizing:border-box}body{margin:0;background:#05090d;color:#dce7ee;font-family:Inter,system-ui,sans-serif}.shell{min-height:100vh;display:grid;grid-template-columns:240px 1fr;background:radial-gradient(circle at 70% 0%,#10202a 0,#05090d 42%)}.side{border-right:1px solid #1c2a32;padding:24px 14px;display:flex;flex-direction:column;gap:7px}.brand{display:flex;gap:12px;align-items:center;margin:0 8px 28px}.brand>b{width:38px;height:38px;display:grid;place-items:center;border:1px solid #d8ff54;color:#d8ff54;font-size:22px}.brand strong{display:block;letter-spacing:.16em}.brand small,.label,small{color:#7f929e;font-size:10px;letter-spacing:.14em}.label{margin:0 10px 7px}.nav{color:#9eafb9;text-decoration:none;padding:12px 10px;border-radius:7px;font-size:13px;display:flex;justify-content:space-between}.nav:hover,.nav.active{background:#101c23;color:#fff}.nav.active{border-left:2px solid #d8ff54}.nav em{font-size:8px;color:#d8ff54;font-style:normal}.online{margin-top:auto;border:1px solid #1d3430;background:#091613;padding:12px;display:flex;gap:9px}.online i{width:8px;height:8px;border-radius:50%;background:#67f0b0;margin-top:4px}.online strong,.online small{display:block;font-size:9px}.main{min-width:0}header{height:62px;border-bottom:1px solid #18252d;display:flex;align-items:center;justify-content:space-between;padding:0 28px;color:#8ea0ab;font-size:10px;letter-spacing:.12em}header div{display:flex;align-items:center;gap:18px}.live{color:#67f0b0}header button{background:transparent;color:#d8ff54;border:1px solid #33431d;padding:8px 10px;font-size:9px}.content{padding:28px;max-width:1450px;margin:auto}.hero{display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:stretch}.hero h1{font-size:38px;margin:8px 0}.hero p{color:#8496a1}.clock,.timebar,.panel,.stats article,.error{border:1px solid #1b2a33;background:rgba(9,17,23,.9);box-shadow:0 12px 40px #0004}.clock{padding:20px;display:flex;flex-direction:column;gap:7px}.clock strong{font-size:25px;color:#fff}.clock span{color:#d8ff54;font-weight:800}.clock b{margin-top:8px;font-size:10px;letter-spacing:.1em}.clock b i{float:right;color:#d8ff54;font-style:normal;font-size:18px}.timebar{display:grid;grid-template-columns:1fr 1fr 1fr;margin:20px 0;padding:16px}.timebar>div{padding:0 18px;border-right:1px solid #1b2a33}.timebar>div:last-child{border:0}.timebar strong,.timebar span{display:block;margin-top:6px}.timebar strong{font-size:19px;color:#fff}.timebar span{color:#778b97;font-size:11px}.error{padding:12px;color:#ffb4a8;margin-bottom:18px}.error button{float:right;background:none;border:1px solid #633;color:#ffb4a8;padding:5px 9px}.pulse{margin:16px 0 2px;border:1px solid rgba(103,240,176,.16);border-radius:12px;background:linear-gradient(135deg,rgba(103,240,176,.035),rgba(8,17,25,.92));padding:17px}.pulse-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px}.pulse-head h2{margin:6px 0 14px;font-size:17px}.pulse-live{color:#67f0b0;font-size:9px;letter-spacing:.12em}.pulse-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pulse-grid article{padding:12px;border:1px solid #17262e;background:#071016;border-radius:9px;min-width:0}.pulse-grid article strong,.pulse-grid article span{display:block}.pulse-grid article strong{font-size:14px;color:#fff;margin:6px 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pulse-grid article span{font-size:9px;color:#728692;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pulse-grid article small{font-size:8px}.intel-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.intel-card{padding:17px;border:1px solid #1b2a33;background:linear-gradient(145deg,#0a151c,#071016);border-radius:11px;text-decoration:none;color:#dce7ee;min-width:0}.intel-card:hover{border-color:#d8ff54;transform:translateY(-1px)}.intel-card.enemy{border-color:rgba(255,189,102,.25)}.intel-top{display:flex;justify-content:space-between;gap:10px}.intel-top b{font-size:8px;color:#d8ff54}.intel-card strong{display:block;font-size:20px;margin:10px 0 5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.system-grid{margin-top:16px}.system-card{min-height:132px}.latest-feed{margin-top:16px}.feed-link{font-size:9px;color:#d8ff54;text-decoration:none}.feed-row{display:grid;grid-template-columns:70px 110px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid #17252d;text-decoration:none;color:#dce7ee;font-size:11px}.feed-row time{color:#687b86}.feed-row b{color:#d8ff54}.feed-row span{color:#8da0aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.feed-empty{height:120px}.intel-card>span{display:block;color:#7f929e;font-size:10px;min-height:28px}.intel-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px}.intel-metrics i{font-style:normal;font-size:7px;color:#657482;border-top:1px solid #17252d;padding-top:8px}.intel-metrics b{display:block;color:#b9c7d0;font-size:10px;margin-top:3px}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.stats article{padding:18px}.stats article strong{display:block;font-size:24px;margin:8px 0}.stats article span{color:#67f0b0;font-size:11px}.grid{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:16px}.panel{padding:20px}.panelhead{display:flex;justify-content:space-between;align-items:flex-start}.panelhead h2{margin:6px 0 20px;font-size:18px}.panelhead>b{font-size:18px}.chart{height:210px;position:relative;border-bottom:1px solid #24343e;background:repeating-linear-gradient(to bottom,transparent 0,transparent 40px,#15232b 41px)}.chart span{position:absolute;width:7px;height:7px;border-radius:50%;background:#d8ff54;transform:translate(-50%,50%)}.chart span:before{content:"";position:absolute;right:3px;bottom:2px;width:80px;height:1px;background:#d8ff5444;transform:rotate(var(--r,0deg));transform-origin:right}.chartfoot{display:flex;justify-content:space-between;margin-top:12px;color:#728692;font-size:9px}.chartfoot strong{color:#d8ff54}.empty{height:210px;display:grid;place-items:center;color:#607480;font-size:11px}.rows{display:flex;flex-direction:column;gap:4px}.rows div{padding:15px 10px;border-bottom:1px solid #17252d;display:flex;justify-content:space-between}.rows span{color:#8ea1ad;font-size:11px}.events{margin-top:16px}.event{display:grid;grid-template-columns:70px 160px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid #17252d;font-size:11px}.event time{color:#687b86}.event b{color:#d8ff54}.event span{color:#8da0aa}@media(max-width:900px){.shell{grid-template-columns:1fr}.pulse-grid{grid-template-columns:repeat(2,1fr)}.intel-grid{grid-template-columns:1fr}.system-grid{grid-template-columns:repeat(2,1fr)}.feed-row{grid-template-columns:60px 90px 1fr}.side{display:none}.hero,.grid{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.timebar{grid-template-columns:1fr}.timebar>div{border-right:0;border-bottom:1px solid #1b2a33;padding:10px 0}.content{padding:16px}header{padding:0 16px}}`}</style>
  </main>;
}
