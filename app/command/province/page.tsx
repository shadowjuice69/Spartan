"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Data = { ok: boolean; source: string; capturedAt: string | null; throne: Record<string, any> | null; province: Record<string, any> }

const fmt = (v: any) => v == null || v === "" ? "—" : Number.isFinite(Number(v)) ? Number(v).toLocaleString() : String(v)
const pct = (v: any) => v == null || v === "" ? "—" : `${Number(v).toFixed(1)}%`

export default function ProvinceCommand() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/throne", { cache: "no-store" })
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || "Throne data unavailable")
        if (alive) { setData(body); setError("") }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Throne data unavailable") }
    }
    load(); const timer = setInterval(load, 15000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const t = data?.throne || {}
  const p = data?.province || {}
  const troop = t.troops || {}
  const cards = [
    ["LAND", t.land ?? p.acres], ["NETWORTH", t.networth ?? p.nw], ["HONOR", t.honor ?? p.honor],
    ["OFFENSE", t.offense ?? p.off], ["DEFENSE", t.defense ?? p.def], ["BUILD EFF", t.be ?? p.be],
    ["MANA", t.mana ?? p.mana], ["STEALTH", t.stealth ?? p.stlth],
  ]

  return <main className="province-page">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">S</div><div><strong>SPARTAN</strong><span>UTOPIA COMMAND</span></div></div><div className="side-label">COMMAND SYSTEMS</div><nav>{[["⌁","Command","/"],["◈","Province","/command/province"],["⚔","War Room","/command/war-room"],["♜","Military","/command/military"],["✦","Magic","/command/magic"],["◉","Thievery","/command/thievery"],["⌘","Science","/command/science"],["▤","Wiki","/command/wiki"]].map(([icon,name,path]) => <button key={name} className={name === "Province" ? "nav-item active" : "nav-item"} onClick={() => router.push(path)}><span className="nav-icon">{icon}</span>{name}</button>)}</nav><div className="side-status"><div className="pulse-dot"/><div><strong>THRONE FEED ONLINE</strong><span>Live province telemetry</span></div></div></aside>
    <section className="workspace"><header className="topbar"><div className="crumb"><span>SPARTAN</span><i>/</i> THRONE INTELLIGENCE</div><div className="top-actions"><span className="sync"><i/> LIVE SYNC</span><button className="icon-button" onClick={() => router.push("/")}>⌂</button></div></header>
      <div className="content">
        <section className="hero"><div><div className="eyebrow">THRONE // CANONICAL PROVINCE STATE</div><h1>{t.province || p.name || "Province"}</h1><p>{t.ruler ? `Ruler ${t.ruler}` : "Ruler data pending"} <span>·</span> {t.race || p.race || "Race unknown"} <span>·</span> {t.personality || p.personality || "Personality unknown"}</p></div><div className="hero-status"><span className="status-dot"/>{data?.source === "intel_throne" ? " THRONE DATA LIVE" : " PROVINCE FALLBACK"}<small>{data?.capturedAt ? new Date(data.capturedAt).toLocaleString() : "Waiting for capture"}</small></div></section>
        {error && <section className="intel-banner"><div className="intel-symbol">!</div><div className="intel-copy"><strong>THRONE FEED NOTICE</strong><span>{error}</span></div></section>}
        <section className="identity-panel panel"><div><span className="panel-kicker">IDENTITY</span><h2>{t.ruler || p.ruler || "Awaiting throne capture"}</h2><p>{t.kd_code || p.kd_code || "—"} · {t.race || p.race || "—"} · {t.personality || p.personality || "—"}</p></div><div className="identity-meta"><span>DATA SOURCE</span><strong>{data?.source === "intel_throne" ? "INTEL THRONE" : "PROVINCE RECORD"}</strong></div></section>
        <section className="stat-grid">{cards.map(([label,value]) => <article className="stat-card" key={label as string}><span>{label}</span><strong>{fmt(value)}</strong><small>THRONE</small></article>)}</section>
        <section className="main-grid">
          <article className="panel"><div className="panel-head"><div><span className="panel-kicker">MILITARY</span><h2>Forces reported by Throne</h2></div><span className="health-score">LIVE</span></div><div className="force-grid">{[["Soldiers", troop.soldiers ?? p.soldiers],["Off Specs", troop.off_specs ?? p.off_specs],["Def Specs", troop.def_specs ?? p.def_specs],["Elites", troop.elites ?? p.elites],["Thieves", t.thieves ?? p.thieves],["Wizards", t.wizards ?? p.wizards],["War Horses", troop.war_horses ?? p.war_horses],["Prisoners", troop.prisoners ?? p.prisoners]].map(([n,v]) => <div className="force" key={n as string}><span>{n}</span><strong>{fmt(v)}</strong></div>)}</div></article>
          <article className="panel"><div className="panel-head"><div><span className="panel-kicker">RATIOS</span><h2>Operational state</h2></div></div><div className="ratio-list">{[["TPA", t.tpa ?? p.r_tpa],["WPA", t.wpa ?? p.r_wpa],["Wages", t.wages ?? p.wages],["BE", t.be ?? p.be]].map(([n,v]) => <div className="ratio" key={n as string}><span>{n}</span><strong>{n === "BE" || n === "Wages" ? pct(v) : fmt(v)}</strong></div>)}</div><button className="panel-link" onClick={() => router.push("/")}>RETURN TO COMMAND CENTER <span>→</span></button></article>
        </section>
        <section className="panel raw"><div className="panel-head"><div><span className="panel-kicker">CAPTURE STATUS</span><h2>Throne is the source</h2></div><span className="priority">LOSSLESS</span></div><p>Everything on this page is read from the live Throne capture when available. Spartan does not invent missing values; a field shows an em dash until the scraper supplies it.</p></section>
      </div>
    </section>
    <style>{`*{box-sizing:border-box}.province-page{min-height:100vh}.identity-panel{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:18px}.identity-panel h2{margin:8px 0 4px}.identity-panel p{margin:0;color:#91a2b0}.identity-meta{text-align:right}.identity-meta span{display:block;font-size:9px;letter-spacing:.16em;color:#6f8593}.identity-meta strong{display:block;margin-top:6px;color:#67f0b0;font-size:12px}.force-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.force{padding:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025);display:flex;justify-content:space-between}.force span,.ratio span{color:#91a2b0;font-size:11px}.force strong,.ratio strong{color:#eef7f5}.ratio-list{display:grid;gap:2px}.ratio{display:flex;justify-content:space-between;padding:14px 2px;border-bottom:1px solid rgba(255,255,255,.06)}.raw{margin-top:18px}.raw p{color:#9aabb7;line-height:1.7;max-width:900px}.panel{background:rgba(5,13,21,.72);border:1px solid rgba(110,240,190,.12);border-radius:14px;padding:20px}.panel-link{margin-top:18px;width:100%;background:transparent;border:1px solid rgba(216,255,84,.22);color:#d8ff54;padding:12px;font-weight:800;letter-spacing:.08em;cursor:pointer}.panel-link span{float:right}@media(max-width:900px){.identity-panel{align-items:flex-start;flex-direction:column}.identity-meta{text-align:left}.force-grid{grid-template-columns:1fr}.stat-grid{grid-template-columns:repeat(2,1fr)!important}}`}</style>
  </main>
}
