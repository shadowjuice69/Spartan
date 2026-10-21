"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { ParsedScience } from "@/lib/spartan/build-parser"
import { buildPlan, type LiveCategory } from "@/lib/spartan/science-plan"
import { NAV_COMMAND as navCommand, NAV_INTEL as navIntel } from '@/lib/spartan/nav'




const shell: any = { minHeight:"100vh", background:"#05080d", color:"#e7eef5", fontFamily:"Inter,system-ui,sans-serif", display:"flex" }
const sidebar: any = { width:245, flexShrink:0, minHeight:"100vh", background:"#071018", borderRight:"1px solid rgba(255,255,255,.08)", padding:24, position:"sticky", top:0, height:"100vh", overflowY:"auto" }
const card: any = { padding:16, border:"1px solid rgba(255,255,255,.08)", borderRadius:10, background:"#081119" }
const btnPrimary: any = { background:"#d8ff54", color:"#101408", border:"1px solid #91a93a", borderRadius:8, padding:"9px 14px", fontWeight:800, fontSize:11, cursor:"pointer" }
const btnGhost: any = { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.1)", color:"#dce7ee", borderRadius:8, padding:"9px 14px", fontSize:11, cursor:"pointer" }
const btnDanger: any = { background:"rgba(255,90,90,.1)", border:"1px solid rgba(255,90,90,.35)", color:"#ff9b9b", borderRadius:8, padding:"9px 14px", fontSize:11, cursor:"pointer" }
const textarea: any = { width:"100%", height:150, background:"#05080d", border:"1px solid rgba(255,255,255,.08)", borderRadius:8, padding:10, fontSize:11, fontFamily:"monospace", color:"#dce7ee" }
const input: any = { background:"#05080d", border:"1px solid rgba(255,255,255,.08)", borderRadius:6, padding:"7px 9px", fontSize:11, color:"#dce7ee" }
const select: any = { ...input }

type RaceRule = { race: string; emoji: string; archetype: string; war_doctrine: string; unique_name: string; unique_desc: string; bonuses: string; penalties: string; units: string; spells: string }
type PersonalityRule = { personality: string; emoji: string; unique_name: string; unique_desc: string; bonuses: string; start_bonus: string; spells: string }

function Sidebar({ active }: { active: string }) {
  const router = useRouter()
  return (
    <aside style={sidebar}>
      <div style={{ fontWeight:900, letterSpacing:".18em", color:"#d8ff54" }}>SPARTAN</div>
      <div style={{ fontSize:9, color:"#718091", letterSpacing:".16em", marginTop:5 }}>UTOPIA COMMAND</div>
      <div style={{ margin:"30px 0 10px", fontSize:9, color:"#5f6c7a", letterSpacing:".18em" }}>COMMAND SYSTEMS</div>
      {navCommand.map(([name, path]) => (
        <button key={name} onClick={() => router.push(path)} style={{ display:"block", width:"100%", textAlign:"left", padding:"11px 12px", marginBottom:4, border:0, borderRadius:8, background: name===active ? "rgba(216,255,84,.08)" : "transparent", color: name===active ? "#d8ff54" : "#aeb9c5", fontWeight:700, fontSize:11, cursor:"pointer" }}>
          {name}
        </button>
      ))}
      <div style={{ margin:"22px 0 10px", fontSize:9, color:"#5f6c7a", letterSpacing:".18em" }}>INTEL DATA</div>
      {navIntel.map(([name, path]) => (
        <button key={name} onClick={() => router.push(path)} style={{ display:"block", width:"100%", textAlign:"left", padding:"11px 12px", marginBottom:4, border:0, borderRadius:8, background: name===active ? "rgba(216,255,84,.08)" : "transparent", color: name===active ? "#d8ff54" : "#aeb9c5", fontWeight:700, fontSize:11, cursor:"pointer" }}>
          {name}
        </button>
      ))}
    </aside>
  )
}

function RaceRuleCard({ r }: { r: RaceRule }) {
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <p style={{ margin:0, fontWeight:700 }}>{r.emoji} {r.race} {r.archetype && <span style={{ fontSize:9, color:"#67f0b0", marginLeft:6 }}>{r.archetype}</span>}</p>
      {r.war_doctrine && <p style={{ fontSize:11, color:"#8da7ff", marginTop:8 }}><b>War Doctrine:</b> {r.war_doctrine}</p>}
      {r.unique_name && <p style={{ fontSize:11, color:"#67f0b0", marginTop:6 }}><b>Unique — {r.unique_name}:</b> {r.unique_desc}</p>}
      {r.bonuses && <p style={{ fontSize:11, color:"#a7e8b0", marginTop:6 }}><b>Bonuses:</b> {r.bonuses}</p>}
      {r.penalties && <p style={{ fontSize:11, color:"#ff9b9b", marginTop:6 }}><b>Penalties:</b> {r.penalties}</p>}
      {r.units && <p style={{ fontSize:11, color:"#b7c2cc", marginTop:6 }}><b>Units:</b> {r.units}</p>}
      {r.spells && <p style={{ fontSize:11, color:"#b7c2cc", marginTop:6 }}><b>Spells:</b> {r.spells}</p>}
    </div>
  )
}

function PersonalityRuleCard({ p }: { p: PersonalityRule }) {
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <p style={{ margin:0, fontWeight:700 }}>{p.emoji} {p.personality}</p>
      {p.unique_name && <p style={{ fontSize:11, color:"#67f0b0", marginTop:8 }}><b>Unique — {p.unique_name}:</b> {p.unique_desc}</p>}
      {p.bonuses && <p style={{ fontSize:11, color:"#a7e8b0", marginTop:6 }}><b>Bonuses:</b> {p.bonuses}</p>}
      {p.start_bonus && <p style={{ fontSize:11, color:"#b7c2cc", marginTop:6 }}><b>Start:</b> {p.start_bonus}</p>}
      {p.spells && <p style={{ fontSize:11, color:"#b7c2cc", marginTop:6 }}><b>Spells:</b> {p.spells}</p>}
    </div>
  )
}

