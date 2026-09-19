"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { parseBuildText, parseMilitaryRequirementText, parseScienceText, ParsedBuild, ParsedMilitaryRequirement, ParsedScience } from "@/lib/spartan/build-parser"
import { calculateAllocations } from "@/lib/spartan/science-calculator"

const nav = [["Command","/"],["Kingdom","/command/kingdom"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["Wiki","/command/wiki"],["Tools","/command/tools"]]

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
      {nav.map(([name, path]) => (
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

  useEffect(() => {
    fetch(`/api/builds/${id}`).then((r) => r.json()).then((j) => j.build ? setBuild(j.build) : setError(j.error || "Not found"))
  }, [id])

  const allocations = useMemo(() => build ? calculateAllocations(build.science, books) : [], [build, books])
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

      <h3 style={{ fontSize:12, color:"#67f0b0", letterSpacing:".1em", marginTop:20 }}>SCIENCE CALCULATOR</h3>
      <div style={{ display:"flex", gap:14, marginBottom:14 }}>
        {(["economy","military","arcane"] as const).map((cat) => (
          <label key={cat} style={{ fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ color:"#8993a1", textTransform:"capitalize" }}>{cat} books</span>
            <input type="number" min={0} style={{ ...input, width:110 }} value={books[cat] || ""} onChange={(e) => setBooks((b) => ({ ...b, [cat]: Number(e.target.value) || 0 }))} />
          </label>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {allocations.map((alloc) => (
          <div key={alloc.category}>
            <p style={{ fontSize:9, color:"#687686", textTransform:"uppercase" }}>{alloc.category}</p>
            {alloc.rows.map((row) => (
              <p key={row.name} style={{ fontSize:11, display:"flex", justifyContent:"space-between" }}>
                <span>{row.name}</span>
                <b style={{ color:"#d8ff54" }}>{row.books.toLocaleString()}{row.type === "actual_pct" && <span style={{ color:"#687686" }}> (fixed {row.input}%)</span>}</b>
              </p>
            ))}
          </div>
        ))}
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
  const [error, setError] = useState("")

  function loadBuilds() {
    fetch("/api/builds").then((r) => r.json()).then((j) => j.builds ? setBuilds(j.builds) : setError(j.error || "Failed to load builds"))
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
          {!id && <button style={btnPrimary} onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "+ Add Build"}</button>}
        </header>

        {error && <div style={{ ...card, borderColor:"rgba(255,100,100,.3)", color:"#ff9b9b", marginBottom:16 }}>{error}</div>}

        {id ? (
          <BuildDetail id={id} races={races} personalities={personalities} onBack={() => router.push("/command/build-lab")} onDeleted={() => router.push("/command/build-lab")} />
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
