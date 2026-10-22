"use client"

import { useEffect, useMemo, useState } from "react"
import { calculateCategoryAllocation } from "@/lib/spartan/science-calculator"
import { normalizeScience } from "@/lib/spartan/science-plan"
import {
  AGE117_CAP, AGE117_CAPPED, SCIENCES, SCIENTIFIC_INSIGHTS, REVELATION, SCIENTIST_BOOKS_PER_TICK,
  defByName, impliedExtraMod, norm, personalityMod, scienceBonus, spawnRate, type Opts, type ScienceCat,
} from "@/lib/spartan/science-formula"

const card: React.CSSProperties = { padding: 20, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, background: "#081119" }
const input: React.CSSProperties = { background: "#05080d", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, padding: "8px 10px", color: "#dce7ee", fontSize: 12, width: "100%", boxSizing: "border-box" }
const label: React.CSSProperties = { fontSize: 9, color: "#8993a1", letterSpacing: ".12em", display: "block", marginBottom: 4 }
const ghost: React.CSSProperties = { background: "transparent", color: "#aeb9c5", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, padding: "8px 12px", fontSize: 11, cursor: "pointer" }
const primary: React.CSSProperties = { background: "#d8ff54", color: "#101408", border: 0, borderRadius: 8, padding: "8px 12px", fontWeight: 800, fontSize: 11, cursor: "pointer" }
const h3: React.CSSProperties = { fontSize: 11, color: "#67f0b0", letterSpacing: ".12em", margin: "22px 0 10px" }
const CATS: ScienceCat[] = ["Economy", "Military", "Arcane Arts"]
const CAT_COLOR: Record<ScienceCat, string> = { Economy: "#d8ff54", Military: "#ff7b7b", "Arcane Arts": "#a58bff" }

const CAT_KEY: Record<ScienceCat, "economy" | "military" | "arcane"> = { Economy: "economy", Military: "military", "Arcane Arts": "arcane" }
const LIVE_NAME: Record<string, ScienceCat> = { economy: "Economy", military: "Military", arcane: "Arcane Arts" }
type BuildSummary = { id: string; name: string; race: string | null; personality: string | null }
const matchName = (list: string[], value: string | null | undefined) => (value ? list.find((x) => norm(x) === norm(value)) || "" : "")

const FALLBACK_RACES = ["Avian", "Dark Elf", "Dryad", "Dwarf", "Elf", "Faery", "Gnome", "Halfling", "Human", "Orc", "Undead"]
const FALLBACK_PERSONALITIES = ["The Cleric", "The General", "The Heretic", "The Mystic", "The Rogue", "The Sage", "The Tactician", "The Warrior"]

