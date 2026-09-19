"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { simulateDraft, DRAFT_RATES } from "@/lib/spartan/draft-calculator"

const nav = [["Command","/"],["Kingdom","/command/kingdom"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["Wiki","/command/wiki"],["Tools","/command/tools"]]

const shell: any = { minHeight:"100vh", background:"#05080d", color:"#e7eef5", fontFamily:"Inter,system-ui,sans-serif", display:"flex" }
const sidebar: any = { width:245, flexShrink:0, minHeight:"100vh", background:"#071018", borderRight:"1px solid rgba(255,255,255,.08)", padding:24, position:"sticky", top:0, height:"100vh", overflowY:"auto" }
const card: any = { padding:16, border:"1px solid rgba(255,255,255,.08)", borderRadius:10, background:"#081119" }
const input: any = { background:"#05080d", border:"1px solid rgba(255,255,255,.08)", borderRadius:6, padding:"7px 9px", fontSize:11, color:"#dce7ee", width:110 }
const select: any = { ...input, width:160 }
const label: any = { fontSize:10, color:"#8993a1", display:"block", marginBottom:4 }
const field: any = { display:"flex", flexDirection:"column", gap:4 }

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

function DraftCalc() {
  const [races, setRaces] = useState<any[]>([])
  const [personalities, setPersonalities] = useState<any[]>([])
  const [race, setRace] = useState("Halfling")
  const [personality, setPersonality] = useState("The Heretic")

  const [peasants, setPeasants] = useState(23897)
  const [land, setLand] = useState(2999)
  const [homesCount, setHomesCount] = useState(295)
  const [guildsCount, setGuildsCount] = useState(384)
  const [heroismPct, setHeroismPct] = useState(7.8)
  const [patriotismActive, setPatriotismActive] = useState(true) // in-game calculator assumes Patriotism stays active
  const [ritualDraftPct, setRitualDraftPct] = useState(0)
  const [rateChoice, setRateChoice] = useState("Emergency")
  const [customRate, setCustomRate] = useState(2.0)
  const [days, setDays] = useState(30)
  const [includeBirths, setIncludeBirths] = useState(false)

  useEffect(() => {
    fetch("/api/rules").then((r) => r.json()).then((j) => { setRaces(j.races || []); setPersonalities(j.personalities || []) })
  }, [])

  const raceRule = races.find((r) => r.race === race)
  const personalityRule = personalities.find((p) => p.personality === personality)
  const draftRatePct = rateChoice === "Custom" ? customRate : DRAFT_RATES[rateChoice]

  const result = useMemo(() => simulateDraft({
    peasants, land, homesCount, guildsCount,
    heroismDraftSpeedPct: heroismPct,
    raceBonusText: raceRule?.bonuses, racePenaltyText: raceRule?.penalties,
    personalityBonusText: personalityRule?.bonuses,
    patriotismActive, ritualDraftPct, draftRatePct, days,
    includeBaseBirthRate: includeBirths,
  }), [peasants, land, homesCount, guildsCount, heroismPct, raceRule, personalityRule, patriotismActive, ritualDraftPct, draftRatePct, days, includeBirths])

  return (
    <main style={shell}>
      <Sidebar active="Draft Calc" />
      <section style={{ flex: 1, padding: "30px 34px", maxWidth: 1200 }}>
        <div style={{ fontSize:9, color:"#67f0b0", letterSpacing:".2em" }}>SPARTAN // DRAFT CALCULATOR</div>
        <h1 style={{ fontSize:34, margin:"7px 0 20px" }}>Draft Calculator</h1>

        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={{ marginTop:0, fontSize:14 }}>Inputs</h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14 }}>
            <label style={field}><span style={label}>Race</span>
              <select style={select} value={race} onChange={(e) => setRace(e.target.value)}>
                {races.map((r) => <option key={r.race} value={r.race}>{r.emoji} {r.race}</option>)}
              </select>
            </label>
            <label style={field}><span style={label}>Personality</span>
              <select style={select} value={personality} onChange={(e) => setPersonality(e.target.value)}>
                {personalities.map((p) => <option key={p.personality} value={p.personality}>{p.emoji} {p.personality}</option>)}
              </select>
            </label>
            <label style={field}><span style={label}>Draft Rate</span>
              <select style={select} value={rateChoice} onChange={(e) => setRateChoice(e.target.value)}>
                {Object.keys(DRAFT_RATES).map((k) => <option key={k} value={k}>{k} ({DRAFT_RATES[k]}%)</option>)}
                <option value="Custom">Custom</option>
              </select>
            </label>
            {rateChoice === "Custom" && (
              <label style={field}><span style={label}>Custom Rate %</span>
                <input style={input} type="number" step="0.1" value={customRate} onChange={(e) => setCustomRate(Number(e.target.value) || 0)} />
              </label>
            )}
            <label style={field}><span style={label}>Peasants</span>
              <input style={input} type="number" value={peasants} onChange={(e) => setPeasants(Number(e.target.value) || 0)} />
            </label>
            <label style={field}><span style={label}>Land (acres)</span>
              <input style={input} type="number" value={land} onChange={(e) => setLand(Number(e.target.value) || 0)} />
            </label>
            <label style={field}><span style={label}>Homes</span>
              <input style={input} type="number" value={homesCount} onChange={(e) => setHomesCount(Number(e.target.value) || 0)} />
            </label>
            <label style={field}><span style={label}>Guilds</span>
              <input style={input} type="number" value={guildsCount} onChange={(e) => setGuildsCount(Number(e.target.value) || 0)} />
            </label>
            <label style={field}><span style={label}>Heroism (Draft Speed %)</span>
              <input style={input} type="number" step="0.1" value={heroismPct} onChange={(e) => setHeroismPct(Number(e.target.value) || 0)} />
            </label>
            <label style={field}><span style={label}>Ritual Draft Bonus %</span>
              <input style={input} type="number" step="1" value={ritualDraftPct} onChange={(e) => setRitualDraftPct(Number(e.target.value) || 0)} title="0 for most rituals; Affluent = +20" />
            </label>
            <label style={field}><span style={label}>Project (days)</span>
              <input style={input} type="number" value={days} onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} />
            </label>
            <label style={{ ...field, justifyContent:"flex-end" }}>
              <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
                <input type="checkbox" checked={patriotismActive} onChange={(e) => setPatriotismActive(e.target.checked)} /> Patriotism active (+30%)
              </span>
            </label>
          </div>
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, marginTop:14, color:"#8993a1" }}>
            <input type="checkbox" checked={includeBirths} onChange={(e) => setIncludeBirths(e.target.checked)} />
            Include base birth rate (~2.05%/tick) — off by default; overpopulation status can suppress this in-game and isn&apos;t auto-detected here
          </label>
        </div>

        <div style={{ ...card, marginBottom: 20, display:"flex", gap:24, flexWrap:"wrap", fontSize:12 }}>
          <span>Combined draft multiplier: <b style={{ color:"#d8ff54" }}>{result.combinedDraftMultiplier.toFixed(3)}×</b></span>
          <span>Effective daily rate: <b style={{ color:"#d8ff54" }}>{result.effectiveDailyRatePct}%</b></span>
          <span>Mod Living Space: <b style={{ color:"#d8ff54" }}>{result.modLivingSpace.toLocaleString()}</b></span>
          {result.isOverpopulated != null && <span style={{ color:"#ff9b9b" }}>Overpopulated by ~{result.isOverpopulated.toLocaleString()} (peasants-only estimate)</span>}
        </div>

        <div style={card}>
          <h2 style={{ marginTop:0, fontSize:14 }}>Projection</h2>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ textAlign:"left", color:"#687686", textTransform:"uppercase", fontSize:9 }}>
                  <th style={{ padding:"4px 8px" }}>Day</th>
                  <th style={{ padding:"4px 8px" }}>Peasants</th>
                  <th style={{ padding:"4px 8px" }}>Drafted Today</th>
                  <th style={{ padding:"4px 8px" }}>Drafted (Cumulative)</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.day} style={{ borderTop:"1px solid rgba(255,255,255,.05)" }}>
                    <td style={{ padding:"4px 8px" }}>{r.day}</td>
                    <td style={{ padding:"4px 8px" }}>{r.peasants.toLocaleString()}</td>
                    <td style={{ padding:"4px 8px", color:"#d8ff54" }}>{r.draftedToday.toLocaleString()}</td>
                    <td style={{ padding:"4px 8px" }}>{r.draftedCumulative.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main style={{ ...shell, alignItems:"center", justifyContent:"center" }}>Loading Draft Calculator…</main>}>
      <DraftCalc />
    </Suspense>
  )
}
