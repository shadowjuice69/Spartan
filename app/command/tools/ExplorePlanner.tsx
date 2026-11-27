"use client"

import { useEffect, useMemo, useState } from "react"
import { planExplore } from "@/lib/spartan/explore-planner"
import { parseBuildText } from "@/lib/spartan/build-parser"

const card: React.CSSProperties = { padding: 20, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, background: "#081119" }
const input: React.CSSProperties = { background: "#05080d", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, padding: "8px 10px", color: "#dce7ee", fontSize: 12, width: "100%", boxSizing: "border-box" }
const label: React.CSSProperties = { fontSize: 9, color: "#8993a1", letterSpacing: ".12em", display: "block", marginBottom: 4 }
const ghost: React.CSSProperties = { background: "transparent", color: "#aeb9c5", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, padding: "8px 12px", fontSize: 11, cursor: "pointer" }
const h3: React.CSSProperties = { fontSize: 11, color: "#67f0b0", letterSpacing: ".12em", margin: "22px 0 10px" }
const th: React.CSSProperties = { textAlign: "right", fontSize: 9, color: "#8993a1", letterSpacing: ".1em", padding: "6px 8px", fontWeight: 600 }
const td: React.CSSProperties = { textAlign: "right", fontSize: 12, padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,.06)", color: "#dce7ee" }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }

type Build = { id: string; name: string; race: string | null; personality: string | null }
const fmt = (n: number) => Math.round(n).toLocaleString("en-US")

