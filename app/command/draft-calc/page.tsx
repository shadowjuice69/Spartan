"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { simulateDraft, DRAFT_RATES } from "@/lib/spartan/draft-calculator"

const nav = [["Command","/"],["Kingdom","/command/kingdom"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["Wiki","/command/wiki"],["Tools","/command/tools"]]

const shell: any = { minHeight:"100vh", background:"#05080d", color:"#e7eef5", fontFamily:"Inter,system-ui,sans-serif", display:"flex" }
const sidebar: any = { width:245, flexShrink:0, minHeight:"100vh", background:"#071018", borderRight:"1px solid rgba(255,255,255,.08)", padding:24, position:"sticky", top:0, height:"100vh", overflowY:"auto" }
const card: any = { padding:18, border:"1px solid rgba(255,255,255,.08)", borderRadius:10, background:"#081119" }
const input: any = { background:"#05080d", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, padding:"9px 10px", fontSize:12, color:"#dce7ee", width:"100%", boxSizing:"border-box" }
const select: any = { ...input }
const label: any = { fontSize:10, color:"#8993a1", display:"block", marginBottom:5, letterSpacing:".04em" }
const field: any = { display:"flex", flexDirection:"column", gap:4 }
const valueStyle: any = { color:"#d8ff54", fontWeight:800, fontSize:18 }
const muted: any = { color:"#7e8a99", fontSize:10 }

function Sidebar({ active }: { active: string }) {
  const router = useRouter()
  return (
    <aside style={sidebar}>
      <div style={{ fontWeight:900, letterSpacing:".18em", color:"#d8ff54" }}>SPARTAN</div>
      <div style={{ fontSize:9, color:"#718091", letterSpacing:".16em", marginTop:5 }}>UTOPIA COMMAND</div>
      <div style={{ margin:"30px 0 10px", fontSize:9, color:"#5f6c7a", letterSpacing:".18em" }}>COMMAND SYSTEMS</div>
      {nav.map(([name, path]) => (
        <button key={name} onClick={() => router.push(path)} style={{ display:"block", width:"100%", textAlign:"left", padding:"11px 12px", marginBottom:4, border:0, borderRadius:8, background:name===active ? "rgba(216,255,84,.08)" : "transparent", color:name===active ? "#d8ff54" : "#aeb9c5", fontWeight:700, fontSize:11, cursor:"pointer" }}>
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

  const [totalPopulation, setTotalPopulation] = useState(100000)
  const [currentSoldiers, setCurrentSoldiers] = useState(20000)
  const [targetDraftPct, setTargetDraftPct] = useState(60)
  const [rateChoice, setRateChoice] = useState("Emergency")
  const [customRate, setCustomRate] = useState(2)
  const [heroismPct, setHeroismPct] = useState(7.8)
  const [patriotismActive, setPatriotismActive] = useState(true)
  const [ritualDraftPct, setRitualDraftPct] = useState(0)
  const [includeBirths, setIncludeBirths] = useState(true)
  const [maxTicks, setMaxTicks] = useState(48)

  useEffect(() => {
    fetch("/api/rules").then((r) => r.json()).then((j) => {
      setRaces(j.races || [])
      setPersonalities(j.personalities || [])
    }).catch(() => {})
  }, [])

  const raceRule = races.find((r) => r.race === race)
  const personalityRule = personalities.find((p) => p.personality === personality)
  const draftRatePct = rateChoice === "Custom" ? customRate : DRAFT_RATES[rateChoice] ?? 0

  const result = useMemo(() => simulateDraft({
    totalPopulation,
    currentSoldiers,
    targetDraftPct,
    draftRatePct,
    heroismDraftSpeedPct: heroismPct,
    raceBonusText: raceRule?.bonuses,
    racePenaltyText: raceRule?.penalties,
    personalityBonusText: personalityRule?.bonuses,
    personalityPenaltyText: personalityRule?.penalties,
    patriotismActive,
    patriotismDraftSpeedPct: 30,
    ritualDraftPct,
    includeBaseBirthRate: includeBirths,
    maxTicks,
  }), [totalPopulation, currentSoldiers, targetDraftPct, draftRatePct, heroismPct, raceRule, personalityRule, patriotismActive, ritualDraftPct, includeBirths, maxTicks])

  const currentPct = totalPopulation > 0 ? currentSoldiers / totalPopulation * 100 : 0

  return (
    <main style={shell}>
      <Sidebar active="Draft Calc" />
      <section style={{ flex:1, padding:"30px 34px", maxWidth:1250, minWidth:0 }}>
        <div style={{ fontSize:9, color:"#67f0b0", letterSpacing:".2em" }}>SPARTAN // DRAFT CALCULATOR</div>
        <h1 style={{ fontSize:34, margin:"7px 0 5px" }}>Draft Calculator</h1>
        <p style={{ ...muted, margin:"0 0 22px" }}>Project your province from its current military population to a target draft percentage.</p>

        <div style={{ display:"grid", gridTemplateColumns:"minmax(330px, .9fr) minmax(480px, 1.4fr)", gap:18, alignItems:"start" }}>
          <div style={{ display:"grid", gap:18 }}>
            <div style={card}>
              <div style={{ color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }}>PROVINCE DATA</div>
              <h2 style={{ margin:"0 0 16px", fontSize:14 }}>Starting Population</h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13 }}>
                <label style={field}><span style={label}>Total Population</span><input style={input} type="number" min="0" value={totalPopulation} onChange={e=>setTotalPopulation(Math.max(0, Number(e.target.value)||0))}/></label>
                <label style={field}><span style={label}>Current Soldiers</span><input style={input} type="number" min="0" value={currentSoldiers} onChange={e=>setCurrentSoldiers(Math.max(0, Number(e.target.value)||0))}/></label>
                <label style={field}><span style={label}>Target Draft %</span><input style={input} type="number" min="0" max="100" step="1" value={targetDraftPct} onChange={e=>setTargetDraftPct(Math.min(100, Math.max(0, Number(e.target.value)||0)))}/></label>
                <div style={{ padding:"10px 0" }}><div style={label}>Current Draft %</div><div style={valueStyle}>{currentPct.toFixed(1)}%</div></div>
              </div>
            </div>

            <div style={card}>
              <div style={{ color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }}>DRAFT SETTINGS</div>
              <h2 style={{ margin:"0 0 16px", fontSize:14 }}>Draft Configuration</h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13 }}>
                <label style={field}><span style={label}>Race</span><select style={select} value={race} onChange={e=>setRace(e.target.value)}>{races.map(r=><option key={r.race} value={r.race}>{r.emoji} {r.race}</option>)}</select></label>
                <label style={field}><span style={label}>Personality</span><select style={select} value={personality} onChange={e=>setPersonality(e.target.value)}>{personalities.map(p=><option key={p.personality} value={p.personality}>{p.emoji} {p.personality}</option>)}</select></label>
                <label style={field}><span style={label}>Draft Rate</span><select style={select} value={rateChoice} onChange={e=>setRateChoice(e.target.value)}>{Object.keys(DRAFT_RATES).map(k=><option key={k} value={k}>{k} — {DRAFT_RATES[k]}% / tick</option>)}<option value="Custom">Custom</option></select></label>
                {rateChoice==="Custom" && <label style={field}><span style={label}>Custom Rate % / Tick</span><input style={input} type="number" step=".1" value={customRate} onChange={e=>setCustomRate(Number(e.target.value)||0)}/></label>}
                <label style={field}><span style={label}>Heroism — Draft Speed %</span><input style={input} type="number" step=".1" value={heroismPct} onChange={e=>setHeroismPct(Number(e.target.value)||0)}/></label>
                <label style={field}><span style={label}>Ritual — Draft %</span><input style={input} type="number" step=".1" value={ritualDraftPct} onChange={e=>setRitualDraftPct(Number(e.target.value)||0)}/></label>
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:15, fontSize:11, color:"#aeb9c5" }}>
                <input type="checkbox" checked={patriotismActive} onChange={e=>setPatriotismActive(e.target.checked)}/> Patriotism active <span style={{ color:"#d8ff54" }}>+30% draft speed</span>
              </label>
            </div>

            <div style={card}>
              <div style={{ color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }}>SIMULATION SETTINGS</div>
              <h2 style={{ margin:"0 0 16px", fontSize:14 }}>Projection</h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13 }}>
                <label style={field}><span style={label}>Max Ticks / Hours</span><input style={input} type="number" min="1" max="240" value={maxTicks} onChange={e=>setMaxTicks(Math.min(240, Math.max(1, Number(e.target.value)||1)))}/></label>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"#aeb9c5", paddingTop:18 }}><input type="checkbox" checked={includeBirths} onChange={e=>setIncludeBirths(e.target.checked)}/> Include base births <span style={muted}>2.05% / tick</span></label>
              </div>
              <div style={{ marginTop:12, padding:"10px 12px", borderRadius:7, background:"rgba(255,255,255,.025)", color:"#7e8a99", fontSize:10 }}>1 tick = 1 real hour. The simulation stops when the target is reached.</div>
            </div>
          </div>

          <div style={{ display:"grid", gap:18 }}>
            <div style={card}>
              <div style={{ color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }}>CALCULATION SUMMARY</div>
              <h2 style={{ margin:"0 0 18px", fontSize:14 }}>Target Analysis</h2>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                <div><div style={label}>Current Soldiers</div><div style={valueStyle}>{result.startingSoldiers.toLocaleString()}</div></div>
                <div><div style={label}>Target Soldiers</div><div style={valueStyle}>{result.targetSoldiers.toLocaleString()}</div></div>
                <div><div style={label}>Remaining</div><div style={valueStyle}>{Math.max(0,result.targetSoldiers-result.startingSoldiers).toLocaleString()}</div></div>
                <div><div style={label}>Initial Soldiers / Tick</div><div style={valueStyle}>{result.initialSoldiersPerTick.toLocaleString()}</div></div>
                <div><div style={label}>Effective Draft Rate</div><div style={valueStyle}>{result.effectiveDraftRatePct.toFixed(2)}%</div></div>
                <div><div style={label}>Combined Modifiers</div><div style={valueStyle}>{result.combinedModifierPct >= 0 ? "+" : ""}{result.combinedModifierPct.toFixed(1)}%</div></div>
              </div>
            </div>

            <div style={card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"end", gap:12, marginBottom:12 }}>
                <div><div style={{ color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }}>PROGRESSION TO TARGET</div><h2 style={{ margin:0, fontSize:14 }}>Tick-by-Tick Projection</h2></div>
                <div style={{ ...muted, textAlign:"right" }}>1 tick = 1 hour</div>
              </div>
              <div style={{ overflowX:"auto", maxHeight:520, overflowY:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead style={{ position:"sticky", top:0, background:"#081119" }}><tr style={{ textAlign:"left", color:"#687686", textTransform:"uppercase", fontSize:9 }}>
                    <th style={{ padding:"7px 8px" }}>Tick</th><th style={{ padding:"7px 8px" }}>Peasants</th><th style={{ padding:"7px 8px" }}>Soldiers</th><th style={{ padding:"7px 8px" }}>Drafted</th><th style={{ padding:"7px 8px" }}>Draft %</th><th style={{ padding:"7px 8px" }}>Remaining</th>
                  </tr></thead>
                  <tbody>{result.rows.map(r=><tr key={r.tick} style={{ borderTop:"1px solid rgba(255,255,255,.05)", background:r.remainingToTarget===0 ? "rgba(216,255,84,.06)" : "transparent" }}>
                    <td style={{ padding:"7px 8px" }}>{r.tick}</td><td style={{ padding:"7px 8px" }}>{r.peasants.toLocaleString()}</td><td style={{ padding:"7px 8px", fontWeight:700 }}>{r.soldiers.toLocaleString()}</td><td style={{ padding:"7px 8px", color:"#d8ff54" }}>+{r.soldiersDrafted.toLocaleString()}</td><td style={{ padding:"7px 8px" }}>{r.draftPct.toFixed(1)}%</td><td style={{ padding:"7px 8px", color:r.remainingToTarget===0 ? "#d8ff54" : "#aeb9c5" }}>{r.remainingToTarget.toLocaleString()}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>

            <div style={{ ...card, borderColor:result.targetReached ? "rgba(216,255,84,.35)" : "rgba(255,255,255,.08)" }}>
              <div style={{ color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }}>TARGET REACHED</div>
              {result.targetReached ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:15, flexWrap:"wrap" }}>
                  <div><div style={{ fontSize:24, fontWeight:900, color:"#d8ff54" }}>{result.ticksToTarget} ticks</div><div style={muted}>approximately {result.hoursToTarget} hours to reach {targetDraftPct}% draft</div></div>
                  <div style={{ textAlign:"right" }}><div style={valueStyle}>{result.targetSoldiers.toLocaleString()}</div><div style={muted}>target soldiers</div></div>
                </div>
              ) : (
                <div style={{ color:"#ffb56b", fontSize:12 }}>Target not reached within {maxTicks} ticks. Increase the projection window or adjust the draft settings.</div>
              )}
            </div>

            <div style={{ ...card, fontSize:10, color:"#7e8a99", lineHeight:1.6 }}>
              <b style={{ color:"#aeb9c5" }}>Formula:</b> soldiers drafted per tick = current peasants × effective draft rate. Effective draft rate combines the selected draft rate with race, personality, Patriotism, Heroism and ritual draft modifiers. Base births are applied after drafting when enabled.
              <div style={{ marginTop:6 }}>Base draft speeds: Reservist 0.5% · Normal 1.0% · Aggressive 1.5% · Emergency 2.0% per tick.</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function Page() {
  return <Suspense fallback={<main style={{ ...shell, alignItems:"center", justifyContent:"center" }}>Loading Draft Calculator…</main>}><DraftCalc /></Suspense>
}
