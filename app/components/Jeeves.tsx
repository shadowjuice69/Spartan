"use client";

import { useEffect, useState } from "react";

type Briefing = {
  ok?: boolean;
  firstArrival: boolean;
  historyAvailable?: boolean;
  summary?: string;
  jeeves: { name: string; title: string; preferredName: string; lastBriefingAt: string | null; briefingCount: number };
  identity: { screenName: string; provinceName: string; provinceLocation: string | null; kingdom: string | null; race: string | null; personality: string | null; lastLoginAt: string | null; currentLoginAt?: string | null };
  latest?: Record<string, number | string | null> | null;
  changes: Record<string, number | null>;
  away: { since: string; eventCount: number; acresChange: number | null; troopsLost: number | null; thievesLost: number | null; wizardsLost: number | null; alerts: string[] };
};

const fmt = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString()}`;
const current = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString() : "—"; };
const BRIEFING_LOGIN_KEY = "spartan_jeeves_briefing_login";

export default function Jeeves() {
  const [data, setData] = useState<Briefing | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const response = await fetch("/api/welcome", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your Spartan session has expired. Please sign in again.");
        throw new Error(result.error || "Jeeves could not reach the Spartan data core.");
      }
      if (result.ok !== true) throw new Error(result.error || "Jeeves returned an invalid briefing.");
      const briefing = result as Briefing;
      setData(briefing);
      setName(briefing.jeeves?.preferredName || "");
      setError("");
      const loginMarker = briefing.identity?.currentLoginAt || briefing.identity?.lastLoginAt || briefing.jeeves?.lastBriefingAt || "session";
      const shownForLogin = sessionStorage.getItem(BRIEFING_LOGIN_KEY);
      if (shownForLogin !== loginMarker) { sessionStorage.setItem(BRIEFING_LOGIN_KEY, loginMarker); setOpen(true); } else setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Jeeves could not load your briefing."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function introduce() {
    const value = name.trim().replace(/\s+/g, " ");
    if (!value) { setError("Tell Jeeves what you'd like to be called."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/welcome", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ screenName: value }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Jeeves could not establish your profile.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Jeeves could not establish your profile."); }
    finally { setSaving(false); }
  }

  if (!open || !data) {
    if (loading || !error) return null;
    return <div className="jeeves-status" role="status"><strong>JEEVES // DATA CORE NOTICE</strong><span>{error}</span><button onClick={() => { setLoading(true); void load(); }}>RETRY</button><style>{`.jeeves-status{position:fixed;right:18px;bottom:18px;z-index:1500;display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:min(560px,calc(100vw - 36px));padding:12px 14px;border:1px solid rgba(255,120,120,.3);border-radius:10px;background:rgba(7,13,19,.96);color:#ffb1b1;font:11px Inter,system-ui,sans-serif;box-shadow:0 16px 50px rgba(0,0,0,.45)}.jeeves-status strong{color:#d8ff54;font-size:9px;letter-spacing:.12em}.jeeves-status span{flex:1}.jeeves-status button{border:1px solid rgba(216,255,84,.35);border-radius:7px;background:rgba(216,255,84,.08);color:#d8ff54;padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}`}</style></div>;
  }

  const first = data.firstArrival;
  const hasHistory = data.historyAvailable === true;
  const a = data.away;
  const i = data.identity;
  const s = data.latest || {};
  const title = first ? "Welcome to Spartan." : `Welcome back, ${i.screenName}.`;
  const intro = first ? `I'm Jeeves, your personal steward. I'll watch over your province and keep you informed whenever you return.` : `I've been watching your province while you were away. Here's the situation as I have it.`;

  return <div className="jeeves-overlay" role="dialog" aria-modal="true" aria-label="Jeeves personal steward">
    <section className="jeeves-card">
      <button className="jeeves-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
      <div className="jeeves-head"><div className="jeeves-avatar">J</div><div><div className="jeeves-kicker">SPARTAN // PERSONAL STEWARD</div><div className="jeeves-name">Jeeves <span>ONLINE</span></div></div></div>
      <h1>{title}</h1>
      <p className="jeeves-copy">{intro}</p>

      {first ? <>
        <div className="jeeves-panel"><div className="jeeves-panel-title">FIRST THINGS FIRST</div><p>What would you like me to call you?</p><input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void introduce(); }} maxLength={40} placeholder="Your name or call sign" />{error && <div className="jeeves-error">{error}</div>}<button className="jeeves-primary" disabled={saving} onClick={() => void introduce()}>{saving ? "ESTABLISHING..." : "INTRODUCE ME TO MY STEWARD →"}</button></div>
        <div className="jeeves-note">Once you confirm your name, Jeeves will become your permanent personal steward. He'll prepare your return briefing from the real province history and events Spartan records.</div>
      </> : <>
        <div className="jeeves-identity"><strong>{i.provinceName}</strong><span>{i.provinceLocation || "Location pending"}</span>{i.kingdom && <span>Kingdom {i.kingdom}</span>}{i.race && <span>{i.race}</span>}{i.personality && <span>{i.personality}</span>}</div>
        {i.lastLoginAt && <p className="jeeves-away">Last visit: <strong>{new Date(i.lastLoginAt).toLocaleString()}</strong></p>}

        <div className="jeeves-panel jeeves-summary"><div className="jeeves-panel-title">JEEVES' SITUATION SUMMARY</div><p>{data.summary || `Current province: ${i.provinceName}. Latest recorded state is available below.`}</p></div>

        {!hasHistory ? <div className="jeeves-panel jeeves-live">
          <div className="jeeves-panel-title">CURRENT PROVINCE STATE · LIVE</div><p>Spartan is reporting the latest canonical province state directly.</p>
          <div className="jeeves-state-grid"><div><small>ACRES</small><b>{current(s.acres)}</b></div><div><small>NETWORTH</small><b>{current(s.networth)}</b></div><div><small>OFFENSE</small><b>{current(s.offense)}</b></div><div><small>DEFENSE</small><b>{current(s.defense)}</b></div><div><small>SOLDIERS</small><b>{current(s.soldiers)}</b></div><div><small>OFF SPECS</small><b>{current(s.off_specs)}</b></div><div><small>DEF SPECS</small><b>{current(s.def_specs)}</b></div><div><small>ELITES</small><b>{current(s.elites)}</b></div><div><small>THIEVES</small><b>{current(s.thieves)}</b></div><div><small>WIZARDS</small><b>{current(s.wizards)}</b></div><div><small>MANA</small><b>{current(s.mana)}</b></div><div><small>STEALTH</small><b>{current(s.stealth)}</b></div></div>
        </div> : <div className="jeeves-grid"><div><small>ACRES CHANGE</small><b>{fmt(data.changes.acres)}</b></div><div><small>NETWORTH CHANGE</small><b>{fmt(data.changes.networth)}</b></div><div><small>MILITARY LOST</small><b>{fmt(a.troopsLost)}</b></div><div><small>THIEVES LOST</small><b>{fmt(a.thievesLost)}</b></div><div><small>WIZARDS LOST</small><b>{fmt(a.wizardsLost)}</b></div><div><small>EVENTS</small><b>{a.eventCount}</b></div></div>}

        <div className="jeeves-panel"><div className="jeeves-panel-title">JEEVES' REPORT</div>{a.eventCount ? <p>{a.eventCount} recorded event{a.eventCount === 1 ? "" : "s"} occurred during my watch. I've included the important changes above.</p> : <p>No recorded province events occurred during my watch. Everything is quiet.</p>}{a.alerts.length > 0 && <div className="jeeves-alert">⚠ {a.alerts[0]}</div>}</div>
        <button className="jeeves-primary" onClick={() => setOpen(false)}>ENTER PROVINCE COMMAND →</button>
      </>}
    </section>
    <style>{`.jeeves-overlay{position:fixed;inset:0;z-index:1500;display:grid;place-items:center;padding:18px;background:rgba(1,6,12,.88);backdrop-filter:blur(12px)}.jeeves-card{position:relative;width:min(700px,95vw);max-height:92vh;overflow:auto;padding:34px;border:1px solid rgba(103,240,176,.28);border-radius:22px;background:linear-gradient(145deg,#08131b,#050b11);box-shadow:0 30px 110px rgba(0,0,0,.72);color:#eaf2f5}.jeeves-close{position:absolute;right:18px;top:12px;border:0;background:none;color:#71808c;font-size:28px;cursor:pointer}.jeeves-head{display:flex;align-items:center;gap:14px}.jeeves-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;border:1px solid rgba(216,255,84,.45);background:rgba(216,255,84,.08);color:#d8ff54;font-size:23px;font-weight:900}.jeeves-kicker{font-size:9px;letter-spacing:.2em;color:#67f0b0;font-weight:900}.jeeves-name{margin-top:3px;font-size:14px;font-weight:900;letter-spacing:.08em}.jeeves-name span{margin-left:7px;font-size:8px;color:#67f0b0}.jeeves-card h1{margin:25px 0 8px;font-size:clamp(27px,5vw,42px)}.jeeves-copy,.jeeves-away{color:#aebcc8;line-height:1.65}.jeeves-panel{margin-top:22px;padding:20px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(255,255,255,.025)}.jeeves-panel-title{color:#67f0b0;font-size:9px;font-weight:900;letter-spacing:.18em}.jeeves-panel p{color:#b7c4cd;line-height:1.6}.jeeves-panel input{box-sizing:border-box;width:100%;padding:14px;border-radius:9px;border:1px solid rgba(216,255,84,.28);background:rgba(0,0,0,.2);color:#edf5f8;outline:none;font-size:15px}.jeeves-primary{width:100%;margin-top:15px;padding:14px;border:1px solid rgba(216,255,84,.4);border-radius:9px;background:rgba(216,255,84,.09);color:#d8ff54;font-size:10px;font-weight:900;letter-spacing:.12em;cursor:pointer}.jeeves-primary:hover{background:rgba(216,255,84,.15)}.jeeves-error{margin-top:8px;color:#ff9696;font-size:12px}.jeeves-note{margin-top:12px;color:#71808c;font-size:11px;line-height:1.6}.jeeves-identity{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.jeeves-identity strong{color:#d8ff54}.jeeves-identity span{padding:5px 8px;border-radius:7px;background:rgba(255,255,255,.04);color:#91a3af;font-size:11px}.jeeves-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}.jeeves-grid div{padding:13px;border-radius:9px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06)}.jeeves-grid small,.jeeves-state-grid small{display:block;color:#71808c;font-size:8px;letter-spacing:.13em}.jeeves-grid b,.jeeves-state-grid b{display:block;margin-top:5px;font-size:18px}.jeeves-state-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}.jeeves-state-grid div{padding:12px;border-radius:9px;background:rgba(255,255,255,.025);border:1px solid rgba(103,240,176,.08)}.jeeves-live,.jeeves-summary{border-color:rgba(103,240,176,.18)}.jeeves-alert{margin-top:12px;padding:10px;border-radius:8px;background:rgba(255,141,141,.06);color:#ffb1b1;font-size:12px}@media(max-width:600px){.jeeves-card{padding:24px}.jeeves-grid,.jeeves-state-grid{grid-template-columns:repeat(2,1fr)}}`}</style>
  </div>;
}