function Field({ name, value, set, hint }: { name: string; value: string; set: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label style={label}>{name}</label>
      <input style={input} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
      {hint && <div style={{ fontSize: 10, color: "#6b7886", marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

export default function ExplorePlanner() {
  const [builds, setBuilds] = useState<Build[]>([])
  const [buildId, setBuildId] = useState("")
  const [target, setTarget] = useState<Record<string, number>>({})
  const [buildName, setBuildName] = useState("")
  const [pasteBuild, setPasteBuild] = useState("")
  const [current, setCurrent] = useState<Record<string, number>>({})
  const [pasteCurrent, setPasteCurrent] = useState("")
  const [msg, setMsg] = useState("")

  const [acres, setAcres] = useState("100")
  const [hours, setHours] = useState("72")
  const [batches, setBatches] = useState("3")
  const [exploreTicks, setExploreTicks] = useState("12")
  const [buildTicks, setBuildTicks] = useState("12")
  const [goldPer, setGoldPer] = useState("")
  const [soldPer, setSoldPer] = useState("")
  const [buildPer, setBuildPer] = useState("")
  const [growth, setGrowth] = useState("0")
  const [maxPer, setMaxPer] = useState("")
  const [gold, setGold] = useState("")
  const [soldiers, setSoldiers] = useState("")
  const [goldHr, setGoldHr] = useState("")
  const [soldHr, setSoldHr] = useState("")

  useEffect(() => {
    fetch("/api/builds", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (Array.isArray(j?.builds)) setBuilds(j.builds) })
      .catch(() => {})
  }, [])

  async function pickBuild(id: string) {
    setBuildId(id)
    if (!id) return
    try {
      const r = await fetch(`/api/builds/${id}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setTarget(j.build?.buildings || {})
      setBuildName(j.build?.name || "")
      setMsg("")
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not load that build.") }
  }

  async function loadBuildings() {
    try {
      const r = await fetch("/api/page-models?page=buildings", { cache: "no-store" })
      const j = await r.json()
      const rows: Array<{ name: string; qty: number }> = j?.model?.current?.rows || []
      if (!rows.length) { setMsg("No buildings capture yet. Open the Council buildings page in Utopia with the scraper running, or paste your buildings below."); return }
      setCurrent(Object.fromEntries(rows.map((x) => [x.name, x.qty])))
      setMsg("")
    } catch { setMsg("Could not load your buildings.") }
  }

  async function loadCosts() {
    try {
      const r = await fetch("/api/page-models?page=exploration", { cache: "no-store" })
      const j = await r.json()
      const p = j?.model?.latest
      if (!p) { setMsg("No exploration capture yet. Open the Exploration page in Utopia with the scraper running."); return }
      if (p.goldPerAcre != null) setGoldPer(String(p.goldPerAcre))
      if (p.soldiersPerAcre != null) setSoldPer(String(p.soldiersPerAcre))
      if (p.goldAvailable != null) setGold(String(p.goldAvailable))
      if (p.soldiersAvailable != null) setSoldiers(String(p.soldiersAvailable))
      if (p.maxNow != null) setMaxPer(String(p.maxNow))
      setMsg("")
    } catch { setMsg("Could not load explore costs.") }
  }

  function applyPastedBuild() {
    const parsed = parseBuildText(pasteBuild)
    if (!Object.keys(parsed.buildings).length) { setMsg('Could not read that build. Use lines like "Farms 7%".'); return }
    setTarget(parsed.buildings)
    setBuildName(parsed.name || "Pasted build")
    setBuildId("")
    setMsg("")
  }

  function applyPastedCurrent() {
    const out: Record<string, number> = {}
    for (const line of pasteCurrent.split("\n")) {
      const m = line.trim().match(/^([A-Za-z' ]+?)[\s:\-—]+([\d,]+)\b/)
      if (m) out[m[1].trim()] = Number(m[2].replace(/,/g, ""))
    }
    if (!Object.keys(out).length) { setMsg('Could not read those buildings. Use lines like "Farms 120".'); return }
    setCurrent(out)
    setMsg("")
  }

  const plan = useMemo(() => planExplore({
    current, target, exploreAcres: acres, hours, batches, exploreTicks, buildTicks,
    goldPerAcre: goldPer, soldiersPerAcre: soldPer, constructionPerAcre: buildPer, costGrowthPct: growth,
    maxPerBatch: maxPer, goldStock: gold === "" ? null : gold, soldierStock: soldiers === "" ? null : soldiers,
    goldPerHour: goldHr, soldiersPerHour: soldHr,
  }), [current, target, acres, hours, batches, exploreTicks, buildTicks, goldPer, soldPer, buildPer, growth, maxPer, gold, soldiers, goldHr, soldHr])

  const result = "error" in plan && plan.error ? null : (plan as Exclude<typeof plan, { error: string }>)
  const hasInputs = Object.keys(current).length > 0 && Object.keys(target).length > 0

  return (
    <section style={card}>
      <h2>Explore Planner</h2>
      <p style={{ fontSize: 12, color: "#aeb9c5" }}>
        Pick a build, say how much you want to explore and in how long. It shows which buildings the new land should become, when each batch lands, and what it costs.
      </p>

      <div style={h3}>1 · YOUR BUILD AND YOUR LAND</div>
      <div style={grid}>
        <div>
          <label style={label}>BUILD (FROM THE LIBRARY)</label>
          <select style={input} value={buildId} onChange={(e) => pickBuild(e.target.value)}>
            <option value="">Choose a build…</option>
            {builds.map((b) => <option key={b.id} value={b.id}>{b.name}{b.race ? ` · ${b.race}` : ""}{b.personality ? ` · ${b.personality}` : ""}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button style={ghost} onClick={loadBuildings}>Load my buildings</button>
          <button style={ghost} onClick={loadCosts}>Load explore costs</button>
        </div>
      </div>
      {msg && <div style={{ fontSize: 11, color: "#ffb86b", marginTop: 8 }}>{msg}</div>}
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 11, color: "#8993a1", cursor: "pointer" }}>Or paste them by hand</summary>
        <div style={{ ...grid, marginTop: 8 }}>
          <div>
            <label style={label}>BUILD (LINES LIKE "FARMS 7%")</label>
            <textarea style={{ ...input, minHeight: 90 }} value={pasteBuild} onChange={(e) => setPasteBuild(e.target.value)} />
            <button style={{ ...ghost, marginTop: 6 }} onClick={applyPastedBuild}>Use this build</button>
          </div>
          <div>
            <label style={label}>YOUR BUILDINGS (LINES LIKE "FARMS 120")</label>
            <textarea style={{ ...input, minHeight: 90 }} value={pasteCurrent} onChange={(e) => setPasteCurrent(e.target.value)} />
            <button style={{ ...ghost, marginTop: 6 }} onClick={applyPastedCurrent}>Use these buildings</button>
          </div>
        </div>
      </details>
      <div style={{ fontSize: 11, color: "#8993a1", marginTop: 8 }}>
        {buildName ? `Build: ${buildName}` : "No build chosen yet."} · {Object.keys(current).length ? `${fmt(Object.values(current).reduce((a, b) => a + b, 0))} acres loaded` : "No buildings loaded yet."}
      </div>

      <div style={h3}>2 · THE PLAN</div>
      <div style={grid}>
        <Field name="ACRES TO EXPLORE" value={acres} set={setAcres} />
        <Field name="TIME WINDOW (HOURS)" value={hours} set={setHours} hint="Everything should be built by then" />
        <Field name="BATCHES" value={batches} set={setBatches} hint="Explore in this many rounds" />
        <Field name="GOLD PER ACRE" value={goldPer} set={setGoldPer} />
        <Field name="SOLDIERS PER ACRE" value={soldPer} set={setSoldPer} />
        <Field name="MAX ACRES AT ONCE" value={maxPer} set={setMaxPer} hint="From the Exploration page" />
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 11, color: "#8993a1", cursor: "pointer" }}>More settings</summary>
        <div style={{ ...grid, marginTop: 8 }}>
          <Field name="HOURS TO EXPLORE" value={exploreTicks} set={setExploreTicks} hint="Default 12. Change if your age differs" />
          <Field name="HOURS TO BUILD" value={buildTicks} set={setBuildTicks} hint="Default 12. Change if your age differs" />
          <Field name="BUILD COST PER ACRE" value={buildPer} set={setBuildPer} hint="Optional" />
          <Field name="COST GROWTH PER BATCH %" value={growth} set={setGrowth} hint="Optional, explore cost rises as you grow" />
          <Field name="GOLD ON HAND" value={gold} set={setGold} />
          <Field name="SOLDIERS ON HAND" value={soldiers} set={setSoldiers} />
          <Field name="GOLD INCOME PER HOUR" value={goldHr} set={setGoldHr} hint="Optional" />
          <Field name="SOLDIER INCOME PER HOUR" value={soldHr} set={setSoldHr} hint="Optional" />
        </div>
      </details>

      {!hasInputs && <p style={{ fontSize: 12, color: "#8993a1", marginTop: 18 }}>Choose a build and load your buildings to see the plan.</p>}
      {hasInputs && !result && <p style={{ fontSize: 12, color: "#ffb86b", marginTop: 18 }}>{"error" in plan ? plan.error : ""}</p>}

      {hasInputs && result && (
        <>
          <div style={h3}>RESULT</div>
          <div style={{ fontSize: 13, color: "#dce7ee", lineHeight: 1.6 }}>
            {fmt(result.landNow)} acres now, {fmt(result.finalLand)} after exploring {fmt(result.totalExplore)}.
            {result.fitsWindow === true && <> Everything is built by hour {result.lastBuiltHour}, inside your {hours}-hour window.</>}
            {result.fitsWindow === false && <> <b style={{ color: "#ff7b7b" }}>The last batch is not built until hour {result.lastBuiltHour}, outside your {hours}-hour window.</b></>}
          </div>
          {result.warnings.map((w) => <div key={w} style={{ fontSize: 11, color: "#ffb86b", marginTop: 6 }}>⚠ {w}</div>)}

          <div style={h3}>WHAT TO BUILD</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>BUILDING</th><th style={th}>NOW</th><th style={th}>NOW %</th><th style={th}>BUILD %</th><th style={th}>GOAL ACRES</th><th style={th}>TO BUILD</th></tr></thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.name}>
                    <td style={{ ...td, textAlign: "left" }}>{r.name}</td>
                    <td style={td}>{fmt(r.now)}</td>
                    <td style={td}>{r.nowPct}%</td>
                    <td style={td}>{r.targetPct}%</td>
                    <td style={td}>{fmt(r.goal)}</td>
                    <td style={{ ...td, color: r.add > 0 ? "#d8ff54" : "#6b7886", fontWeight: r.add > 0 ? 700 : 400 }}>{r.add > 0 ? `+${fmt(r.add)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={h3}>BATCHES</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>STEP</th><th style={th}>START (H)</th><th style={th}>LANDS (H)</th><th style={th}>BUILT (H)</th><th style={th}>ACRES</th><th style={th}>GOLD</th><th style={th}>SOLDIERS</th><th style={{ ...th, textAlign: "left" }}>BUILD</th><th style={th}>OK?</th></tr></thead>
              <tbody>
                {result.batches.map((b) => (
                  <tr key={b.label}>
                    <td style={{ ...td, textAlign: "left" }}>{b.label}</td>
                    <td style={td}>{b.startHour}</td>
                    <td style={td}>{b.arriveHour}</td>
                    <td style={td}>{b.builtHour}</td>
                    <td style={td}>{fmt(b.kind === "barren" ? b.built : b.acres)}</td>
                    <td style={td}>{b.goldCost ? fmt(b.goldCost) : "—"}</td>
                    <td style={td}>{b.soldierCost ? fmt(b.soldierCost) : "—"}</td>
                    <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 200 }}>{Object.entries(b.build).map(([n, q]) => `${n} ${fmt(q)}`).join(", ") || "—"}</td>
                    <td style={{ ...td, color: b.affordable ? "#67f0b0" : "#ff7b7b" }}>{b.affordable ? "✓" : "short"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>TOTAL</td><td style={td} /><td style={td} /><td style={td} />
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(result.totalExplore)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(result.totals.gold)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(result.totals.soldiers)}</td>
                  <td style={{ ...td, textAlign: "left" }}>{result.totals.construction ? `Construction ${fmt(result.totals.construction)} gold` : ""}</td><td style={td} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p style={{ fontSize: 10, color: "#6b7886", marginTop: 10 }}>
            Costs use the per-acre numbers you give it, with the optional growth per batch. Buildings already under construction are not counted, so check the Construction page before you queue.
          </p>
        </>
      )}
    </section>
  )
}
