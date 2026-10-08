"use client"

import { useMemo, useState } from "react"
import { compareAges, STATUSES, type Category, type Comparison, type Status } from "@/lib/spartan/age-compare"

const card: React.CSSProperties = { padding: 20, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, background: "#081119" }
const input: React.CSSProperties = { background: "#05080d", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, padding: 10, color: "#dce7ee", fontSize: 12 }
const primary: React.CSSProperties = { background: "#d8ff54", color: "#101408", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 800, fontSize: 11, cursor: "pointer" }
const ghost: React.CSSProperties = { background: "transparent", color: "#aeb9c5", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, padding: "9px 14px", fontSize: 11, cursor: "pointer" }

const COLORS: Record<Status, string> = {
  buff: "#67f0b0",
  nerf: "#ff7b7b",
  changed: "#ffd166",
  added: "#7cc4ff",
  removed: "#9aa5b1",
  unchanged: "#5f6c7a",
}
const NAMES: Record<Status, string> = {
  buff: "Buff",
  nerf: "Nerf",
  changed: "Changed",
  added: "New",
  removed: "Removed",
  unchanged: "Unchanged",
}
const CATEGORIES: Category[] = ["Race", "Personality", "Ritual", "Dragon"]
const CATEGORY_LABEL: Record<Category, string> = { Race: "Races", Personality: "Personalities", Ritual: "Rituals", Dragon: "Dragons" }

function Badge({ status, text }: { status: Status; text?: string }) {
  const c = COLORS[status]
  return (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: c, border: `1px solid ${c}55`, background: `${c}14`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {text ?? NAMES[status]}
    </span>
  )
}

