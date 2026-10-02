"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Row = {
  id?: string
  page_kind?: string
  source?: string
  province_name?: string
  kingdom_id?: string
  target_province_id?: string
  target_kingdom_id?: string
  captured_at?: string
  created_at?: string
  visibility?: string
  metrics?: Record<string, any>
  payload?: any
  raw_text?: string
}

const nav = [
  ["Command", "/"],
  ["Kingdom", "/command/kingdom"],
  ["Military", "/command/military"],
  ["Enemy Intel", "/command/enemy-intel"],
  ["War Room", "/command/war-room"],
]

const num = (value: any) => {
  if (value == null) return null
  const n = Number(String(value).replace(/,/g, "").replace(/%/g, ""))
  return Number.isFinite(n) ? n : null
}

function sourceText(r: Row) {
  return [
    r.raw_text,
    JSON.stringify(r.metrics || {}),
    JSON.stringify(r.payload || {}),
  ].filter(Boolean).join(" ")
}

function metric(r: Row, names: string[], regexes: RegExp[] = []) {
  const m = r.metrics || {}
  for (const name of names) {
    const direct = num(m[name] ?? m[name.toLowerCase()] ?? m[name.replaceAll(" ", "_").toLowerCase()])
    if (direct != null) return direct
  }
  const text = sourceText(r)
  for (const re of regexes) {
    const match = text.match(re)
    if (match) {
      const value = num(match[1])
      if (value != null) return value
    }
  }
  return null
}

