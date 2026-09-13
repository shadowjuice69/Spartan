"use client";

import { useState } from "react";
import Link from "next/link";

const updates = [
  { title: "Personalized Welcome Briefing", detail: "Spartan now recognizes your province and summarizes what changed while you were away.", status: "LIVE" },
  { title: "Live Utopia Clock", detail: "The command clock runs live with a countdown to the next tick.", status: "LIVE" },
  { title: "Wiki Knowledge Layer", detail: "Stewards now carry authoritative Age 116 Wiki context when they process captures.", status: "LIVE" },
  { title: "Lossless Province History", detail: "Province snapshots and event history feed the Command Center trends and briefings.", status: "LIVE" },
  { title: "First-Entry Spartan Name", detail: "On first entry, Spartan asks what you want to be called and saves your personal call sign.", status: "LIVE" },
  { title: "Identity Linking", detail: "Verified Discord identity is used to connect an authenticated account to its known Spartan province.", status: "LIVE" },
];

export default function UpdatesNotice() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open Spartan site updates"
        onClick={() => { setOpen(true); setSeen(true); }}
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 900, border: "1px solid rgba(216,255,84,.35)", background: "rgba(7,16,24,.94)", color: "#d8ff54", borderRadius: 999, padding: "10px 14px", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", cursor: "pointer", boxShadow: "0 12px 35px rgba(0,0,0,.35)", backdropFilter: "blur(10px)" }}
        title="What's new in Spartan"
      >
        ✦ WHAT'S NEW {!seen && <span style={{ display: "inline-block", marginLeft: 6, width: 7, height: 7, borderRadius: "50%", background: "#67f0b0", boxShadow: "0 0 10px #67f0b0" }} />}
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Spartan site updates" style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 18, background: "rgba(2,6,12,.78)", backdropFilter: "blur(8px)" }}>
          <section style={{ width: "min(680px, 94vw)", maxHeight: "82vh", overflow: "auto", border: "1px solid rgba(216,255,84,.25)", borderRadius: 18, background: "#071018", boxShadow: "0 28px 90px rgba(0,0,0,.65)", padding: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <div style={{ color: "#d8ff54", fontSize: 10, fontWeight: 900, letterSpacing: ".18em" }}>SPARTAN // SITE UPDATES</div>
                <h2 style={{ margin: "8px 0 6px", fontSize: 28 }}>What&apos;s new</h2>
                <p style={{ margin: 0, color: "#9eafbc", lineHeight: 1.55 }}>New capabilities are listed here so you know what Spartan has added and what is currently being built.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close updates" style={{ border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "#dce7ee", borderRadius: 9, width: 36, height: 36, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {updates.map((update) => (
                <article key={update.title} style={{ padding: "15px 16px", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <strong style={{ color: "#edf5f8", fontSize: 14 }}>{update.title}</strong>
                    <span style={{ color: update.status === "LIVE" ? "#67f0b0" : "#d8ff54", fontSize: 9, fontWeight: 900, letterSpacing: ".12em" }}>{update.status}</span>
                  </div>
                  <p style={{ margin: "7px 0 0", color: "#9eafbc", fontSize: 12, lineHeight: 1.55 }}>{update.detail}</p>
                </article>
              ))}
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span style={{ color: "#71818e", fontSize: 10 }}>Spartan updates will appear here as features ship.</span>
              <Link href="/" onClick={() => setOpen(false)} style={{ color: "#d8ff54", fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textDecoration: "none" }}>COMMAND CENTER →</Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
