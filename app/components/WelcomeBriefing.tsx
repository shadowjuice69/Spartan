"use client";

import { useCallback, useEffect, useState } from "react";

type Welcome = {
  firstLogin: boolean;
  identity: { screenName: string; provinceName: string; provinceLocation: string | null; kingdom: string | null; race: string | null; personality: string | null; lastLoginAt: string | null };
  latest: Record<string, unknown> | null;
  changes: Record<string, number | null>;
  away: { since: string; eventCount: number; acresChange: number | null; troopsLost: number | null; thievesLost: number | null; wizardsLost: number | null; alerts: string[] };
};

const fmt = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString()}`;
const stat = (label: string, value: number | null | undefined) => <div className="wb-stat"><span>{label}</span><strong>{fmt(value)}</strong></div>;

export default function WelcomeBriefing() {
  const [data, setData] = useState<Welcome | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (afterIdentity = false) => {
    try {
      const response = await fetch("/api/welcome", { cache: "no-store" });
      if (!response.ok) return;
      const result = (await response.json()) as Welcome;
      // On first entry, the identity prompt must be completed before the
      // briefing opens so the briefing uses the user's chosen call sign.
      if (result.ok !== true) return;
      if (result.firstLogin && !afterIdentity && !result.identity.screenName) return;
      setData(result);
      setOpen(true);
    } catch {
      // Authentication/data may still be settling immediately after login.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/welcome", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(result => {
        if (cancelled || !result?.ok) return;
        if (result.firstLogin) return;
        setData(result);
        setOpen(true);
      })
      .catch(() => {});

    const onIdentityUpdated = () => { void load(true); };
    window.addEventListener("spartan:identity-updated", onIdentityUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("spartan:identity-updated", onIdentityUpdated);
    };
  }, [load]);

  if (!data || !open) return null;
  const d = data.away;
  const i = data.identity;
  const title = data.firstLogin ? `Welcome to Spartan, ${i.screenName}.` : `Welcome back, ${i.screenName}.`;

  return <div className="wb-overlay" role="dialog" aria-modal="true" aria-label="Spartan welcome briefing">
    <div className="wb-card">
      <button className="wb-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
      <div className="wb-kicker">SPARTAN // PERSONAL COMMAND BRIEFING</div>
      <h2>{title}</h2>
      <div className="wb-identity"><strong>{i.provinceName}</strong><span>{i.provinceLocation || "Province location pending"}</span>{i.kingdom && <span>Kingdom {i.kingdom}</span>} {i.race && <span>{i.race}</span>} {i.personality && <span>{i.personality}</span>}</div>
      {!data.firstLogin && i.lastLoginAt && <p className="wb-away">You were last here <strong>{new Date(i.lastLoginAt).toLocaleString()}</strong>. Here’s what changed while you were away.</p>}
      {data.firstLogin && <p className="wb-away">Your province is already connected to your Spartan identity. Here’s the current state of your command.</p>}
      <div className="wb-grid">
        {stat("ACRES", data.changes.acres)}
        {stat("NETWORTH", data.changes.networth)}
        {stat("POPULATION", data.changes.population)}
        {stat("OFFENSE", data.changes.offense)}
        {stat("DEFENSE", data.changes.defense)}
        {stat("MILITARY LOST", d.troopsLost)}
        {stat("THIEVES LOST", d.thievesLost)}
        {stat("WIZARDS LOST", d.wizardsLost)}
      </div>
      <div className="wb-section"><div className="wb-section-title">WHILE YOU WERE AWAY <span>{d.eventCount} EVENTS</span></div><div className="wb-events">
        {d.eventCount ? <><div>⚔ <strong>{d.eventCount}</strong> recorded province events</div><div>▣ <strong>{fmt(d.acresChange)}</strong> acres change from recorded events</div><div>◈ <strong>{fmt(d.troopsLost)}</strong> troops lost</div></> : <div>✓ No recorded events occurred against your province while you were away.</div>}
      </div></div>
      <div className="wb-section"><div className="wb-section-title">SPARTAN ATTENTION</div><div className="wb-alerts">{d.alerts.length ? d.alerts.map((a, n) => <div className="wb-alert" key={n}><i>!</i>{a}</div>) : <div className="wb-good"><i>✓</i> No critical alerts. Your province is being monitored normally.</div>}</div></div>
      <button className="wb-enter" onClick={() => setOpen(false)}>ENTER PROVINCE COMMAND <span>→</span></button>
    </div>
    <style>{`.wb-overlay{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:rgba(1,6,12,.82);backdrop-filter:blur(12px)}.wb-card{position:relative;width:min(760px,96vw);max-height:92vh;overflow:auto;padding:32px;border:1px solid rgba(103,240,176,.28);border-radius:20px;background:linear-gradient(145deg,#08131b,#050b11);box-shadow:0 30px 100px rgba(0,0,0,.65)}.wb-close{position:absolute;right:18px;top:14px;border:0;background:transparent;color:#71808c;font-size:28px;cursor:pointer}.wb-kicker{font-size:10px;letter-spacing:.2em;font-weight:900;color:#67f0b0}.wb-card h2{margin:8px 0 14px;font-size:clamp(24px,4vw,38px);color:#eaf2f5}.wb-identity{display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:#91a3af;font-size:12px}.wb-identity strong{color:#d8ff54;font-size:14px}.wb-identity span{padding:5px 8px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(255,255,255,.025)}.wb-away{margin:22px 0;color:#aebcc8;line-height:1.6}.wb-away strong{color:#e6edf1}.wb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.wb-stat{padding:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);border-radius:10px}.wb-stat span{display:block;font-size:9px;letter-spacing:.13em;color:#71808c}.wb-stat strong{display:block;margin-top:5px;color:#e6edf1;font-size:18px}.wb-section{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.07)}.wb-section-title{display:flex;justify-content:space-between;color:#67f0b0;font-size:10px;font-weight:900;letter-spacing:.15em}.wb-section-title span{color:#71808c}.wb-events,.wb-alerts{display:grid;gap:8px;margin-top:10px;color:#aebcc8;font-size:13px}.wb-events div{padding:10px 12px;background:rgba(255,255,255,.025);border-radius:8px}.wb-alert,.wb-good{padding:10px 12px;border-radius:8px;background:rgba(216,255,84,.05)}.wb-alert i,.wb-good i{display:inline-grid;place-items:center;width:20px;height:20px;margin-right:8px;border-radius:50%;background:rgba(216,255,84,.12);color:#d8ff54;font-style:normal;font-weight:900}.wb-enter{width:100%;margin-top:22px;padding:14px;border:1px solid rgba(216,255,84,.35);border-radius:10px;background:rgba(216,255,84,.08);color:#d8ff54;font-size:11px;font-weight:900;letter-spacing:.12em;cursor:pointer}.wb-enter:hover{background:rgba(216,255,84,.14)}@media(max-width:650px){.wb-card{padding:24px}.wb-grid{grid-template-columns:repeat(2,1fr)}}`}</style>
  </div>;
}