function timeLabel(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function relative(value?: string) {
  if (!value) return "—"
  const delta = Math.max(0, Date.now() - new Date(value).getTime())
  const mins = Math.floor(delta / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return mins + "m ago"
  const hours = Math.floor(mins / 60)
  return hours + "h " + (mins % 60) + "m ago"
}

function provinceName(r: Row) {
  return r.province_name || r.target_province_id || "Unknown province"
}

function EventIcon({ kind }: { kind?: string }) {
  const icons: Record<string, string> = {
    attack: "⚔",
    military: "◈",
    war: "✦",
    magic: "✧",
    ritual: "◇",
    thievery: "◌",
    aid: "＋",
    exploration: "⌁",
    dragon: "◆",
  }
  return <span>{icons[kind || ""] || "•"}</span>
}

function Sparkline({ values, danger = false }: { values: number[]; danger?: boolean }) {
  if (values.length < 2) {
    return <div style={{ height: 72, display: "grid", placeItems: "center", color: "#667585", fontSize: 9 }}>Awaiting history</div>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const points = values.map((v, i) => {
    const x = 3 + i * 94 / Math.max(1, values.length - 1)
    const y = 58 - ((v - min) / range) * 48
    return x + "," + y
  }).join(" ")
  return (
    <svg viewBox="0 0 100 64" preserveAspectRatio="none" style={{ width: "100%", height: 76 }}>
      <polyline points={points} fill="none" stroke={danger ? "#ff9b66" : "#d8ff54"} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Gauge({ label, value, max, sub }: { label: string; value: number; max: number; sub: string }) {
  const pct = Math.max(0, Math.min(100, max ? value / max * 100 : 0))
  return (
    <div style={{ display: "grid", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 8, color: "#7d8a98", letterSpacing: ".12em" }}>{label}</span>
        <strong style={{ fontSize: 17, color: "#e9f1f7" }}>{value.toLocaleString()}</strong>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "rgba(255,255,255,.055)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#67f0b0,#d8ff54)" }} />
      </div>
      <span style={{ fontSize: 8, color: "#5f6d7b" }}>{sub}</span>
    </div>
  )
}

export default function WarRoomPage() {
  const router = useRouter()
  const [records, setRecords] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)

  const load = async () => {
    try {
      const response = await fetch("/api/intel-data?section=war-room", { cache: "no-store" })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "War Room unavailable")
      setRecords(json.records || [])
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "War Room unavailable")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  const attacks = useMemo(() => records.filter(r => r.page_kind === "attack"), [records])
  const enemy = useMemo(() => records.filter(r => r.visibility === "enemy"), [records])
  const military = useMemo(() => records.filter(r => ["military", "war", "attack"].includes(r.page_kind || "")), [records])
  const hostile = useMemo(() => records.filter(r => ["attack", "thievery", "magic", "ritual", "dragon"].includes(r.page_kind || "")), [records])

  const attackCount = attacks.length
  const enemyProvinces = new Set(enemy.map(provinceName)).size
  const kingdoms = new Set(records.map(r => r.target_kingdom_id || r.kingdom_id).filter(Boolean)).size
  const lastCapture = records[0]?.captured_at || records[0]?.created_at

  const offense = records.reduce((sum, r) => sum + (metric(r, ["offense", "off"], [/(?:offense|off)\s*[:=]?\s*([\d,.]+)/i]) || 0), 0)
  const defense = records.reduce((sum, r) => sum + (metric(r, ["defense", "def"], [/(?:defense|def)\s*[:=]?\s*([\d,.]+)/i]) || 0), 0)
  const kills = records.reduce((sum, r) => sum + (metric(r, ["kills"], [/killed\s+(?:about\s+)?([\d,.]+)/i]) || 0), 0)
  const losses = records.reduce((sum, r) => sum + (metric(r, ["losses"], [/lost\s+([\d,.]+)/i]) || 0), 0)

  const selectedRecord = selected ? records.find(r => r.id === selected) : null
  const latest = records.slice(0, 12)
  const attackTrend = attacks.slice(0, 18).reverse().map((_, i) => i + 1)
  const activityTrend = records.slice(0, 18).reverse().map((r, i) => (r.page_kind === "attack" ? 3 : r.page_kind === "military" ? 2 : 1) + i * 0.15)

  const rows = useMemo(() => {
    const source = filter === "all" ? records : filter === "enemy" ? enemy : filter === "attack" ? attacks : hostile
    return source.slice(0, 30)
  }, [filter, records, enemy, attacks, hostile])

  const card: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,.075)",
    borderRadius: 13,
    background: "linear-gradient(145deg,#0a151e,#071017)",
    boxShadow: "0 14px 40px rgba(0,0,0,.14)",
  }

  return (
    <main style={{ minHeight: "100vh", background: "#05080d", color: "#e7eef5", fontFamily: "Inter,system-ui,sans-serif" }}>
      <header style={{ height: 62, borderBottom: "1px solid rgba(255,255,255,.075)", background: "#071018", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <button onClick={() => router.push("/")} style={{ border: 0, background: "transparent", color: "#d8ff54", fontWeight: 950, letterSpacing: ".2em", fontSize: 13, cursor: "pointer" }}>SPARTAN</button>
          <span style={{ color: "#33424e" }}>/</span>
          <span style={{ fontSize: 9, color: "#8b98a5", letterSpacing: ".16em" }}>WAR ROOM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 8, color: "#67f0b0" }}>● {loading ? "SYNCING" : "LIVE INTEL CORE"}</span>
          <span style={{ fontSize: 8, color: "#5f6d7b" }}>15s refresh</span>
        </div>
      </header>

      <section style={{ maxWidth: 1650, margin: "0 auto", padding: "30px 32px 70px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-end", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".24em" }}>SPARTAN // OPERATIONAL INTELLIGENCE</div>
            <h1 style={{ fontSize: 42, margin: "7px 0 5px", letterSpacing: "-.05em" }}>War Room</h1>
            <p style={{ margin: 0, color: "#81909e", fontSize: 12, maxWidth: 760 }}>The battlefield picture assembled from the canonical Spartan Intel feed. Attacks, military movement, hostile operations, magic and war events in one command view.</p>
          </div>
          <button onClick={() => router.push("/command/kingdom")} style={{ border: "1px solid rgba(216,255,84,.45)", background: "rgba(216,255,84,.06)", color: "#d8ff54", borderRadius: 9, padding: "10px 14px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}>KINGDOM INTELLIGENCE →</button>
        </div>

        {error && <div style={{ ...card, padding: 14, marginBottom: 14, borderColor: "rgba(255,100,100,.25)", color: "#ff9b9b", fontSize: 10 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 9, marginBottom: 12 }}>
          {[
            ["INTEL EVENTS", records.length, "canonical records"],
            ["ATTACK EVENTS", attackCount, "classified attacks"],
            ["HOSTILE PROVINCES", enemyProvinces, "observed targets"],
            ["TARGET KDS", kingdoms, "kingdoms in feed"],
            ["OFFENSE", offense, "captured signal"],
            ["DEFENSE", defense, "captured signal"],
          ].map(([label, value, sub]) => (
            <article key={String(label)} style={{ ...card, padding: 14 }}>
              <div style={{ fontSize: 7, color: "#667585", letterSpacing: ".15em" }}>{label}</div>
              <strong style={{ display: "block", fontSize: 23, marginTop: 6, color: label === "ATTACK EVENTS" || label === "HOSTILE PROVINCES" ? "#ffbd66" : "#d8ff54" }}>{Number(value).toLocaleString()}</strong>
              <span style={{ fontSize: 7, color: "#596775" }}>{sub}</span>
            </article>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr .85fr .85fr", gap: 12, marginBottom: 12 }}>
          <article style={{ ...card, padding: 19 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div><div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>BATTLE ACTIVITY</div><h2 style={{ margin: "5px 0 0", fontSize: 20 }}>Operational tempo</h2></div>
              <span style={{ fontSize: 8, color: "#718091" }}>{lastCapture ? relative(lastCapture) : "No captures"}</span>
            </div>
            <Sparkline values={activityTrend} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#596775" }}><span>OLDER</span><span>NEWER</span></div>
          </article>
          <article style={{ ...card, padding: 19 }}>
            <div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>COMBAT BALANCE</div>
            <h2 style={{ margin: "5px 0 15px", fontSize: 20 }}>Force signal</h2>
            <Gauge label="OFFENSE" value={offense} max={Math.max(offense, defense, 1)} sub="sum of captured signals" />
            <div style={{ height: 16 }} />
            <Gauge label="DEFENSE" value={defense} max={Math.max(offense, defense, 1)} sub="sum of captured signals" />
          </article>
          <article style={{ ...card, padding: 19 }}>
            <div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>WAR LEDGER</div>
            <h2 style={{ margin: "5px 0 15px", fontSize: 20 }}>Battle totals</h2>
            <div style={{ display: "grid", gap: 13 }}>
              <div><div style={{ fontSize: 8, color: "#687686" }}>KILLS</div><strong style={{ fontSize: 23, color: "#67f0b0" }}>{kills.toLocaleString()}</strong></div>
              <div><div style={{ fontSize: 8, color: "#687686" }}>LOSSES</div><strong style={{ fontSize: 23, color: "#ff9b66" }}>{losses.toLocaleString()}</strong></div>
              <div><div style={{ fontSize: 8, color: "#687686" }}>RATIO</div><strong style={{ fontSize: 23 }}>{losses ? (kills / losses).toFixed(2) : "—"}</strong></div>
            </div>
          </article>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 12, marginBottom: 12 }}>
          <article style={{ ...card, padding: 19 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div><div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>THREAT MATRIX</div><h2 style={{ margin: "5px 0 0", fontSize: 20 }}>Observed hostile activity</h2></div>
              <span style={{ fontSize: 8, color: "#718091" }}>{enemy.length} enemy signals</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px", gap: 8, padding: "8px 9px", color: "#586675", fontSize: 7, letterSpacing: ".12em" }}>
              <span>PROVINCE</span><span>TYPE</span><span>TIME</span><span>STATUS</span>
            </div>
            {enemy.slice(0, 8).map((r, i) => (
              <button key={r.id || i} onClick={() => setSelected(r.id || null)} style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 110px 110px 90px", gap: 8, padding: "11px 9px", textAlign: "left", border: 0, borderTop: "1px solid rgba(255,255,255,.05)", background: selected === r.id ? "rgba(216,255,84,.055)" : "transparent", color: "#dbe4eb", cursor: "pointer", fontSize: 9 }}>
                <strong>{provinceName(r)}</strong>
                <span style={{ color: "#ffbd66" }}><EventIcon kind={r.page_kind} /> {r.page_kind || "intel"}</span>
                <span style={{ color: "#718091" }}>{timeLabel(r.captured_at || r.created_at)}</span>
                <span style={{ color: "#ff9b66" }}>HOSTILE</span>
              </button>
            ))}
            {!enemy.length && <div style={{ padding: 30, textAlign: "center", color: "#657483", fontSize: 10 }}>No records are currently classified as enemy visibility.</div>}
          </article>

          <article style={{ ...card, padding: 19 }}>
            <div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>ATTACK TEMPO</div>
            <h2 style={{ margin: "5px 0 12px", fontSize: 20 }}>Attack signal</h2>
            <Sparkline values={attackTrend} danger />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#596775", marginBottom: 16 }}><span>OLDER</span><span>NEWER</span></div>
            <div style={{ display: "grid", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#718091" }}>ATTACKS</span><strong style={{ fontSize: 14, color: "#ffbd66" }}>{attackCount}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#718091" }}>COMBAT SIGNALS</span><strong style={{ fontSize: 14 }}>{military.length}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#718091" }}>LAST EVENT</span><strong style={{ fontSize: 10 }}>{lastCapture ? relative(lastCapture) : "—"}</strong></div>
            </div>
          </article>
        </div>

        <article style={{ ...card, padding: 19 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <div><div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>EVENT STREAM</div><h2 style={{ margin: "5px 0 0", fontSize: 20 }}>Latest battlefield intelligence</h2></div>
            <div style={{ display: "flex", gap: 5 }}>
              {[
                ["all", "ALL"],
                ["attack", "ATTACKS"],
                ["enemy", "HOSTILE"],
                ["hostile", "OPERATIONS"],
              ].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} style={{ padding: "7px 9px", borderRadius: 7, border: filter === value ? "1px solid rgba(216,255,84,.45)" : "1px solid rgba(255,255,255,.08)", background: filter === value ? "rgba(216,255,84,.06)" : "transparent", color: filter === value ? "#d8ff54" : "#758391", fontSize: 7, fontWeight: 900, cursor: "pointer" }}>{label}</button>)}
            </div>
          </div>
          {rows.map((r, i) => (
            <button key={r.id || i} onClick={() => setSelected(r.id || null)} style={{ width: "100%", display: "grid", gridTemplateColumns: "105px 1fr 100px", gap: 15, alignItems: "center", padding: "13px 4px", textAlign: "left", border: 0, borderTop: "1px solid rgba(255,255,255,.055)", background: selected === r.id ? "rgba(216,255,84,.035)" : "transparent", color: "#d7e0e7", cursor: "pointer" }}>
              <div><strong style={{ fontSize: 8, color: r.visibility === "enemy" ? "#ffbd66" : "#d8ff54" }}><EventIcon kind={r.page_kind} /> {" "}{(r.page_kind || "intel").toUpperCase()}</strong><div style={{ fontSize: 7, color: "#5f6d7b", marginTop: 4 }}>{r.visibility === "enemy" ? "HOSTILE" : "FRIENDLY"}</div></div>
              <div><div style={{ fontSize: 10, lineHeight: 1.45 }}>{provinceName(r)}{r.target_province_id && r.target_province_id !== provinceName(r) ? " → " + r.target_province_id : ""}</div><div style={{ fontSize: 7, color: "#657483", marginTop: 4 }}>Kingdom {r.target_kingdom_id || r.kingdom_id || "—"} · {r.source || "canonical feed"}</div></div>
              <div style={{ textAlign: "right", fontSize: 8, color: "#718091" }}>{relative(r.captured_at || r.created_at)}</div>
            </button>
          ))}
          {!rows.length && <div style={{ padding: 45, textAlign: "center", color: "#657483", fontSize: 10 }}>No battlefield records match this view.</div>}
        </article>

        {selectedRecord && (
          <article style={{ ...card, marginTop: 12, padding: 20, borderColor: "rgba(216,255,84,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div><div style={{ fontSize: 8, color: "#67f0b0", letterSpacing: ".18em" }}>SELECTED SIGNAL</div><h2 style={{ margin: "5px 0 0", fontSize: 20 }}>{provinceName(selectedRecord)}</h2></div>
              <button onClick={() => setSelected(null)} style={{ border: 0, background: "transparent", color: "#718091", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 9 }}>
              {[
                ["TYPE", selectedRecord.page_kind || "intel"],
                ["VISIBILITY", selectedRecord.visibility || "unknown"],
                ["TARGET", selectedRecord.target_province_id || "—"],
                ["KINGDOM", selectedRecord.target_kingdom_id || selectedRecord.kingdom_id || "—"],
                ["CAPTURED", relative(selectedRecord.captured_at || selectedRecord.created_at)],
              ].map(([label, value]) => <div key={label} style={{ padding: 11, borderRadius: 8, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.055)" }}><div style={{ fontSize: 7, color: "#667585" }}>{label}</div><strong style={{ display: "block", marginTop: 5, fontSize: 10 }}>{value}</strong></div>)}
            </div>
          </article>
        )}
      </section>
    </main>
  )
}
