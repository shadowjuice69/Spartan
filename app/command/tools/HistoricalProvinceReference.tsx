"use client"

import { useState } from "react"

type HistoricalProvince = {
  age_number: number
  province_name: string
  kingdom_code: string | null
  slot: string | null
  last_seen_at: string | null
  archived_at: string
}

const input: React.CSSProperties = { background: "#05080d", border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "10px 12px", color: "#dce7ee", fontSize: 12, minWidth: 0 }
const button: React.CSSProperties = { background: "#d8ff54", color: "#101408", border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 800, fontSize: 11, cursor: "pointer" }

export default function HistoricalProvinceReference() {
  const [query, setQuery] = useState("")
  const [age, setAge] = useState("")
  const [records, setRecords] = useState<HistoricalProvince[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function search() {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (age.trim()) params.set("age", age.trim())
      const response = await fetch("/api/history/reference?" + params.toString(), { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Historical lookup failed.")
      setRecords(data.records || [])
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Historical lookup failed.")
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ padding: 20, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, background: "#081119" }}>
      <h2 style={{ marginTop: 0 }}>Historical province reference</h2>
      <p style={{ fontSize: 12, color: "#aeb9c5", marginTop: 0 }}>
        Search archived province names from previous ages. These records are historical references only and never replace a province's current identity.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 100px auto", gap: 8 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") search() }} placeholder="Province name (e.g. Daddy Long Legs)" aria-label="Historical province name" style={input} />
        <input value={age} onChange={e => setAge(e.target.value)} inputMode="numeric" placeholder="Age (any)" aria-label="Age number" style={input} />
        <button onClick={search} disabled={loading} style={{ ...button, opacity: loading ? .6 : 1 }}>{loading ? "SEARCHING…" : "SEARCH"}</button>
      </div>
      {error && <p role="alert" style={{ color: "#ff9b9b", fontSize: 12 }}>{error}</p>}
      {searched && !error && <p style={{ color: "#8993a1", fontSize: 11 }}>{records.length} historical reference{records.length === 1 ? "" : "s"} found{records.length === 100 ? " (showing first 100)" : ""}.</p>}
      {searched && !error && records.length === 0 && <p style={{ color: "#8993a1", fontSize: 12 }}>No archived province names matched that search.</p>}
      {records.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
            <thead><tr style={{ color: "#8993a1" }}>{["Province", "Age", "Kingdom", "Last seen"].map(label => <th key={label} style={{ padding: "9px 8px", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 10, letterSpacing: ".08em" }}>{label.toUpperCase()}</th>)}</tr></thead>
            <tbody>{records.map((record, i) => <tr key={record.age_number + ":" + record.province_name + ":" + i}>
              <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.06)", color: "#e7eef5", fontWeight: 700 }}>{record.province_name}<div style={{ color: "#718091", fontSize: 10, fontWeight: 400 }}>Archived reference</div></td>
              <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{record.age_number}</td>
              <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{record.kingdom_code || "—"}</td>
              <td style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{record.last_seen_at ? new Date(record.last_seen_at).toLocaleDateString() : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {!searched && <p style={{ fontSize: 11, color: "#718091", marginBottom: 0 }}>Search a name or leave it blank to browse archived province references.</p>}
    </section>
  )
}
