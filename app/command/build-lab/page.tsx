"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { parseBuildText, parseMilitaryRequirementText, parseScienceText, ParsedBuild, ParsedMilitaryRequirement, ParsedScience } from "@/lib/spartan/build-parser"
import { buildPlan, type LiveCategory } from "@/lib/spartan/science-plan"

const navCommand = [["Command","/"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Wiki","/command/wiki"],["Tools","/command/tools"],["Scraper Generator","/command/scraper"]]
const navIntel = [["Kingdom","/command/kingdom"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"]]

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
  const [buildText, setBuildText] = useState("")
  const [militaryText, setMilitaryText] = useState("")
  const [scienceText, setScienceText] = useState("")
  const [parsedBuild, setParsedBuild] = useState<ParsedBuild | null>(null)
  const [parsedMilitary, setParsedMilitary] = useState<ParsedMilitaryRequirement | null>(null)
  const [parsedScience, setParsedScience] = useState<ParsedScience | null>(null)
  const [race, setRace] = useState("")
  const [personality, setPersonality] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!parsedBuild?.name) { setError("Parse Box 1 first — a build name is required."); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/builds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parsedBuild.name, author: parsedBuild.author, race: race || null, personality: personality || null,
          buildings: parsedBuild.buildings, science: parsedScience || { economy:{}, military:{}, arcane:{} },
          military_requirement: parsedMilitary || {}, raw_build_text: buildText, raw_military_text: militaryText, raw_science_text: scienceText,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Save failed.")
      onSaved()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>Add a Build</h2>

      <p style={{ fontSize:10, color:"#67f0b0", letterSpacing:".1em", marginBottom:4 }}>1 — BUILD (name + buildings)</p>
      <textarea style={textarea} placeholder={"🏗 **orc cleric** build — set by Savage\n  Farms 7%\n  Guilds 13%\n  ..."} value={buildText} onChange={(e) => setBuildText(e.target.value)} />
      <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setParsedBuild(parseBuildText(buildText))}>Parse</button>
      {parsedBuild && (
        <div style={{ fontSize: 11, marginTop: 10, color: "#b7c2cc" }}>
          <p>Name: <b style={{ color:"#e7eef5" }}>{parsedBuild.name || "—"}</b> · By: {parsedBuild.author || "—"}</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:2 }}>
            {Object.entries(parsedBuild.buildings).map(([k, v]) => <span key={k}>{k}: <b style={{color:"#d8ff54"}}>{v}%</b></span>)}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <select style={select} value={race} onChange={(e) => setRace(e.target.value)}>
              <option value="">Race…</option>
              {races.map((r) => <option key={r.race} value={r.race}>{r.emoji} {r.race}</option>)}
            </select>
            <select style={select} value={personality} onChange={(e) => setPersonality(e.target.value)}>
              <option value="">Personality…</option>
              {personalities.map((p) => <option key={p.personality} value={p.personality}>{p.emoji} {p.personality}</option>)}
            </select>
          </div>
        </div>
      )}

      <p style={{ fontSize:10, color:"#67f0b0", letterSpacing:".1em", margin:"18px 0 4px" }}>2 — MILITARY REQUIREMENT (ppa/tpa/wpa/dspa/epa-ospa + notes)</p>
      <textarea style={textarea} placeholder={"Military\n\n6ppa\n3tpa\n1.5 wpa\n6 dspa\n10.5 epa/ospa\n\nKeep in mind you need 350 GCPA for drake reserves."} value={militaryText} onChange={(e) => setMilitaryText(e.target.value)} />
      <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setParsedMilitary(parseMilitaryRequirementText(militaryText))}>Parse</button>
      {parsedMilitary && (
        <div style={{ fontSize: 11, marginTop: 10, color: "#b7c2cc" }}>
          <p style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
            <span>PPA: {parsedMilitary.ppa ?? "—"}</span><span>TPA: {parsedMilitary.tpa ?? "—"}</span><span>WPA: {parsedMilitary.wpa ?? "—"}</span>
            <span>DSPA: {parsedMilitary.dspa ?? "—"}</span><span>OSPA: {parsedMilitary.ospa ?? "—"}</span><span>EPA/DSPA: {parsedMilitary.epa_dspa ?? "—"}</span>
            {parsedMilitary.gcpa != null && <span>GCPA: {parsedMilitary.gcpa}</span>}
          </p>
          {parsedMilitary.notes && <p style={{ fontStyle:"italic", color:"#8993a1" }}>{parsedMilitary.notes}</p>}
        </div>
      )}

      <p style={{ fontSize:10, color:"#67f0b0", letterSpacing:".1em", margin:"18px 0 4px" }}>3 — SCIENCE (Economy / Military / Arcane)</p>
      <textarea style={textarea} placeholder={"ECONOMY SCIENCE\n\n4x Alchemy\n4.2% Artisan (actual % needed)\n\nMILITARY SCIENCE\n\n5x Strategy\n...\n\nARCANE\n\n10x Crime\n..."} value={scienceText} onChange={(e) => setScienceText(e.target.value)} />
      <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setParsedScience(parseScienceText(scienceText))}>Parse</button>
      {parsedScience && (
        <div style={{ fontSize: 11, marginTop: 10, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, color: "#b7c2cc" }}>
          {(["economy","military","arcane"] as const).map((cat) => (
            <div key={cat}>
              <p style={{ color:"#687686", textTransform:"uppercase", fontSize:9 }}>{cat}</p>
              {Object.entries(parsedScience[cat]).map(([name, e]) => <p key={name}>{name}: <b style={{color:"#d8ff54"}}>{e.type === "weight" ? `${e.value}x` : `${e.value}%*`}</b></p>)}
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color:"#ff9b9b", fontSize:11, marginTop:10 }}>{error}</p>}
      <button style={{ ...btnPrimary, marginTop:16 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Build"}</button>
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

  useEffect(() => {\n    if (!build || currentAge == null) return\n    const pinnedAge = Number(build.rules_age_number)\n    if (Number.isFinite(pinnedAge) && pinnedAge !== currentAge) {\n      setBooks({ economy: 0, military: 0, arcane: 0 })\n      setAgeChanged(true)\n    }\n  }, [build, currentAge])\n\n  const plan = useMemo(() => build ? buildPlan(build.science, live?.cats || null, books) : [], [build, live, books])
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
        <h3 style={{ margin:"7px 0 6px", fontSize:18 }}>Create a Build in Spartan</h3>
        <p style={muted}>A Spartan build is a complete province plan: <b>race + personality, buildings, military requirements, and science priorities</b>. The New Build form is split into three boxes so Spartan can parse each part and show you exactly what it understood before you save it.</p>
        <h3 style={sectionTitle}>1 — CHOOSE RACE &amp; PERSONALITY</h3>
        <p style={muted}>Start by deciding which race and personality the build is for. After Spartan parses Box 1, select the matching <b>Race</b> and <b>Personality</b> from the menus. These are saved with the build and the applicable rules are pinned to the build so you can review what the build was designed around.</p>
        <h3 style={sectionTitle}>2 — WRITE THE BUILDING PLAN</h3>
        <p style={muted}>In <b>1 — BUILD</b>, enter the build name and building percentages. You can paste the build in the same style you normally use.</p>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)", fontFamily:"monospace", fontSize:10, color:"#b7c2cc", whiteSpace:"pre-wrap" }}>🏗 **orc cleric** build — set by Savage\n  Farms 7%\n  Guilds 13%\n  ...</div>
        <p style={muted}>Press <b>Parse</b>. Check the preview for the build name, author, and every building percentage. If Spartan did not understand something correctly, fix the text and parse it again before moving on.</p>
        <h3 style={sectionTitle}>3 — SET THE MILITARY REQUIREMENT</h3>
        <p style={muted}>In <b>2 — MILITARY REQUIREMENT</b>, enter the minimum military requirements the build is meant to maintain. Spartan reads the requirement values and keeps additional notes with the build.</p>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)", fontFamily:"monospace", fontSize:10, color:"#b7c2cc", whiteSpace:"pre-wrap" }}>Military\n\n6ppa\n3tpa\n1.5 wpa\n6 dspa\n10.5 epa/ospa\n\nKeep in mind you need 350 GCPA for drake reserves.</div>
        <p style={muted}>Review the parsed <b>PPA, TPA, WPA, DSPA, OSPA, EPA/DSPA, GCPA</b> values and the notes. The military section describes the requirements of the build; it does not train troops or change your province.</p>
        <h3 style={sectionTitle}>4 — SET THE SCIENCE PRIORITIES</h3>
        <p style={muted}>In <b>3 — SCIENCE</b>, enter the sciences and their priorities. You can use either a weight such as <b>4x</b> or an actual percentage such as <b>4.2%</b>, depending on what the build specifies. Keep the three categories separated as <b>Economy</b>, <b>Military</b>, and <b>Arcane</b>.</p>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)", fontFamily:"monospace", fontSize:10, color:"#b7c2cc", whiteSpace:"pre-wrap" }}>ECONOMY SCIENCE\n\n4x Alchemy\n4.2% Artisan (actual % needed)\n\nMILITARY SCIENCE\n\n5x Strategy\n...\n\nARCANE\n\n10x Crime\n...</div>
        <p style={muted}><b>Important:</b> a science weight is a priority, not a book count. Spartan uses the saved priorities to calculate the Science Plan target when you view the finished build.</p>
        <h3 style={sectionTitle}>5 — PARSE &amp; CHECK EVERYTHING</h3>
        <p style={muted}>Do not save blindly. Parse each box and inspect the preview. Make sure the name, buildings, military numbers, science entries, race, and personality all match the build you intended. This is the best point to catch a typo or a line Spartan did not understand.</p>
        <h3 style={sectionTitle}>6 — SAVE THE BUILD</h3>
        <p style={muted}>Once the parsed information looks correct, select the race and personality and press <b>Save Build</b>. Spartan stores the parsed build data along with the original text, so the build can be opened and reviewed later.</p>
        <h3 style={sectionTitle}>7 — OPEN THE SAVED BUILD &amp; VERIFY</h3>
        <p style={muted}>Open the build from the Library after saving. Verify the <b>RACE &amp; PERSONALITY</b>, <b>BUILDINGS</b>, <b>MILITARY REQUIREMENT</b>, and <b>SCIENCE PLAN</b> sections. If the build is tied to a race/personality and the rules change, Spartan can resync the build to the latest rules.</p>
        <h3 style={sectionTitle}>8 — USE THE SCIENCE PLAN</h3>
        <p style={muted}>Once the build is saved, the Science Plan turns its science priorities into targets. Compare <b>NOW</b> against <b>TARGET</b> and use <b>MOVE</b> as your guide. A positive number means invest more books; a negative number means you are already over that target. Spartan does not move books for you — actual science investment is done manually in Utopia.</p>
        <h3 style={sectionTitle}>BEFORE YOU SAVE — CHECKLIST</h3>
        <div style={{ ...card, marginTop:8, background:"rgba(255,255,255,.02)" }}>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>01 — Build has a clear name.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>02 — Race and personality are the intended combination.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>03 — Building percentages match the build you meant to enter.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>04 — Military requirements are correct: PPA / TPA / WPA / DSPA / OSPA / EPA-DSPA / GCPA where applicable.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>05 — Important military notes are present.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>06 — Science names and categories are correct.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>07 — Science weights are priorities, not book counts.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>08 — Any actual-percentage science entries are entered as percentages.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>09 — Every Parse preview matches what you intended.</p>
          <p style={{ margin:"7px 0", fontSize:11, color:"#b7c2cc" }}>10 — You opened the saved build and checked it after saving.</p>
        </div>
        <div style={{ marginTop:14, padding:12, borderRadius:8, border:"1px solid rgba(216,255,84,.16)", background:"rgba(216,255,84,.035)" }}>
          <div style={{ fontSize:10, color:"#d8ff54", letterSpacing:".08em", fontWeight:800 }}>THE SIMPLE VERSION</div>
          <p style={{ ...muted, margin:"6px 0 0" }}><b>Choose → Enter → Parse → Check → Save → Verify → Plan.</b><br />Build the plan in plain text, let Spartan parse it, confirm Spartan understood it, then save it. The saved build becomes the reference for the Library and Science Plan.</p>
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
                      <label key={b.id} style={{
                        display:"flex", alignItems:"center", gap:10, padding:"11px 12px",
                        border:"1px solid " + (selected ? "rgba(216,255,84,.35)" : "rgba(255,255,255,.07)"),
                        borderRadius:8, background:selected ? "rgba(216,255,84,.06)" : "rgba(255,255,255,.02)", cursor:"pointer"
                      }}>
                        <input type="checkbox" checked={selected} onChange={(e) => setSelectedVaultBuilds((current) =>
                          e.target.checked ? [...current, b.id] : current.filter((id) => id !== b.id)
                        )} />
                        <span style={{ flex:1 }}>
                          <b style={{ fontSize:12 }}>{b.name}</b>
                          <span style={{ display:"block", fontSize:10, color:"#8993a1", marginTop:3 }}>
                            {[b.race, b.personality].filter(Boolean).join(" / ") || "No race/personality set"}{b.author ? " · set by " + b.author : ""}
                          </span>
                        </span>
                        <span style={{ fontSize:9, color:b.active ? "#67f0b0" : "#ffcf70", letterSpacing:".08em" }}>
                          {b.active ? "IN LIBRARY" : "STORED"}
                        </span>
                      </label>
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