const num = (v: string) => {
  const n = Number(String(v).replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const pct = (n: number) => `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

export default function ScienceCalc() {
  const [races, setRaces] = useState<string[]>(FALLBACK_RACES)
  const [personalities, setPersonalities] = useState<string[]>(FALLBACK_PERSONALITIES)
  const [race, setRace] = useState("")
  const [personality, setPersonality] = useState("")
  const [books, setBooks] = useState<Record<string, string>>({})
  const [scientificInsights, setScientificInsights] = useState(false)
  const [extra, setExtra] = useState("1")
  const [age117Caps, setAge117Caps] = useState(false)
  const [calSci, setCalSci] = useState("Alchemy")
  const [calBooks, setCalBooks] = useState("")
  const [calEffect, setCalEffect] = useState("")
  const [scientists, setScientists] = useState<Record<string, string>>({})
  const [universities, setUniversities] = useState("1")
  const [revelation, setRevelation] = useState(false)
  const [buildList, setBuildList] = useState<BuildSummary[]>([])
  const [buildId, setBuildId] = useState("")
  const [build, setBuild] = useState<any>(null)
  const [buildMsg, setBuildMsg] = useState("")
  const [catBooks, setCatBooks] = useState<Record<string, string>>({ economy: "", military: "", arcane: "" })

  useEffect(() => {
    fetch("/api/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const rs = Array.isArray(j?.races) ? j.races.map((r: { race?: string }) => r.race).filter(Boolean) as string[] : []
        const ps = Array.isArray(j?.personalities) ? j.personalities.map((p: { personality?: string }) => p.personality).filter(Boolean) as string[] : []
        if (rs.length) setRaces(rs)
        if (ps.length) setPersonalities(ps)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch("/api/builds?view=library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (Array.isArray(j?.builds)) setBuildList(j.builds) })
      .catch(() => {})
  }, [])

  function pickBuild(id: string) {
    setBuildId(id)
    setBuildMsg("")
    if (!id) { setBuild(null); return }
    fetch(`/api/builds/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.build) { setBuild(null); setBuildMsg(j?.error || "Could not load that build."); return }
        setBuild(j.build)
        const r = matchName(races, j.build.race)
        const p = matchName(personalities, j.build.personality)
        if (r) setRace(r)
        if (p) setPersonality(p)
      })
      .catch(() => { setBuild(null); setBuildMsg("Could not load that build.") })
  }

  function useLiveBooks() {
    setBuildMsg("")
    fetch("/api/page-models?page=science", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const cats: { name: string; totalBooks: number; booksAvailable: number }[] = j?.model?.current?.categories || []
        if (j?.scienceStatus?.hasCurrentAgeData === false || !cats.length) {
          setBuildMsg("No current-age science data. Open Council → Science with the scraper running to capture this age; previous-age books are not used.")
          return
        }
        const next: Record<string, string> = { economy: "", military: "", arcane: "" }
        for (const key of Object.keys(LIVE_NAME)) {
          const c = cats.find((x) => x.name === LIVE_NAME[key])
          if (c) next[key] = String((c.totalBooks || 0) + (c.booksAvailable || 0))
        }
        setCatBooks(next)
      })
      .catch(() => setBuildMsg("Could not read your live Science page."))
  }

  const inBuild = !!build?.science
  const plan = useMemo(() => {
    const planned: Record<string, number> = {}
    const info: Record<string, { type: string; value: number }> = {}
    const unknown: string[] = []
    if (!build?.science) return { planned, info, unknown }
    const known = new Set(SCIENCES.map((d) => d.name.toLowerCase()))
    for (const cat of CATS) {
      const key = CAT_KEY[cat]
      for (const r of calculateCategoryAllocation(key, normalizeScience(build.science, build.raw_science_text)[key] || {}, num(catBooks[key] || "")).rows) {
        const k = r.name.toLowerCase()
        if (!known.has(k)) { unknown.push(r.name); continue }
        planned[k] = r.books
        info[k] = { type: r.type, value: r.input }
      }
    }
    return { planned, info, unknown }
  }, [build, catBooks])

  function keepAsManual() {
    const next: Record<string, string> = {}
    for (const d of SCIENCES) { const n = plan.planned[d.name.toLowerCase()] ?? 0; if (n) next[d.name] = String(n) }
    setBooks(next)
    setBuildId("")
    setBuild(null)
  }

  const extraMod = num(extra) || 1
  const opts: Opts = { personality, scientificInsights, extraMod, age117Caps }

  const rows = useMemo(() => SCIENCES.map((def) => {
    const b = inBuild ? (plan.planned[def.name.toLowerCase()] ?? 0) : num(books[def.name] || "")
    const now = scienceBonus(def, b, opts)
    const plus = scienceBonus(def, b + 1000, opts)
    return { def, books: b, bonus: now.value, capped: now.capped, gain: plus.value - now.value, pMod: personalityMod(def, personality) }
  }), [books, personality, scientificInsights, extraMod, age117Caps, inBuild, plan])

  const totals = CATS.map((cat) => ({ cat, books: rows.filter((r) => r.def.cat === cat).reduce((s, r) => s + r.books, 0) }))
  const totalBooks = totals.reduce((s, t) => s + t.books, 0)

  const calDef = defByName(calSci)
  const implied = impliedExtraMod(calDef, num(calBooks), num(calEffect), { ...opts, extraMod: 1 })

  const booksPerTick = Object.entries(SCIENTIST_BOOKS_PER_TICK).reduce((s, [rank, rate]) => s + num(scientists[rank] || "") * rate, 0)
  const spawn = spawnRate(race, num(universities) || 1, revelation)

  return (
    <section style={card}>
      <h2 style={{ margin: 0 }}>Science Calculator</h2>
      <p style={{ fontSize: 12, color: "#aeb9c5", margin: "6px 0 0" }}>
        Pick a build from your library and enter your books per category, or type the books for each science by hand. The bonus uses the formula in the Spartan wiki (books^(1/2.125) × science multiplier × personality × Scientific Insights × your other modifiers).
      </p>
      <h3 style={h3}>USE A BUILD FROM YOUR LIBRARY</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, alignItems: "end" }}>
        <div><span style={label}>BUILD</span><select style={input} value={buildId} onChange={(e) => pickBuild(e.target.value)}><option value="">{buildList.length ? "No build (type books by hand)" : "No builds found"}</option>{buildList.map((b) => <option key={b.id} value={b.id}>{b.name}{b.race || b.personality ? ` · ${[b.race, b.personality].filter(Boolean).join(" / ")}` : ""}</option>)}</select></div>
        {inBuild && (["economy", "military", "arcane"] as const).map((key) => <div key={key}><span style={label}>{key.toUpperCase()} BOOKS</span><input style={input} inputMode="numeric" value={catBooks[key]} placeholder="0" onChange={(e) => setCatBooks((c) => ({ ...c, [key]: e.target.value }))} /></div>)}
      </div>
      {inBuild && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><button style={primary} onClick={useLiveBooks}>Use my live books</button><button style={ghost} onClick={keepAsManual}>Keep these numbers and edit by hand</button></div>}
      {inBuild && <p style={{ fontSize: 11, color: "#8993a1", margin: "10px 0 0" }}>{build.name}: fixed-% sciences are taken off the top of each category first, then the rest of the books split by weight. Race and personality were set from the build.</p>}
      {plan.unknown.length > 0 && <p style={{ fontSize: 11, color: "#ffb35c", margin: "6px 0 0" }}>Not recognized as a science, so skipped: {plan.unknown.join(", ")}</p>}
      {buildMsg && <p style={{ fontSize: 11, color: "#ffb35c", margin: "8px 0 0" }}>{buildMsg}</p>}
      <h3 style={h3}>YOUR BUILD</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <div><span style={label}>RACE</span><select style={input} value={race} onChange={(e) => setRace(e.target.value)}><option value="">Choose race</option>{races.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
        <div><span style={label}>PERSONALITY</span><select style={input} value={personality} onChange={(e) => setPersonality(e.target.value)}><option value="">Choose personality</option>{personalities.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><span style={label}>OTHER MODIFIERS (LIBRARIES, ETC.)</span><input style={input} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="1.00" /></div>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "#aeb9c5" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={scientificInsights} onChange={(e) => setScientificInsights(e.target.checked)} />Scientific Insights active (×{SCIENTIFIC_INSIGHTS})</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={age117Caps} onChange={(e) => setAge117Caps(e.target.checked)} />Age 117 proposed −{AGE117_CAP}% cap ({[...AGE117_CAPPED].join(", ")})</label>
      </div>
      {personality && rows.some((r) => r.pMod !== 1) && <p style={{ fontSize: 11, color: "#67f0b0", margin: "10px 0 0" }}>{personality}: {rows.filter((r) => r.pMod !== 1).map((r) => `${r.def.name} ×${r.pMod}`).join(", ")}</p>}
      {personality && rows.every((r) => r.pMod === 1) && <p style={{ fontSize: 11, color: "#687686", margin: "10px 0 0" }}>The wiki lists no science bonus for {personality}.</p>}
      <h3 style={h3}>BOOKS &amp; BONUS</h3>
      <div style={{ overflowX: "auto" }}>
        {CATS.map((cat) => <div key={cat} style={{ marginBottom: 14, minWidth: 560 }}>
          <div style={{ fontSize: 10, letterSpacing: ".14em", color: CAT_COLOR[cat], marginBottom: 6 }}>{cat.toUpperCase()} · {totals.find((t) => t.cat === cat)!.books.toLocaleString()} books</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.6fr 1.2fr 1fr 1fr", gap: "6px 10px", alignItems: "center", fontSize: 11 }}>
            {["SCIENCE", "EFFECT", "BOOKS", "BONUS", "+1,000 BOOKS"].map((h) => <span key={h} style={{ fontSize: 9, color: "#687686", letterSpacing: ".08em" }}>{h}</span>)}
            {rows.filter((r) => r.def.cat === cat).map((r) => [
              <span key={r.def.name + "n"}><b>{r.def.name}</b>{inBuild && (plan.info[r.def.name.toLowerCase()] ? <span style={{ color: "#687686", fontSize: 10 }}> {plan.info[r.def.name.toLowerCase()].type === "weight" ? `${plan.info[r.def.name.toLowerCase()].value}x` : `${plan.info[r.def.name.toLowerCase()].value}% fixed`}</span> : <span style={{ color: "#4d5966", fontSize: 10 }}> not in build</span>)}</span>,
              <span key={r.def.name + "e"} style={{ color: "#8993a1" }}>{r.def.effect}</span>,
              <input key={r.def.name + "i"} style={{ ...input, ...(inBuild ? { opacity: 0.75 } : {}) }} inputMode="numeric" readOnly={inBuild} value={inBuild ? (r.books ? String(r.books) : "") : books[r.def.name] || ""} placeholder="0" onChange={(e) => setBooks((b) => ({ ...b, [r.def.name]: e.target.value }))} />,
              <b key={r.def.name + "b"} style={{ color: r.capped ? "#ffb35c" : "#d8ff54" }}>{r.books ? pct(r.bonus) : "—"}{r.capped ? " (cap)" : ""}</b>,
              <span key={r.def.name + "g"} style={{ color: "#8993a1" }}>{r.books && !r.capped ? `+${r.gain.toFixed(2)}%` : "—"}</span>,
            ])}
          </div>
        </div>)}
      </div>
      <p style={{ fontSize: 10, color: "#687686", margin: 0 }}>Total books entered: <b style={{ color: "#dce7ee" }}>{totalBooks.toLocaleString()}</b>. The last column shows what 1,000 more books would add, so you can see where books are worth the most. Reduction sciences are shown as the size of the reduction.</p>
      <button style={{ ...ghost, marginTop: 10 }} onClick={() => setBooks({})}>Clear books</button>
      <h3 style={h3}>CHECK AGAINST YOUR SCIENCE PAGE</h3>
      <p style={{ fontSize: 11, color: "#8993a1", margin: "0 0 10px" }}>The wiki formula has no land term and doesn't know your libraries or other effects. Enter one science from your in-game page (its books and the effect it shows) and this works out the modifier needed to match it.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, alignItems: "end" }}>
        <div><span style={label}>SCIENCE</span><select style={input} value={calSci} onChange={(e) => setCalSci(e.target.value)}>{SCIENCES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
        <div><span style={label}>BOOKS</span><input style={input} inputMode="numeric" value={calBooks} onChange={(e) => setCalBooks(e.target.value)} placeholder="e.g. 8000" /></div>
        <div><span style={label}>EFFECT SHOWN (%)</span><input style={input} inputMode="decimal" value={calEffect} onChange={(e) => setCalEffect(e.target.value)} placeholder="e.g. 5.6" /></div>
        <div>{implied != null ? <button style={primary} onClick={() => setExtra(implied.toFixed(4))}>Use ×{implied.toFixed(3)}</button> : <span style={{ fontSize: 10, color: "#687686" }}>Enter books and effect</span>}</div>
      </div>
      {implied != null && <p style={{ fontSize: 11, margin: "10px 0 0", color: Math.abs(implied - 1) < 0.02 ? "#67f0b0" : "#ffb35c" }}>{Math.abs(implied - 1) < 0.02 ? "The wiki formula matches your page, so no extra modifier is needed." : `Your page is ${implied > 1 ? "higher" : "lower"} than the plain formula by ×${implied.toFixed(3)} (libraries, amnesia or other effects). Apply it to use it for every science above.`}</p>}
      <h3 style={h3}>SCIENTISTS</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12 }}>
        {Object.entries(SCIENTIST_BOOKS_PER_TICK).map(([rank, rate]) => <div key={rank}><span style={label}>{rank.toUpperCase()} ({rate}/TICK)</span><input style={input} inputMode="numeric" value={scientists[rank] || ""} placeholder="0" onChange={(e) => setScientists((s) => ({ ...s, [rank]: e.target.value }))} /></div>)}
        <div><span style={label}>UNIVERSITIES EFFECT (×)</span><input style={input} inputMode="decimal" value={universities} onChange={(e) => setUniversities(e.target.value)} placeholder="1.00" /></div>
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, fontSize: 11, color: "#aeb9c5" }}><input type="checkbox" checked={revelation} onChange={(e) => setRevelation(e.target.checked)} />Revelation active (×{REVELATION} spawn rate)</label>
      <p style={{ fontSize: 11, margin: "10px 0 0", color: "#dce7ee" }}>Book production: <b style={{ color: "#d8ff54" }}>{booksPerTick.toLocaleString()}</b> books/tick{" · "}Spawn rate (wiki formula): <b style={{ color: "#d8ff54" }}>{spawn.toFixed(2)}</b>{norm(race) === "human" ? " (Human ×1.25)" : ""}</p>
      <p style={{ fontSize: 10, color: "#687686", margin: "6px 0 0" }}>Source: Spartan wiki, Science section (Age 116 values). Race only changes scientist spawn rate in the wiki (Human); personality changes Crime and Channeling (Heretic, Rogue, Mystic).</p>
    </section>
  )
}