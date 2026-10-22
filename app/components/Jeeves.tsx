"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NumberValue = number | null;

type Briefing = {
  ok: true;
  firstArrival: boolean;
  historyAvailable: boolean;
  briefingId: string;
  summary: string;
  jeeves: {
    preferredName: string;
    lastBriefingAt: string | null;
    briefingCount: number;
  };
  identity: {
    screenName: string;
    provinceName: string;
    provinceLocation: string | null;
    kingdom: string | null;
    race: string | null;
    personality: string | null;
    lastLoginAt: string | null;
    currentLoginAt: string | null;
  };
  latest: Record<string, NumberValue>;
  changes: Record<string, NumberValue>;
  away: {
    since: string;
    eventCount: number;
    troopsLost: NumberValue;
    thievesLost: NumberValue;
    wizardsLost: NumberValue;
    alerts: string[];
  };
};

type Handover = {
  ok: boolean;
  checkedAt: string;
  deployment: { service: string; deployedSha: string | null; mainSha: string | null; matchesMain: boolean };
  proposals: { number: number; title: string; url: string; updatedAt: string; headSha: string | null; draft: boolean; labels: string[] }[];
  proposalSearchComplete: boolean;
  issues: { id: string; subsystem: string; endpoint: string; severity: string; message: string; lastDetectedAt: string | null; occurrences: number; commitSha: string | null }[];
  issueSearchComplete: boolean;
  sourceStatus: Record<string, string>;
  warnings: string[];
  summary: string;
  approvalGate: { enforced: boolean; note: string };
};

const LOGIN_KEY = "spartan.jeeves.login.v3";

function formatNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "—";
}

function formatChange(value: NumberValue): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