export default function AgeCompare() {
  const [oldAge, setOldAge] = useState("116")
  const [newAge, setNewAge] = useState("117")
  const [oldText, setOldText] = useState("")
  const [newText, setNewText] = useState("")
  const [result, setResult] = useState<Comparison | null>(null)
  const [error, setError] = useState("")
  const [shown, setShown] = useState<Status[]>(["buff", "nerf", "changed", "added", "removed"])
  const [category, setCategory] = useState<Category | "All">("All")
  const [query, setQuery] = useState("")
  const [expandAll, setExpandAll] = useState(false)
  const [version, setVersion] = useState(0)
  const [uploading, setUploading] = useState<"old" | "new" | null>(null)

  function run() {
    setError("")
    if (!oldText.trim() || !newText.trim()) {
      setError("Upload or paste the text for both ages first.")
      return
    }
    try {
      setResult(compareAges(oldText, newText))
    } catch (e) {
      setResult(null)
      setError("Could not read that text: " + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function uploadPdf(which: "old" | "new", file: File) {
    setError("")
    setUploading(which)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/age-compare/pdf", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "PDF could not be read.")
      if (which === "old") setOldText(data.text)
      else setNewText(data.text)
    } catch (e) {
      setError("PDF upload failed: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUploading(null)
    }
  }

  function toggle(s: Status) {
    setShown((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  }

  const visible = useMemo(() => {
    if (!result) return []
    const q = query.trim().toLowerCase()
    return result.entities
      .filter((e) => category === "All" || e.category === category)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .map((e) => ({ e, rows: e.rows.filter((r) => shown.includes(r.status)) }))
      .filter((x) => x.rows.length > 0)
  }, [result, shown, category, query])

  const oldLabel = "Age " + (oldAge || "old")
  const newLabel = "Age " + (newAge || "new")
  const warnings = result ? [...result.oldParsed.warnings.map((w) => `${oldLabel}: ${w}`), ...result.newParsed.warnings.map((w) => `${newLabel}: ${w}`)] : []
  const unrec = result ? [...result.oldParsed.unrecognized.map((w) => `${oldLabel}: ${w}`), ...result.newParsed.unrecognized.map((w) => `${newLabel}: ${w}`)] : []

  return (
    <section style={card}>
      <h2>Age compare</h2>
      <p style={{ fontSize: 12, color: "#aeb9c5", marginTop: 0 }}>
        Paste the rules text for two ages. Races, personalities, rituals and dragons are read, cleaned up and shown side by side with each change marked as a buff or a nerf.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {[
          { label: "Old age", age: oldAge, setAge: setOldAge, text: oldText, setText: setOldText },
          { label: "New age", age: newAge, setAge: setNewAge, text: newText, setText: setNewText },
        ].map((b) => (
          <div key={b.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <label style={{ fontSize: 10, color: "#8993a1" }}>{b.label.toUpperCase()}</label>
              <input value={b.age} onChange={(e) => b.setAge(e.target.value)} inputMode="numeric" aria-label={b.label + " number"} style={{ ...input, width: 64, padding: "5px 8px" }} />
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 7, flexWrap: "wrap" }}>
              <label style={ghost}>
                {uploading === (b.label === "Old age" ? "old" : "new") ? "Reading PDF…" : "Upload PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadPdf(b.label === "Old age" ? "old" : "new", file)
                    e.currentTarget.value = ""
                  }}
                  style={{ display: "none" }}
                />
              </label>
              <span style={{ fontSize: 10, color: "#718091" }}>PDF text is extracted automatically; paste still works too.</span>
            </div>
            <textarea
              value={b.text}
              onChange={(e) => b.setText(e.target.value)}
              placeholder={"Paste the " + b.label.toLowerCase() + " text here"}
              style={{ ...input, width: "100%", boxSizing: "border-box", minHeight: 170, fontFamily: "monospace", resize: "vertical" }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button style={primary} onClick={run}>COMPARE</button>
        <button
          style={ghost}
          onClick={() => {
            setOldText("")
            setNewText("")
            setResult(null)
            setError("")
          }}
        >
          Clear
        </button>
      </div>
      {error && <p style={{ color: "#ff9b9b", fontSize: 12 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: "#8993a1", marginBottom: 8 }}>
            Read {result.oldParsed.entities.length} entries from {oldLabel} and {result.newParsed.entities.length} from {newLabel}.
          </div>

          {warnings.length > 0 && (
            <div style={{ border: "1px solid #ffd16655", background: "#ffd16610", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <b style={{ fontSize: 11, color: "#ffd166" }}>Check these</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11, color: "#dce7ee" }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {unrec.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 11, color: "#ffd166", cursor: "pointer" }}>{unrec.length} lines could not be placed</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11, color: "#aeb9c5" }}>
                {unrec.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
          {result.newParsed.notes.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 11, color: "#7cc4ff", cursor: "pointer" }}>{newLabel} general changes ({result.newParsed.notes.length})</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "#dce7ee" }}>
                {result.newParsed.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </details>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggle(s)}
                aria-pressed={shown.includes(s)}
                style={{ ...ghost, padding: "6px 10px", color: shown.includes(s) ? COLORS[s] : "#5f6c7a", borderColor: shown.includes(s) ? COLORS[s] + "88" : "rgba(255,255,255,.1)" }}
              >
                {NAMES[s]} {result.totals[s]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 14px" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category | "All")} style={input} aria-label="Category">
              <option value="All">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a race, personality..." style={{ ...input, flex: 1, minWidth: 150 }} />
            <button style={ghost} onClick={() => { setExpandAll(true); setVersion((v) => v + 1) }}>Expand all</button>
            <button style={ghost} onClick={() => { setExpandAll(false); setVersion((v) => v + 1) }}>Collapse all</button>
          </div>
          <p style={{ fontSize: 10, color: "#718091", margin: "0 0 10px" }}>
            Buff and nerf are judged by what the number does for the player (a lower cost or lower attack time is a buff). For dragons, buff means the dragon hurts the target less.
          </p>

          {visible.length === 0 && <p style={{ fontSize: 12, color: "#8993a1" }}>Nothing matches the current filters.</p>}

          <div style={{ display: "grid", gap: 10 }}>
            {visible.map(({ e, rows }) => (
              <details key={e.category + e.name + version} open={expandAll} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, background: "#05080d" }}>
                <summary style={{ padding: "10px 12px", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 13 }}>{e.name}</b>
                  <span style={{ fontSize: 10, color: "#718091" }}>{e.category}</span>
                  {e.status === "added" && <Badge status="added" />}
                  {e.status === "removed" && <Badge status="removed" />}
                  {(["buff", "nerf", "changed"] as Status[]).map((s) => (e.counts[s] > 0 ? <Badge key={s} status={s} text={`${e.counts[s]} ${NAMES[s].toLowerCase()}`} /> : null))}
                </summary>
                <div style={{ padding: "0 12px 12px", overflowX: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,1fr) minmax(130px,1.3fr) minmax(130px,1.3fr)", gap: "6px 10px", minWidth: 420, fontSize: 12 }}>
                    <div />
                    <div style={{ fontSize: 10, color: "#8993a1", fontWeight: 700 }}>{oldLabel}</div>
                    <div style={{ fontSize: 10, color: "#8993a1", fontWeight: 700 }}>{newLabel}</div>
                    {rows.map((r, i) => (
                      <RowCells key={i} row={r} />
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function RowCells({ row }: { row: Comparison["entities"][number]["rows"][number] }) {
  const c = COLORS[row.status]
  const cell: React.CSSProperties = { borderTop: "1px solid rgba(255,255,255,.05)", paddingTop: 6, wordBreak: "break-word" }
  return (
    <>
      <div style={{ ...cell, borderLeft: `3px solid ${c}`, paddingLeft: 8 }}>
        <div style={{ color: "#dce7ee" }}>{row.label}</div>
        <div style={{ marginTop: 3, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <Badge status={row.status} />
          {row.delta && <span style={{ fontSize: 10, color: c }}>{row.delta}</span>}
          <span style={{ fontSize: 10, color: "#5f6c7a" }}>{row.group}</span>
        </div>
      </div>
      <div style={{ ...cell, color: row.oldText ? "#c4cdd6" : "#3d4856" }}>{row.oldText ?? "—"}</div>
      <div style={{ ...cell, color: row.newText ? "#e7eef5" : "#3d4856" }}>
        {row.newText ?? "—"}
        {row.note && <div style={{ fontSize: 10, color: "#ffd166", marginTop: 3 }}>{row.note}</div>}
      </div>
    </>
  )
}
