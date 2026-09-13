"use client";

import { useEffect, useState } from "react";

type WelcomeIdentity = { firstLogin?: boolean; identity?: { screenName?: string | null } };

export default function WelcomeIdentityPrompt() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch("/api/welcome", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as WelcomeIdentity | null;
        if (!response.ok || !data || !mounted) return;
        const existing = data.identity?.screenName?.trim() || "";
        // First entry must always ask the user for their preferred Spartan name,
        // even if an older/default name was already attached to the account.
        if (data.firstLogin || !existing) {
          setName(existing);
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function save() {
    const value = name.trim();
    if (!value) {
      setError("Enter a name or call sign for Spartan to use.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/welcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screenName: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save your name.");
      setOpen(false);
      window.dispatchEvent(new CustomEvent("spartan:identity-updated", { detail: { screenName: value } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your name.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="spartan-name-title" style={{ position: "fixed", inset: 0, zIndex: 1400, display: "grid", placeItems: "center", padding: 18, background: "rgba(2,6,12,.86)", backdropFilter: "blur(10px)" }}>
      <section style={{ width: "min(520px, 94vw)", padding: 32, border: "1px solid rgba(216,255,84,.32)", borderRadius: 20, background: "#071018", boxShadow: "0 30px 100px rgba(0,0,0,.7)" }}>
        <div style={{ color: "#d8ff54", fontSize: 10, fontWeight: 900, letterSpacing: ".2em" }}>SPARTAN // FIRST ENTRY</div>
        <h1 id="spartan-name-title" style={{ margin: "10px 0 8px", fontSize: 30, color: "#edf5f8" }}>What would you like Spartan to call you?</h1>
        <p style={{ margin: "0 0 24px", color: "#9eafbc", lineHeight: 1.6 }}>This is your personal Spartan call sign. We&apos;ll use it when welcoming you back and throughout your command experience.</p>
        <label style={{ display: "block", color: "#71818e", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 8 }}>YOUR SPARTAN NAME</label>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); }} maxLength={40} placeholder="e.g. Commander, Riven, Shadow..." style={{ width: "100%", padding: "14px 15px", borderRadius: 10, border: "1px solid rgba(216,255,84,.25)", background: "rgba(255,255,255,.04)", color: "#edf5f8", outline: "none", fontSize: 15 }} />
        {error && <div role="alert" style={{ marginTop: 10, color: "#ff8d8d", fontSize: 12 }}>{error}</div>}
        <button type="button" disabled={saving} onClick={() => void save()} style={{ width: "100%", marginTop: 18, padding: "13px 16px", borderRadius: 10, border: "1px solid rgba(216,255,84,.45)", background: "rgba(216,255,84,.1)", color: "#d8ff54", fontWeight: 900, letterSpacing: ".1em", cursor: saving ? "wait" : "pointer" }}>
          {saving ? "SAVING..." : "ENTER SPARTAN →"}
        </button>
      </section>
    </div>
  );
}
