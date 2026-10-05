"use client"

import { useEffect, useState } from "react"

const card: React.CSSProperties = { padding: 20, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, background: "#081119", marginBottom: 16 }
const input: React.CSSProperties = { background: "#05080d", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, padding: "9px 10px", color: "#dce7ee", fontSize: 13, width: "100%", boxSizing: "border-box" }
const label: React.CSSProperties = { fontSize: 9, color: "#8993a1", letterSpacing: ".12em", display: "block", marginBottom: 4 }
const primary: React.CSSProperties = { background: "#d8ff54", color: "#101408", border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }
const danger: React.CSSProperties = { background: "#ff5d5d", color: "#190606", border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }

type Result = {
  preview: boolean; ending_age: number; new_age: number; archive_schema: string
  rows_before: Record<string, number>; will_clear: string[]
  registry_rows_removed: number; kingdom_rows_removed: number
  steward_logs_pruned: { runs: number; events: number }
  warnings: string[]; archived_rows?: Record<string, number>
}
const short = (t: string) => t.replace(/^spartan_/, "").replace(/_/g, " ")

export default function AgeReset() {
  const [ending, setEnding] = useState("")
  const [next, setNext] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [phrase, setPhrase] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ ending_age: number; new_age: number; created_at: string }[]>([])
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    fetch("/api/admin/age-reset", { cache: "no-store" })
      .then(async (r) => { if (r.status === 403 || r.status === 401) { setDenied(true); return null } return r.json() })
      .then((j) => {
        if (!j) return
        if (j.currentAge) { setEnding(String(j.currentAge)); setNext(String(j.currentAge + 1)) }
        setLog(j.log || [])
      })
      .catch(() => {})
  }, [])

  async function run(confirm: boolean) {
    setBusy(true); setMsg("")
    try {
      const r = await fetch("/api/admin/age-reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endingAge: Number(ending), newAge: Number(next), confirm, phrase }),
      })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error || "Something went wrong."); return }
      setResult(j.result)
      if (confirm) { setPhrase(""); setMsg(`Done. Age ${j.result.ending_age} is archived and Age ${j.result.new_age} is set up.`) }
    } catch { setMsg("Could not reach the server.") } finally { setBusy(false) }
  }

  if (denied) return <main style={{ padding: 24, color: "#dce7ee" }}><h1>Age reset</h1><p>Owner only.</p></main>

  const blocked = !!result?.warnings.some((w) => w.includes("already exists"))
  const ready = !!result && result.preview && !blocked && phrase === `RESET ${next}`

  return (
    <main style={{ padding: 24, color: "#dce7ee", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Age reset</h1>
      <p style={{ fontSize: 12, color: "#aeb9c5" }}>
        Archives the ending age's game data into its own schema, clears the live game tables, trims old steward logs and records the new age. Accounts, devices, builds, rules and the wiki are kept. Preview first; nothing changes until you confirm.
      </p>

      <section style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><span style={label}>ENDING AGE</span><input style={input} inputMode="numeric" value={ending} onChange={(e) => { setEnding(e.target.value); setResult(null) }} /></div>
          <div><span style={label}>NEW AGE</span><input style={input} inputMode="numeric" value={next} onChange={(e) => { setNext(e.target.value); setResult(null) }} /></div>
        </div>
        <button style={{ ...primary, marginTop: 12 }} disabled={busy || !ending || !next} onClick={() => run(false)}>{busy ? "Working…" : "Preview"}</button>
      </section>

      {msg && <p style={{ fontSize: 12, color: msg.startsWith("Done") ? "#67f0b0" : "#ffb35c" }}>{msg}</p>}

      {result && (
        <section style={card}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>{result.preview ? "Preview" : "Completed"}: Age {result.ending_age} → Age {result.new_age}</h3>
          <p style={{ fontSize: 11, color: "#8993a1", margin: "0 0 10px" }}>Archive goes to the <b>{result.archive_schema}</b> schema in Supabase.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 14px", fontSize: 12 }}>
            {Object.entries(result.archived_rows || result.rows_before).map(([t, c]) => [
              <span key={t}>{short(t)}{result.will_clear.includes(t) ? "" : " (archived only)"}</span>,
              <b key={t + "n"} style={{ textAlign: "right" }}>{Number(c).toLocaleString()}</b>,
            ])}
          </div>
          <p style={{ fontSize: 11, color: "#aeb9c5", margin: "12px 0 0" }}>
            Also removed: {result.registry_rows_removed} unlinked province rows, {result.kingdom_rows_removed} kingdom rows, and steward logs older than 7 days ({result.steward_logs_pruned.runs} runs, {result.steward_logs_pruned.events} events).
          </p>
          {result.warnings.map((w) => <p key={w} style={{ fontSize: 11, color: "#ffb35c", margin: "8px 0 0" }}>{w}</p>)}

          {result.preview && !blocked && (
            <div style={{ marginTop: 14 }}>
              <span style={label}>TYPE  RESET {next}  TO CONFIRM</span>
              <input style={input} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={`RESET ${next}`} autoCapitalize="characters" />
              <button style={{ ...(ready ? danger : { ...danger, opacity: 0.4 }), marginTop: 10 }} disabled={!ready || busy} onClick={() => run(true)}>
                Archive Age {ending} and start Age {next}
              </button>
            </div>
          )}
        </section>
      )}

      {log.length > 0 && (
        <p style={{ fontSize: 10, color: "#687686" }}>
          Previous resets: {log.map((l) => `Age ${l.ending_age} → ${l.new_age} (${new Date(l.created_at).toLocaleDateString()})`).join(", ")}
        </p>
      )}
    </main>
  )
}