function NewBuildForm({ races, personalities, onSaved }: { races: RaceRule[]; personalities: PersonalityRule[]; onSaved: () => void }) {
  type BuildingEntry = { id: string; name: string; percent: string }
  type ScienceEntryInput = { id: string; category: "economy" | "military" | "arcane"; name: string; kind: "weight" | "actual_pct"; value: string }
  const makeId = () => String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8)
  const [name, setName] = useState("")
  const [author, setAuthor] = useState("")
  const [race, setRace] = useState("")
  const [personality, setPersonality] = useState("")
  const [buildings, setBuildings] = useState<BuildingEntry[]>([{ id: makeId(), name: "", percent: "" }])
  const [military, setMilitary] = useState({ ppa: "", tpa: "", wpa: "", dspa: "", epa_ospa: "", epa_dspa: "", ospa: "", gcpa: "", notes: "" })
  const [scienceEntries, setScienceEntries] = useState<ScienceEntryInput[]>([
    { id: makeId(), category: "economy", name: "", kind: "weight", value: "" },
    { id: makeId(), category: "military", name: "", kind: "weight", value: "" },
    { id: makeId(), category: "arcane", name: "", kind: "weight", value: "" },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateBuilding(id: string, key: "name" | "percent", value: string) {
    setBuildings((rows) => rows.map((row) => row.id === id ? { ...row, [key]: value } : row))
  }
  function updateScience(id: string, key: keyof ScienceEntryInput, value: string) {
    setScienceEntries((rows) => rows.map((row) => row.id === id ? { ...row, [key]: value } as ScienceEntryInput : row))
  }

  async function save() {
    if (!name.trim()) { setError("Enter a build name before saving."); return }
    const buildingData: Record<string, number> = {}
    for (const row of buildings) {
      const buildingName = row.name.trim()
      if (!buildingName) continue
      const percent = Number(row.percent)
      if (row.percent.trim() === "" || !Number.isFinite(percent) || percent < 0) {
        setError("Enter a valid percentage for " + buildingName + "."); return
      }
      buildingData[buildingName] = percent
    }

    const science: ParsedScience = { economy: {}, military: {}, arcane: {} }
    for (const row of scienceEntries) {
      const scienceName = row.name.trim()
      if (!scienceName && !row.value.trim()) continue
      if (!scienceName || !row.value.trim()) {
        setError("For each science entry, fill in both the science name and its value."); return
      }
      const value = Number(row.value)
      if (!Number.isFinite(value) || value < 0) {
        setError("Enter a valid value for " + scienceName + "."); return
      }
      science[row.category][scienceName] = row.kind === "actual_pct"
        ? { type: "actual_pct", value }
        : { type: "weight", value }
    }

    const militaryRequirement: Record<string, string | number> = { notes: military.notes.trim() }
    for (const key of ["ppa", "tpa", "wpa", "dspa", "epa_ospa", "epa_dspa", "ospa", "gcpa"] as const) {
      if (military[key].trim() !== "") {
        const value = Number(military[key])
        if (!Number.isFinite(value) || value < 0) {
          setError("Enter a valid non-negative number for " + key.toUpperCase().replace("_", "/") + "."); return
        }
        militaryRequirement[key] = value
      }
    }

    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/builds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          author: author.trim() || null,
          race: race || null,
          personality: personality || null,
          buildings: buildingData,
          science,
          military_requirement: militaryRequirement,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "Save failed.")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save build.")
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel: any = { display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "#b7c2cc" }
  const fieldInput: any = { ...input, width: "100%", boxSizing: "border-box", minHeight: 36, fontSize: 13 }
  const sectionHeading: any = { margin: "22px 0 10px", color: "#67f0b0", fontSize: 11, letterSpacing: ".1em" }

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0, marginBottom: 6 }}>Create a Build</h2>
      <p style={{ color: "#8993a1", fontSize: 12, marginTop: 0 }}>Type each value into its own field. No special formatting or Parse buttons needed.</p>

      <h3 style={sectionHeading}>BUILD DETAILS</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label style={fieldLabel}>Build name *
          <input style={fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Orc War Build" />
        </label>
        <label style={fieldLabel}>Build by
          <input style={fieldInput} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
        </label>
        <label style={fieldLabel}>Race
          <select style={fieldInput} value={race} onChange={(e) => setRace(e.target.value)}>
            <option value="">Choose race…</option>
            {races.map((r) => <option key={r.race} value={r.race}>{r.emoji} {r.race}</option>)}
          </select>
        </label>
        <label style={fieldLabel}>Personality
          <select style={fieldInput} value={personality} onChange={(e) => setPersonality(e.target.value)}>
            <option value="">Choose personality…</option>
            {personalities.map((p) => <option key={p.personality} value={p.personality}>{p.emoji} {p.personality}</option>)}
          </select>
        </label>
      </div>

      <h3 style={sectionHeading}>BUILDINGS</h3>
      <p style={{ color: "#8993a1", fontSize: 11, marginTop: 0 }}>Type a building name and its percentage on each row. Add as many rows as you need.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {buildings.map((row, index) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
            <label style={fieldLabel}>Building {index + 1}
              <input style={fieldInput} value={row.name} onChange={(e) => updateBuilding(row.id, "name", e.target.value)} placeholder="e.g. Farms" />
            </label>
            <label style={fieldLabel}>Percent (%)
              <input style={fieldInput} type="number" min="0" step="any" value={row.percent} onChange={(e) => updateBuilding(row.id, "percent", e.target.value)} placeholder="7" />
            </label>
            <button type="button" style={{ ...btnGhost, minHeight: 36 }} disabled={buildings.length === 1} onClick={() => setBuildings((rows) => rows.filter((item) => item.id !== row.id))}>Remove</button>
          </div>
        ))}
      </div>
      <button type="button" style={{ ...btnGhost, marginTop: 10 }} onClick={() => setBuildings((rows) => [...rows, { id: makeId(), name: "", percent: "" }])}>+ Add building</button>

      <h3 style={sectionHeading}>MILITARY REQUIREMENTS</h3>
      <p style={{ color: "#8993a1", fontSize: 11, marginTop: 0 }}>Enter only the requirements this build uses. Leave the rest blank.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        {([
          ["ppa", "PPA"], ["tpa", "TPA"], ["wpa", "WPA"], ["dspa", "DSPA"],
          ["epa_ospa", "EPA / OSPA"], ["epa_dspa", "EPA / DSPA"], ["ospa", "OSPA"], ["gcpa", "GCPA"],
        ] as const).map(([key, label]) => (
          <label key={key} style={fieldLabel}>{label}
            <input style={fieldInput} type="number" min="0" step="any" value={military[key]} onChange={(e) => setMilitary((current) => ({ ...current, [key]: e.target.value }))} placeholder="Optional" />
          </label>
        ))}
      </div>
      <label style={{ ...fieldLabel, marginTop: 12 }}>Military notes
        <textarea style={{ ...textarea, height: 90, boxSizing: "border-box", fontSize: 12 }} value={military.notes} onChange={(e) => setMilitary((current) => ({ ...current, notes: e.target.value }))} placeholder="Any extra requirements or reminders" />
      </label>

      <h3 style={sectionHeading}>SCIENCE TARGETS &amp; WEIGHTS</h3>
      <p style={{ color: "#8993a1", fontSize: 11, marginTop: 0 }}>Add each science separately. Choose Economy, Military, or Arcane, then enter the science name and either a priority weight (such as 4x) or a target percentage.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {scienceEntries.map((row) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
            <label style={fieldLabel}>Category
              <select style={fieldInput} value={row.category} onChange={(e) => updateScience(row.id, "category", e.target.value)}>
                <option value="economy">Economy</option>
                <option value="military">Military</option>
                <option value="arcane">Arcane</option>
              </select>
            </label>
            <label style={fieldLabel}>Science name
              <input style={fieldInput} value={row.name} onChange={(e) => updateScience(row.id, "name", e.target.value)} placeholder="e.g. Alchemy" />
            </label>
            <label style={fieldLabel}>Value type
              <select style={fieldInput} value={row.kind} onChange={(e) => updateScience(row.id, "kind", e.target.value)}>
                <option value="weight">Priority weight (x)</option>
                <option value="actual_pct">Target percent (%)</option>
              </select>
            </label>
            <label style={fieldLabel}>{row.kind === "weight" ? "Weight" : "Target (%)"}
              <input style={fieldInput} type="number" min="0" step="any" value={row.value} onChange={(e) => updateScience(row.id, "value", e.target.value)} placeholder={row.kind === "weight" ? "4" : "4.2"} />
            </label>
            <button type="button" style={{ ...btnGhost, minHeight: 36 }} disabled={scienceEntries.length === 1} onClick={() => setScienceEntries((rows) => rows.filter((item) => item.id !== row.id))}>Remove</button>
          </div>
        ))}
      </div>
      <button type="button" style={{ ...btnGhost, marginTop: 10 }} onClick={() => setScienceEntries((rows) => [...rows, { id: makeId(), category: "economy", name: "", kind: "weight", value: "" }])}>+ Add science</button>

      {error && <p role="alert" style={{ color: "#ff9b9b", fontSize: 12, marginTop: 14 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="button" style={btnPrimary} disabled={saving} onClick={save}>{saving ? "Saving build…" : "Save Build"}</button>
      </div>
    </div>
  )
}
function BuildDetail({ id, races, personalities, onBack, onDeleted }: { id: string; races: RaceRule[]; personalities: PersonalityRule[]; onBack: () => void; onDeleted: () => void }) {
  const [build, setBuild] = useState<any>(null)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [books, setBooks] = useState({ economy: 0, military: 0, arcane: 0 })
  const [currentAge, setCurrentAge] = useState<number | null>(null)
  const [ageChanged, setAgeChanged] = useState(false)

  useEffect(() => {
    fetch(`/api/builds/${id}`).then((r) => r.json()).then((j) => j.build ? setBuild(j.build) : setError(j.error || "Not found"))
  }, [id])

  // Live books and effects from the player's captured Science council page (when signed in and captured).
  const [live, setLive] = useState<{ cats: LiveCategory[]; at: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/page-models?page=science", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const cats = j?.model?.current?.categories
        if (!cancelled && Array.isArray(cats) && cats.length) setLive({ cats, at: j.model.capturedAt || null })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!build || currentAge == null) return
    const pinnedAge = Number(build.rules_age_number)
    if (Number.isFinite(pinnedAge) && pinnedAge !== currentAge) {
      setBooks({ economy: 0, military: 0, arcane: 0 })
      setAgeChanged(true)
    }
  }, [build, currentAge])

  const plan = useMemo(() => build ? buildPlan(build.science, live?.cats || null, books) : [], [build, live, books])
  const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`
  const raceRule = build?.race_rule_snapshot || null
  const personalityRule = build?.personality_rule_snapshot || null
  const [resyncing, setResyncing] = useState(false)

  async function handleResync() {
    setResyncing(true)
    try {
      const res = await fetch(`/api/builds/${id}/resync`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error || "Resync failed.")
      const { build: updated } = await res.json()
      setBuild(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resync failed.")
    } finally {
      setResyncing(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${build.name}"? This can't be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/builds/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed.")
      onDeleted()
    } catch (e: any) {
      setError(e.message)
      setDeleting(false)
    }
  }

  if (error) return <div style={card}>{error}</div>
  if (!build) return <div style={card}>Loading…</div>
  const mil = build.military_requirement || {}

  return (
    <div style={card}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
        <button style={btnGhost} onClick={onBack}>← Back to Library</button>
        <div style={{ display:"flex", gap:8 }}>
          {(build.race || build.personality) && (
            <button style={btnGhost} disabled={resyncing} onClick={handleResync}>{resyncing ? "Resyncing…" : "Resync to Latest Rules"}</button>
          )}
          <button style={btnDanger} disabled={deleting} onClick={handleDelete}>{deleting ? "Deleting…" : "Delete Build"}</button>
        </div>
      </div>

      <h2 style={{ margin:0 }}>{build.name}</h2>
      <p style={{ color:"#8993a1", fontSize:11 }}>
        {[build.race, build.personality].filter(Boolean).join(" / ")}{build.author ? ` · set by ${build.author}` : ""}
        {build.rules_age_number != null && ` · rules pinned to Age ${build.rules_age_number}`}
      </p>

      {(raceRule || personalityRule) && (
        <>
          <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>RACE &amp; PERSONALITY</h3>
          {raceRule && <RaceRuleCard r={raceRule} />}
          {personalityRule && <PersonalityRuleCard p={personalityRule} />}
        </>
      )}

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>BUILDINGS</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:2, fontSize:11 }}>
        {Object.entries(build.buildings || {}).map(([k, v]: any) => <span key={k}>{k}: <b style={{color:"#d8ff54"}}>{v}%</b></span>)}
      </div>

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>MILITARY REQUIREMENT</h3>
      <p style={{ fontSize:11, display:"flex", gap:14, flexWrap:"wrap" }}>
        <span>PPA: {mil.ppa ?? "—"}</span><span>TPA: {mil.tpa ?? "—"}</span><span>WPA: {mil.wpa ?? "—"}</span>
        <span>DSPA: {mil.dspa ?? "—"}</span><span>OSPA: {mil.ospa ?? "—"}</span><span>EPA/DSPA: {mil.epa_dspa ?? "—"}</span>
        {mil.gcpa != null && <span>GCPA: {mil.gcpa}</span>}
      </p>
      {mil.notes && <p style={{ fontSize:11, color:"#8993a1", fontStyle:"italic" }}>{mil.notes}</p>}

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>SCIENCE PLAN</h3>
      <p style={{ fontSize:10, color:"#687686", margin:"0 0 10px" }}>
        {live
          ? `Using your live books from the Science council page${live.at ? ` (captured ${new Date(live.at).toLocaleString()})` : ""}. Type a number to plan for a different book count.`
          : "No live Science capture found, so enter your books below. Open Council → Science with the scraper running to fill these in automatically."}
      </p>
      <div style={{ display:"flex", gap:14, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end" }}>
        {(["economy","military","arcane"] as const).map((cat) => {
          const p = plan.find((x) => x.category === cat)
          const hasOverride = books[cat] > 0
          return (
            <label key={cat} style={{ fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ color:"#8993a1", textTransform:"capitalize", display:"flex", alignItems:"center", gap:6 }}>
                {cat} books
                <button
                  type="button"
                  title="Clear this planning override and return to live books"
                  style={{ ...btnGhost, padding:"2px 6px", fontSize:9, opacity:hasOverride ? 1 : 0.45 }}
                  onClick={() => setBooks((b) => ({ ...b, [cat]: 0 }))}
                >CLEAR</button>
              </span>
              <input type="number" min={0} style={{ ...input, width:130 }} placeholder={live && p ? String(p.invested + p.available) : "0"} value={books[cat] || ""} onChange={(e) => setBooks((b) => ({ ...b, [cat]: Number(e.target.value) || 0 }))} />
            </label>
          )
        })}
        <button
          type="button"
          style={{ ...btnGhost, borderColor:"rgba(216,255,84,.25)", color:"#d8ff54" }}
          onClick={() => setBooks({ economy: 0, military: 0, arcane: 0 })}
          title="Clear all planning overrides and return every category to live books"
        >CLEAR ALL</button>
      </div>
      {ageChanged && currentAge != null && build?.rules_age_number != null && (
        <div style={{ ...card, marginBottom:14, borderColor:"rgba(216,255,84,.22)", background:"rgba(216,255,84,.035)" }}>
          <div style={{ fontSize:9, color:"#d8ff54", letterSpacing:".12em", fontWeight:800 }}>AGE CHANGE DETECTED</div>
          <p style={{ margin:"6px 0 0", fontSize:11, color:"#b7c2cc" }}>
            This build is pinned to Age {build.rules_age_number}, while the current Spartan rules are Age {currentAge}.
            Science Plan book overrides were cleared so the planner starts from the current live science totals.
            Your stored build and previous-age data are not deleted or changed.
          </p>
        </div>
      )}
      <div style={{ display:"grid", gap:14 }}>
        {plan.filter((p) => p.rows.length > 0).map((p) => (
          <div key={p.category} style={{ border:"1px solid rgba(255,255,255,.06)", borderRadius:8, padding:12 }}>
            <p style={{ fontSize:9, color:"#687686", textTransform:"uppercase", margin:"0 0 2px" }}>{p.category}</p>
            <p style={{ fontSize:10, color:"#8993a1", margin:"0 0 8px" }}>
              Planning for <b style={{ color:"#dce7ee" }}>{p.totalBooks.toLocaleString()}</b> books
              {live && p.available > 0 && books[p.category] <= 0 ? ` (${p.invested.toLocaleString()} invested + ${p.available.toLocaleString()} unspent)` : ""}
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"minmax(80px,1.4fr) 1fr 1fr 1fr 1.3fr", gap:"4px 8px", fontSize:11, alignItems:"baseline" }}>
              {["SCIENCE","NOW","TARGET","MOVE","BONUS"].map((h) => <span key={h} style={{ fontSize:9, color:"#687686", letterSpacing:".08em", textAlign: h === "SCIENCE" ? "left" : "right" }}>{h}</span>)}
              {p.rows.map((r) => {
                const done = Math.abs(r.delta) < 1
                return [
                  <span key={r.name + "n"}>{r.name}{r.type === "actual_pct" && <span style={{ color:"#687686" }}> ({r.input}%)</span>}</span>,
                  <span key={r.name + "c"} style={{ textAlign:"right", color:"#8993a1" }}>{live ? r.current.toLocaleString() : "—"}</span>,
                  <b key={r.name + "t"} style={{ textAlign:"right", color:"#d8ff54" }}>{r.target.toLocaleString()}</b>,
                  <span key={r.name + "d"} style={{ textAlign:"right", color: !live ? "#687686" : done ? "#67f0b0" : r.delta > 0 ? "#d8ff54" : "#ffb35c" }}>
                    {!live ? "—" : done ? "✓" : `${r.delta > 0 ? "+" : "−"}${Math.abs(r.delta).toLocaleString()}`}
                  </span>,
                  <span key={r.name + "b"} style={{ textAlign:"right", color:"#8993a1" }}>
                    {r.currentEffect == null ? "—" : r.projectedEffect == null ? pct(r.currentEffect) : <>{pct(r.currentEffect)} → <b style={{ color:"#dce7ee" }}>{pct(r.projectedEffect)}</b></>}
                  </span>,
                ]
              })}
            </div>
            {p.extras.length > 0 && (
              <p style={{ fontSize:10, color:"#687686", margin:"8px 0 0" }}>
                Not in this build: {p.extras.map((e) => `${e.name} ${e.books.toLocaleString()}`).join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
      {live && (
        <p style={{ fontSize:9, color:"#687686", marginTop:10 }}>
          MOVE is a comparison only: + means books to add, − means you are over the target, and ✓ means on target. Spartan does not move books. BONUS is an estimate scaled from the effect captured for each science; a science with no books yet has no estimate.
        </p>
      )}
    </div>
  )
}

function BuildInstructions() {
  const sectionTitle: any = { fontSize:12, color:"#67f0b0", letterSpacing:".1em", margin:"22px 0 8px" }
  const muted: any = { fontSize:11, color:"#8993a1", lineHeight:1.65 }
  const table: any = { width:"100%", borderCollapse:"collapse", fontSize:11 }
  const th: any = { textAlign:"left", fontSize:9, color:"#687686", letterSpacing:".08em", padding:"8px 6px", borderBottom:"1px solid rgba(255,255,255,.08)" }
  const td: any = { padding:"9px 6px", borderBottom:"1px solid rgba(255,255,255,.05)", verticalAlign:"top" }

  return (
    <div style={{ ...card, maxWidth:1100 }}>
      <div style={{ fontSize:9, color:"#d8ff54", letterSpacing:".18em" }}>BUILD LIBRARY // INSTRUCTIONS</div>
      <h2 style={{ margin:"7px 0 4px" }}>How the Science Plan Works</h2>
      <p style={muted}>
        The Science Plan turns the science priorities saved in a build into a practical roadmap.
        Spartan calculates the targets and comparisons for you, but it does not invest or move books.
        You still make the actual investments on Utopia's Science page.
      </p>

      <h3 style={sectionTitle}>1 — SCIENCE WEIGHTS</h3>
      <p style={muted}>
        When you create a build, each science can have a weight. A higher weight gives that science
        a higher priority when Spartan calculates the build's target allocation. A weight is a
        priority — it is not a number of books.
      </p>
      <div style={{ ...card, marginTop:10, background:"rgba(255,255,255,.02)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontSize:11 }}>
          <span>Income</span><b style={{color:"#d8ff54"}}>40</b>
          <span>Housing</span><b style={{color:"#d8ff54"}}>20</b>
          <span>Military Science</span><b style={{color:"#d8ff54"}}>30</b>
          <span>Magic Science</span><b style={{color:"#d8ff54"}}>10</b>
        </div>
      </div>

      <h3 style={sectionTitle}>2 — BOOKS</h3>
      <p style={muted}>
        With a live Science council capture, Spartan plans around your invested books plus your
        unspent books. For example: 10,000 invested + 2,000 unspent = a 12,000-book planning pool.
        You can also type a different total to plan for a future book count.
      </p>

      <h3 style={sectionTitle}>3 — TARGET</h3>
      <p style={muted}>
        Spartan applies the build's science weights to the planning pool and calculates how many
        books the build wants at each science. You do not have to calculate the target yourself.
      </p>

      <h3 style={sectionTitle}>4 — NOW</h3>
      <p style={muted}>
        NOW is the number of books currently invested in that science according to your latest
        captured Science page.
      </p>

      <h3 style={sectionTitle}>5 — MOVE</h3>
      <p style={muted}>
        MOVE is simply <b style={{color:"#dce7ee"}}>TARGET − NOW</b>. It is information only.
        Spartan does not move or invest any books.
      </p>
      <div style={{ overflowX:"auto", marginTop:10 }}>
        <table style={table}>
          <thead><tr><th style={th}>MOVE</th><th style={th}>MEANING</th><th style={th}>WHAT YOU DO</th></tr></thead>
          <tbody>
            <tr><td style={td}><b style={{color:"#d8ff54"}}>+2,000</b></td><td style={td}>2,000 books below target</td><td style={td}>Invest 2,000 more books into that science.</td></tr>
            <tr><td style={td}><b style={{color:"#ffb35c"}}>−2,000</b></td><td style={td}>2,000 books over target</td><td style={td}>Do not treat this as an instruction to remove books. It simply shows the existing investment is above the build target.</td></tr>
            <tr><td style={td}><b style={{color:"#67f0b0"}}>✓</b></td><td style={td}>On target</td><td style={td}>No additional books are needed to reach the target.</td></tr>
          </tbody>
        </table>
      </div>

      <h3 style={sectionTitle}>6 — BONUS</h3>
      <p style={muted}>
        BONUS shows the current captured effect and, when enough live information exists, Spartan's
        estimate of the effect at the target. The projection uses the same science-effect scaling
        used by the Science / Summary calculator.
      </p>
      <div style={{ ...card, marginTop:10, background:"rgba(255,255,255,.02)", fontSize:11 }}>
        <b>Example:</b> <span style={{color:"#8993a1"}}>+10.0% → +11.5%</span>
        <div style={{...muted, marginTop:5}}>Current captured effect → estimated effect at the target book amount.</div>
      </div>

      <h3 style={sectionTitle}>7 — NOT IN THIS BUILD</h3>
      <p style={muted}>
        If your live Science capture contains a science where you already have books invested but
        the build does not assign it a target, Spartan lists it as <b>Not in this build</b>.
        This lets you see existing investments that are outside the build's priorities.
      </p>

      <h3 style={sectionTitle}>8 — PLANNING FOR THE FUTURE</h3>
      <p style={muted}>
        The Science Plan normally uses your live captured totals. You can type a different book
        total for Economy, Military, or Arcane to see what the build would target at that investment
        level. Use <b>Reset to live books</b> to return to your captured totals.
      </p>

      <h3 style={sectionTitle}>QUICK REFERENCE</h3>
      <div style={{ overflowX:"auto" }}>
        <table style={table}>
          <thead><tr><th style={th}>FIELD</th><th style={th}>MEANING</th></tr></thead>
          <tbody>
            <tr><td style={td}><b>WEIGHT</b></td><td style={td}>The priority assigned to a science in the build.</td></tr>
            <tr><td style={td}><b>NOW</b></td><td style={td}>Your current captured book investment.</td></tr>
            <tr><td style={td}><b>TARGET</b></td><td style={td}>The book amount the build calculates for that science.</td></tr>
            <tr><td style={td}><b>MOVE</b></td><td style={td}>TARGET − NOW. Positive means add books; negative means you are over target; ✓ means on target.</td></tr>
            <tr><td style={td}><b>BONUS</b></td><td style={td}>Current captured effect → estimated effect at the target.</td></tr>
            <tr><td style={td}><b>NOT IN THIS BUILD</b></td><td style={td}>Existing science investments that the build does not assign a target.</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop:18, padding:12, borderRadius:8, border:"1px solid rgba(216,255,84,.16)", background:"rgba(216,255,84,.035)" }}>
        <div style={{ fontSize:10, color:"#d8ff54", letterSpacing:".08em", fontWeight:800 }}>THE SIMPLE VERSION</div>
        <p style={{ ...muted, margin:"6px 0 0" }}>
          <b>Build weights → Target → Compare with NOW → Follow MOVE.</b><br />
          A <b>+</b> tells you where to invest more. A <b>−</b> tells you that science is already
          over the target. A <b>✓</b> means you are on target. Spartan calculates the plan; you
          make the actual investments in Utopia.
        </p>
      </div>

      <div style={{ marginTop:20, paddingTop:14, borderTop:"1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontSize:9, color:"#d8ff54", letterSpacing:".12em" }}>HOW TO MAKE A BUILD</div>
        <h3 style={{ margin:"7px 0 6px", fontSize:18 }}>Create a Build with the New Form</h3>
        <p style={muted}>
          Build creation now uses a structured form. Enter each value directly into its own field—there are no text boxes to parse and no Parse buttons.
          A saved build contains its race and personality, building percentages, optional military requirements, and science targets or priorities.
        </p>

        <h3 style={sectionTitle}>1 — BUILD DETAILS</h3>
        <p style={muted}>
          Enter a clear <b>Build name</b>. Add <b>Build by</b> if you want to record the author.
          Choose the build's <b>Race</b> and <b>Personality</b> from the dropdown menus. Check these carefully because they identify which combination the plan is designed for.
        </p>

        <h3 style={sectionTitle}>2 — ENTER BUILDING PERCENTAGES</h3>
        <p style={muted}>
          Under <b>BUILDINGS</b>, enter one building name and its percentage per row. Use <b>+ Add building</b> for every additional building.
          Use <b>Remove</b> to delete an unused or mistaken row. Enter the numeric percentage only in the Percent field; the form handles the percent sign for you.
        </p>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)", fontFamily:"monospace", fontSize:10, color:"#b7c2cc", whiteSpace:"pre-wrap" }}>Building: Farms     Percent: 7
Building: Guilds     Percent: 13
Building: Towers     Percent: 10</div>
        <p style={muted}>Enter the values from your intended build accurately. The form does not require a particular building list; add the rows that your build uses.</p>

        <h3 style={sectionTitle}>3 — ENTER MILITARY REQUIREMENTS</h3>
        <p style={muted}>
          Fill in only the requirements the build uses: <b>PPA, TPA, WPA, DSPA, EPA / OSPA, EPA / DSPA, OSPA,</b> and/or <b>GCPA</b>.
          Leave fields blank when the build has no requirement for them. Use <b>Military notes</b> for extra instructions or reminders, such as reserve requirements.
          These are planning requirements only—saving a build does not train troops or change your province.
        </p>

        <h3 style={sectionTitle}>4 — ADD SCIENCE TARGETS &amp; WEIGHTS</h3>
        <p style={muted}>
          Add each science on its own row. Choose its category (<b>Economy, Military,</b> or <b>Arcane</b>), type the science name, then choose the value type.
          Use <b>Priority weight (x)</b> when the build gives a relative priority, or <b>Target percent (%)</b> when it specifies a fixed percentage.
          Enter the number in the value field without typing the x or % symbol.
        </p>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)", fontFamily:"monospace", fontSize:10, color:"#b7c2cc", whiteSpace:"pre-wrap" }}>Category: Economy | Science: Alchemy | Type: Priority weight (x) | Value: 4
Category: Economy | Science: Artisan | Type: Target percent (%) | Value: 4.2
Category: Military | Science: Strategy | Type: Priority weight (x) | Value: 5</div>
        <p style={muted}>
          Use <b>+ Add science</b> to add rows and <b>Remove</b> to remove rows. Make sure each used row has both a science name and a value.
          A weight is a priority, not a book count. A target percentage is a fixed percentage. Keep each science in the category that the build specifies.
        </p>

        <h3 style={sectionTitle}>5 — REVIEW AND SAVE</h3>
        <p style={muted}>
          Before saving, review every field directly in the form. Confirm the build name, race, personality, building percentages, military requirements and notes, and each science's category, name, value type, and value.
          Correct mistakes before pressing <b>Save Build</b>. The form validates the entered values and reports an error if required information is missing or invalid.
        </p>
        <p style={muted}>
          When saving finishes successfully, open the saved build from the Library and verify its <b>RACE &amp; PERSONALITY</b>, <b>BUILDINGS</b>,
          <b> MILITARY REQUIREMENT</b>, and <b>SCIENCE PLAN</b> sections. If anything does not match the intended plan, edit or recreate the build with the corrected values.
        </p>

        <h3 style={sectionTitle}>6 — USE THE SCIENCE PLAN</h3>
        <p style={muted}>
          The saved science priorities and fixed-percentage targets feed the Science Plan. Compare <b>NOW</b> with <b>TARGET</b> and use <b>MOVE</b> as information for your next investments.
          A positive number means you are below target; a negative number means the current investment is over target. Spartan does not move or invest books for you—you make actual science investments in Utopia.
        </p>

        <h3 style={sectionTitle}>BEFORE YOU SAVE — CHECKLIST</h3>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)" }}>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>01 — Build name is clear and correct.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>02 — Race and personality match the intended build.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>03 — Every building name and percentage is correct.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>04 — Only applicable military requirements are filled in, with useful notes included.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>05 — Each science has the correct category and name.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>06 — Priority weight versus target percentage is selected correctly for every science.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>07 — Every science value is correct and non-negative.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>08 — The saved build opens and its sections match what you entered.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>09 — The Science Plan reflects the intended priorities and targets.</p>
        </div>
        <div style={{ marginTop:14, padding:12, borderRadius:8, border:"1px solid rgba(216,255,84,.16)", background:"rgba(216,255,84,.035)" }}>
          <div style={{ fontSize:10, color:"#d8ff54", letterSpacing:".08em", fontWeight:800 }}>THE SIMPLE VERSION</div>
          <p style={{ ...muted, margin:"6px 0 0" }}><b>Choose → Enter fields → Review → Save → Verify → Plan.</b><br />
            No pasted build text and no parsing step are needed. Enter the structured values, save the build, then confirm it in the Library before relying on its Science Plan.</p>
        </div>
      </div>
    </div>
  )
}

function BuildLab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const [builds, setBuilds] = useState<any[]>([])
  const [races, setRaces] = useState<RaceRule[]>([])
  const [personalities, setPersonalities] = useState<PersonalityRule[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showVault, setShowVault] = useState(false)
  const [vaultBuilds, setVaultBuilds] = useState<any[]>([])
  const [selectedVaultBuilds, setSelectedVaultBuilds] = useState<string[]>([])
  const [restoring, setRestoring] = useState(false)
  const [deletingVaultBuild, setDeletingVaultBuild] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function loadBuilds() {
    setError("")
    try {
      const res = await fetch("/api/builds?view=library", { cache: "no-store" })
      const contentType = res.headers.get("content-type") || ""
      const body = contentType.includes("application/json") ? await res.json() : null
      if (!res.ok) throw new Error(body?.error || "Build Library request failed (" + res.status + ")")
      if (!Array.isArray(body?.builds)) throw new Error("Build Library returned an invalid response.")
      setBuilds(body.builds)
    } catch (e) {
      setBuilds([])
      setError(e instanceof Error ? e.message : "Failed to load builds")
    }
  }
  async function loadVault() {
    setError("")
    try {
      const res = await fetch("/api/builds?view=vault", { cache: "no-store" })
      const contentType = res.headers.get("content-type") || ""
      const body = contentType.includes("application/json") ? await res.json() : null
      if (!res.ok) throw new Error(body?.error || "Stored Build Vault request failed (" + res.status + ")")
      if (!Array.isArray(body?.builds)) throw new Error("Stored Build Vault returned an invalid response.")
      setVaultBuilds(body.builds)
      setSelectedVaultBuilds([])
      setShowVault(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stored builds")
    }
  }

  async function deleteStoredBuild(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}" from Stored Builds? This cannot be undone.`)) return
    setDeletingVaultBuild(id)
    setError("")
    try {
      const res = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteStored", buildIds: [id] }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "Delete failed.")
      await loadBuilds()
      await loadVault()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete stored build")
    } finally {
      setDeletingVaultBuild(null)
    }
  }

  async function restoreSelectedBuilds() {
    if (!selectedVaultBuilds.length) return
    setRestoring(true)
    setError("")
    try {
      const res = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", buildIds: selectedVaultBuilds }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "Restore failed.")
      await loadBuilds()
      await loadVault()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore stored builds")
    } finally {
      setRestoring(false)
    }
  }

  useEffect(() => {
    fetch("/api/rules").then((r) => r.json()).then((j) => { setRaces(j.races || []); setPersonalities(j.personalities || []) })
  }, [])
  useEffect(() => { if (!id) loadBuilds() }, [id])

  return (
    <main style={shell}>
      <Sidebar active="Build Lab" />
      <section style={{ flex: 1, padding: "30px 34px", maxWidth: 1500 }}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:9, color:"#67f0b0", letterSpacing:".2em" }}>SPARTAN // BUILD LAB</div>
            <h1 style={{ fontSize:34, margin:"7px 0 0" }}>Build Library</h1>
          </div>
          {!id && (
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button
                style={showInstructions ? btnPrimary : btnGhost}
                onClick={() => setShowInstructions((s) => !s)}
              >
                {showInstructions ? "Library" : "▤ Instructions"}
              </button>
              <button style={btnGhost} onClick={loadVault}>▣ Stored Builds</button>
              <button style={btnPrimary} onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "+ Add Build"}</button>
            </div>
          )}
        </header>

        {error && <div style={{ ...card, borderColor:"rgba(255,100,100,.3)", color:"#ff9b9b", marginBottom:16 }}>{error}</div>}

        {!id && showVault && (
          <div style={{ ...card, marginBottom:20, borderColor:"rgba(216,255,84,.2)", background:"linear-gradient(135deg, rgba(216,255,84,.045), rgba(8,17,25,.96))" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:9, color:"#d8ff54", letterSpacing:".18em" }}>BUILD VAULT // STORED DATA</div>
                <h2 style={{ margin:"6px 0 4px" }}>Recover Stored Builds</h2>
                <p style={{ margin:0, fontSize:11, color:"#8993a1" }}>These are existing Spartan build records. Restoring them makes them visible in your Library — it does not create duplicates.</p>
              </div>
              <button style={btnGhost} onClick={() => setShowVault(false)}>Close</button>
            </div>
            {vaultBuilds.length === 0 ? (
              <p style={{ color:"#687686", fontSize:11 }}>No stored build records were returned.</p>
            ) : (
              <>
                <div style={{ display:"grid", gap:6, maxHeight:360, overflowY:"auto", paddingRight:4 }}>
                  {vaultBuilds.map((b) => {
                    const selected = selectedVaultBuilds.includes(b.id)
                    return (
                      <div key={b.id} style={{
                        display:"flex", alignItems:"center", gap:10, padding:"11px 12px",
                        border:"1px solid " + (selected ? "rgba(216,255,84,.35)" : "rgba(255,255,255,.07)"),
                        borderRadius:8, background:selected ? "rgba(216,255,84,.06)" : "rgba(255,255,255,.02)"
                      }}>
                        <input aria-label={`Select ${b.name}`} type="checkbox" checked={selected} onChange={(e) => setSelectedVaultBuilds((current) =>
                          e.target.checked ? [...current, b.id] : current.filter((id) => id !== b.id)
                        )} />
                        <span style={{ flex:1, minWidth:0 }}>
                          <b style={{ fontSize:12 }}>{b.name}</b>
                          <span style={{ display:"block", fontSize:10, color:"#8993a1", marginTop:3 }}>
                            {[b.race, b.personality].filter(Boolean).join(" / ") || "No race/personality set"}{b.author ? " · set by " + b.author : ""}
                            {" · Age " + (b.rules_age_number ?? "unknown")}
                          </span>
                        </span>
                        <span style={{ fontSize:9, color:b.active ? "#67f0b0" : "#ffcf70", letterSpacing:".08em", whiteSpace:"nowrap" }}>
                          {b.active ? "IN LIBRARY" : "STORED"}
                        </span>
                        <button
                          type="button"
                          style={btnDanger}
                          disabled={deletingVaultBuild === b.id}
                          onClick={() => deleteStoredBuild(b.id, b.name)}
                        >
                          {deletingVaultBuild === b.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14 }}>
                  <button style={btnPrimary} disabled={!selectedVaultBuilds.length || restoring} onClick={restoreSelectedBuilds}>
                    {restoring ? "Restoring…" : "Add Selected to Library (" + selectedVaultBuilds.length + ")"}
                  </button>
                  <button style={btnGhost} onClick={() => setSelectedVaultBuilds(vaultBuilds.map((b) => b.id))}>Select All</button>
                  <button style={btnGhost} onClick={() => setSelectedVaultBuilds([])}>Clear</button>
                </div>
              </>
            )}
          </div>
        )}

        {id ? (
          <BuildDetail id={id} races={races} personalities={personalities} onBack={() => router.push("/command/build-lab")} onDeleted={() => router.push("/command/build-lab")} />
        ) : showInstructions ? (
          <BuildInstructions />
        ) : (
          <>
            {showForm && <NewBuildForm races={races} personalities={personalities} onSaved={() => { setShowForm(false); loadBuilds() }} />}
            <div style={{ display:"grid", gap:10 }}>
              {builds.map((b) => (
                <button key={b.id} onClick={() => router.push(`/command/build-lab?id=${b.id}`)} style={{ ...card, textAlign:"left", cursor:"pointer" }}>
                  <p style={{ margin:0, fontWeight:700 }}>{b.name}</p>
                  <p style={{ margin:"4px 0 0", fontSize:11, color:"#8993a1" }}>
                    {[b.race, b.personality].filter(Boolean).join(" / ") || "No race/personality set"}
                    {b.author ? ` · set by ${b.author}` : ""}
                  </p>
                </button>
              ))}
              {!builds.length && !error && <p style={{ color:"#687686" }}>No builds saved yet.</p>}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main style={{ ...shell, alignItems:"center", justifyContent:"center" }}>Loading Build Lab…</main>}>
      <BuildLab />
    </Suspense>
  )
}