export default function Jeeves() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [handover, setHandover] = useState<Handover | null>(null);
  const [handoverError, setHandoverError] = useState("");
  const [copyLabel, setCopyLabel] = useState("COPY SESSION HANDOVER FOR CHATGPT");
  const loaded = useRef<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;
    // Greet once per login. The layout stays mounted across in-app navigation, so one check per page load is enough.
    if (loaded.current) return;
    loaded.current = "checked";

    const cancelled = false as boolean; // the layout never unmounts, so keep the result even if the route changes mid-request

    async function fetchBriefing() {
      const response = await fetch("/api/welcome", {
        method: "GET",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Jeeves could not reach the Spartan data core.");
      }
      if (result.ok !== true || !result.briefingId) {
        throw new Error("Jeeves returned an incomplete briefing.");
      }
      return result;
    }

    async function fetchPeek() {
      const response = await fetch("/api/welcome?peek=1", {
        method: "GET",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "Jeeves could not reach the Spartan data core.");
      }
      return result as { userId: string; loginAt: string | null; firstArrival: boolean };
    }

    async function loadBriefing() {
      try {
        let peek;
        try {
          peek = await fetchPeek();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 900));
          peek = await fetchPeek();
        }
        if (cancelled) return;

        // Already greeted for this login (and the name intro is done): skip the full briefing request.
        const greetedKey = `${peek.userId}:${peek.loginAt ?? "none"}`;
        if (!peek.firstArrival && window.localStorage.getItem(LOGIN_KEY) === greetedKey) return;

        let result;
        try {
          result = await fetchBriefing();
        } catch (firstAttemptError) {
          // Right after the OAuth redirect lands on this page, the auth
          // session cookie can occasionally not be fully settled yet for
          // the very first request. Retry once after a short delay before
          // giving up, instead of silently failing until a manual refresh.
          await new Promise((resolve) => setTimeout(resolve, 900));
          result = await fetchBriefing();
        }
        if (cancelled) return;

        const next = result as Briefing;
        setBriefing(next);
        setName(next.jeeves.preferredName || "");
        setError("");

        window.localStorage.setItem(LOGIN_KEY, greetedKey);
        setOpen(true);
        void loadHandover();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Jeeves could not load your briefing.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBriefing();
  }, [pathname]);

  async function loadHandover() {
    try {
      const response = await fetch("/api/jeeves/handover", { cache: "no-store", headers: { accept: "application/json" } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Session handover unavailable.");
      setHandover(result as Handover);
      setHandoverError("");
    } catch (cause) {
      setHandoverError(cause instanceof Error ? cause.message : "Session handover unavailable.");
    }
  }

  async function copyHandover() {
    if (!handover?.summary) return;
    try {
      await navigator.clipboard.writeText(handover.summary);
      setCopyLabel("COPIED — PASTE INTO CHATGPT");
    } catch {
      setCopyLabel("COPY BLOCKED — OPEN HANDOVER API");
    }
  }

  async function introduce() {
    const preferredName = name.trim().replace(/\s+/g, " ");
    if (!preferredName) {
      setError("Tell Jeeves what you would like to be called.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/welcome", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ screenName: preferredName }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Jeeves could not save your name.");

      setBriefing((current) => current ? {
        ...current,
        firstArrival: false,
        identity: { ...current.identity, screenName: preferredName },
        jeeves: { ...current.jeeves, preferredName },
      } : current);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jeeves could not save your name.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !open || !briefing) {
    if (!loading && error) {
      return <div className="jeeves-error-toast" role="status"><strong>JEEVES // DATA CORE</strong><span>{error}</span></div>;
    }
    return null;
  }

  const firstArrival = briefing.firstArrival;
  const identity = briefing.identity;
  const latest = briefing.latest;
  const away = briefing.away;

  return (
    <div className="jeeves-overlay" role="dialog" aria-modal="true" aria-label="Jeeves personal steward">
      <section className="jeeves-card">
        <button className="jeeves-close" type="button" onClick={() => setOpen(false)} aria-label="Close Jeeves">×</button>

        <header className="jeeves-header">
          <div className="jeeves-avatar">J</div>
          <div>
            <div className="jeeves-kicker">SPARTAN // PERSONAL STEWARD</div>
            <div className="jeeves-name">Jeeves <span>ONLINE</span></div>
          </div>
        </header>

        <h1>{firstArrival ? "Welcome to Spartan." : `Welcome back, ${identity.screenName}.`}</h1>
        <p className="jeeves-copy">
          {firstArrival
            ? "I am Jeeves, your personal steward. I will watch your province and keep you informed whenever you return."
            : "I have been watching your province. Here is the latest verified situation from Spartan's recorded state."}
        </p>

        {firstArrival ? (
          <>
            <div className="jeeves-panel">
              <div className="panel-title">FIRST THINGS FIRST</div>
              <p>What would you like me to call you?</p>
              <input
                autoFocus
                value={name}
                maxLength={40}
                placeholder="Your name or call sign"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void introduce(); }}
              />
              {error && <div className="jeeves-error">{error}</div>}
              <button className="jeeves-primary" type="button" disabled={saving} onClick={() => void introduce()}>
                {saving ? "SAVING..." : "INTRODUCE ME TO MY STEWARD →"}
              </button>
            </div>
            <p className="jeeves-note">Your name is saved to your Spartan identity. Future briefings use your real province record.</p>
          </>
        ) : (
          <>
            <div className="jeeves-identity">
              <strong>{identity.provinceName}</strong>
              {identity.provinceLocation && <span>{identity.provinceLocation}</span>}
              {identity.kingdom && <span>Kingdom {identity.kingdom}</span>}
              {identity.race && <span>{identity.race}</span>}
              {identity.personality && <span>{identity.personality}</span>}
            </div>

            {identity.lastLoginAt && (
              <p className="jeeves-away">Previous login: <strong>{new Date(identity.lastLoginAt).toLocaleString()}</strong></p>
            )}

            <div className="jeeves-panel jeeves-summary">
              <div className="panel-title">JEEVES' SITUATION SUMMARY</div>
              <p>{briefing.summary}</p>
            </div>

            <div className="jeeves-panel" style={{ borderColor: "rgba(216,255,84,.25)" }}>
              <div className="panel-title">SPARTAN SESSION HANDOVER</div>
              <p>Production, pending Jeeves proposals, and open system issues — checked live when you sign in.</p>
              {handoverError && <div className="jeeves-alert">Handover incomplete: {handoverError}. Do not assume the proposal queue is empty.</div>}
              {!handover && !handoverError && <p>Checking GitHub proposals and Spartan diagnostics…</p>}
              {handover && (
                <>
                  <div className="jeeves-grid">
                    <div><small>GITHUB MAIN</small><b style={{ fontSize: 11 }}>{handover.deployment.mainSha ? handover.deployment.mainSha.slice(0, 7) : "UNKNOWN"}</b></div>
                    <div><small>RENDER COMMIT</small><b style={{ fontSize: 11 }}>{handover.deployment.deployedSha ? handover.deployment.deployedSha.slice(0, 7) : "UNKNOWN"}</b></div>
                    <div><small>OPEN PROPOSALS</small><b>{handover.proposalSearchComplete ? handover.proposals.length : "?"}</b></div>
                  </div>
                  <p style={{ fontSize: 11, color: handover.deployment.matchesMain ? "#67f0b0" : "#ffcc85" }}>
                    {handover.deployment.matchesMain ? "Render commit matches GitHub main." : "Render/main commit match is not confirmed — review deployment state."}
                  </p>
                  {!handover.proposalSearchComplete && <div className="jeeves-alert">GitHub proposal check failed. Queue status is unknown.</div>}
                  {handover.proposalSearchComplete && handover.proposals.length === 0 && <p>No open proposals matching the Jeeves proposal title/label convention were found.</p>}
                  {handover.proposals.map((proposal) => (
                    <div key={proposal.number} style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,.07)" }}>
                      <a href={proposal.url} target="_blank" rel="noreferrer" style={{ color: "#d8ff54", fontSize: 12 }}>PR #{proposal.number}: {proposal.title}</a>
                      <div style={{ color: "#ffcc85", fontSize: 9, letterSpacing: ".1em", marginTop: 5 }}>PENDING CHATGPT REVIEW · HEAD {proposal.headSha?.slice(0, 7) || "UNKNOWN"}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, color: "#67f0b0", fontSize: 9, fontWeight: 900, letterSpacing: ".15em" }}>OPEN SYSTEM ISSUES ({handover.issueSearchComplete ? handover.issues.length : "UNKNOWN"})</div>
                  {!handover.issueSearchComplete && <div className="jeeves-alert">Spartan diagnostics could not be checked.</div>}
                  {handover.issueSearchComplete && handover.issues.length === 0 && <p>No open system issues were returned by diagnostics.</p>}
                  {handover.issues.slice(0, 5).map((issue) => (
                    <div key={issue.id} style={{ padding: "8px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                      <div style={{ color: issue.severity === "critical" || issue.severity === "error" ? "#ff9696" : "#ffcc85", fontSize: 10, fontWeight: 800 }}>{issue.severity.toUpperCase()} · {issue.subsystem} {issue.endpoint}</div>
                      <div style={{ color: "#aebcc8", fontSize: 11, marginTop: 4 }}>{issue.message}</div>
                    </div>
                  ))}
                  <div className="jeeves-alert">APPROVAL GATE: NOT YET TECHNICALLY ENFORCED. This report does not block writes, merges, or deployments.</div>
                  {handover.warnings.map((warning, index) => <p key={index} style={{ color: "#ffcc85", fontSize: 10 }}>Source warning: {warning}</p>)}
                  <button className="jeeves-primary" type="button" onClick={() => void copyHandover()}>{copyLabel}</button>
                </>
              )}
            </div>

            <div className="jeeves-panel">
              <div className="panel-title">CURRENT PROVINCE STATE · VERIFIED</div>
              <div className="jeeves-grid">
                {[
                  ["ACRES", latest.acres],
                  ["NETWORTH", latest.networth],
                  ["OFFENSE", latest.offense],
                  ["DEFENSE", latest.defense],
                  ["SOLDIERS", latest.soldiers],
                  ["OFF SPECS", latest.off_specs],
                  ["DEF SPECS", latest.def_specs],
                  ["ELITES", latest.elites],
                  ["THIEVES", latest.thieves],
                  ["WIZARDS", latest.wizards],
                  ["MANA", latest.mana],
                  ["STEALTH", latest.stealth],
                ].map(([label, value]) => (
                  <div key={label as string}><small>{label}</small><b>{formatNumber(value)}</b></div>
                ))}
              </div>
            </div>

            {briefing.historyAvailable && (
              <div className="jeeves-panel">
                <div className="panel-title">CHANGE SINCE PRIOR STATE</div>
                <div className="jeeves-grid">
                  {[
                    ["ACRES", briefing.changes.acres],
                    ["NETWORTH", briefing.changes.networth],
                    ["SOLDIERS", briefing.changes.soldiers],
                    ["OFF SPECS", briefing.changes.off_specs],
                    ["DEF SPECS", briefing.changes.def_specs],
                    ["ELITES", briefing.changes.elites],
                  ].map(([label, value]) => (
                    <div key={label as string}><small>{label}</small><b>{formatChange(value as NumberValue)}</b></div>
                  ))}
                </div>
              </div>
            )}

            <div className="jeeves-panel">
              <div className="panel-title">JEEVES' REPORT</div>
              <p>
                {away.eventCount > 0
                  ? `${away.eventCount} recorded event${away.eventCount === 1 ? "" : "s"} occurred since your previous login.`
                  : "No recorded province events occurred since your previous login. Everything is quiet."}
              </p>
              {away.alerts.map((alert) => <div className="jeeves-alert" key={alert}>⚠ {alert}</div>)}
              {(away.troopsLost != null || away.thievesLost != null || away.wizardsLost != null) && (
                <div className="jeeves-losses">
                  <span>Troops lost: {formatNumber(away.troopsLost)}</span>
                  <span>Thieves lost: {formatNumber(away.thievesLost)}</span>
                  <span>Wizards lost: {formatNumber(away.wizardsLost)}</span>
                </div>
              )}
            </div>

            <button className="jeeves-primary" type="button" onClick={() => setOpen(false)}>ENTER PROVINCE COMMAND →</button>
          </>
        )}
      </section>

      <style>{`
        .jeeves-overlay{position:fixed;inset:0;z-index:1500;display:grid;place-items:center;padding:18px;background:rgba(1,6,12,.88);backdrop-filter:blur(12px)}
        .jeeves-card{position:relative;width:min(700px,95vw);max-height:92vh;overflow:auto;padding:34px;border:1px solid rgba(103,240,176,.28);border-radius:22px;background:linear-gradient(145deg,#08131b,#050b11);box-shadow:0 30px 110px rgba(0,0,0,.72);color:#eaf2f5}
        .jeeves-close{position:absolute;right:18px;top:12px;border:0;background:none;color:#71808c;font-size:28px;cursor:pointer}
        .jeeves-header{display:flex;align-items:center;gap:14px}.jeeves-avatar{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;border:1px solid rgba(216,255,84,.45);background:rgba(216,255,84,.08);color:#d8ff54;font-size:23px;font-weight:900}.jeeves-kicker{font-size:9px;letter-spacing:.2em;color:#67f0b0;font-weight:900}.jeeves-name{margin-top:3px;font-size:14px;font-weight:900;letter-spacing:.08em}.jeeves-name span{margin-left:7px;font-size:8px;color:#67f0b0}
        .jeeves-card h1{margin:25px 0 8px;font-size:clamp(27px,5vw,42px)}.jeeves-copy,.jeeves-away{color:#aebcc8;line-height:1.65}.jeeves-panel{margin-top:18px;padding:20px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(255,255,255,.025)}.jeeves-panel p{color:#b7c4cd;line-height:1.6}.panel-title{color:#67f0b0;font-size:9px;font-weight:900;letter-spacing:.18em}.jeeves-panel input{box-sizing:border-box;width:100%;padding:14px;border-radius:9px;border:1px solid rgba(216,255,84,.28);background:rgba(0,0,0,.2);color:#edf5f8;outline:none;font-size:15px}.jeeves-primary{width:100%;margin-top:15px;padding:14px;border:1px solid rgba(216,255,84,.4);border-radius:9px;background:rgba(216,255,84,.09);color:#d8ff54;font-size:10px;font-weight:900;letter-spacing:.12em;cursor:pointer}.jeeves-primary:disabled{opacity:.55;cursor:wait}.jeeves-error{margin-top:8px;color:#ff9696;font-size:12px}.jeeves-note{margin-top:12px;color:#71808c;font-size:11px;line-height:1.6}.jeeves-identity{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.jeeves-identity strong{color:#d8ff54}.jeeves-identity span{padding:5px 8px;border-radius:7px;background:rgba(255,255,255,.04);color:#91a3af;font-size:11px}.jeeves-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.jeeves-grid div{padding:13px;border-radius:9px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06)}.jeeves-grid small{display:block;color:#71808c;font-size:8px;letter-spacing:.13em}.jeeves-grid b{display:block;margin-top:5px;font-size:18px}.jeeves-summary{border-color:rgba(103,240,176,.18)}.jeeves-alert{margin-top:12px;padding:10px;border-radius:8px;background:rgba(255,141,141,.06);color:#ffb1b1;font-size:12px}.jeeves-losses{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;color:#9eafbc;font-size:11px}.jeeves-error-toast{position:fixed;right:18px;bottom:18px;z-index:1500;display:flex;gap:10px;align-items:center;max-width:min(560px,calc(100vw - 36px));padding:12px 14px;border:1px solid rgba(255,120,120,.3);border-radius:10px;background:rgba(7,13,19,.96);color:#ffb1b1;font:11px Inter,system-ui,sans-serif;box-shadow:0 16px 50px rgba(0,0,0,.45)}.jeeves-error-toast strong{color:#d8ff54;font-size:9px;letter-spacing:.12em}
        @media(max-width:600px){.jeeves-card{padding:24px}.jeeves-grid{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}
