"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { simulateDraft, DRAFT_RATES, RITUAL_DRAFT_PCT } from "@/lib/spartan/draft-calculator"

const nav = [["Command","/"],["Kingdom","/command/kingdom"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["Wiki","/command/wiki"],["Tools","/command/tools"]]

const shell: any = { minHeight:"100vh", background:"#05080d", color:"#e7eef5", fontFamily:"Inter,system-ui,sans-serif", display:"flex" }
const sidebar: any = { width:245, flexShrink:0, minHeight:"100vh", background:"#071018", borderRight:"1px solid rgba(255,255,255,.08)", padding:24, position:"sticky", top:0, height:"100vh", overflowY:"auto" }
const card: any = { padding:18, border:"1px solid rgba(255,255,255,.08)", borderRadius:10, background:"#081119" }
const input: any = { background:"#05080d", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, padding:"9px 10px", fontSize:12, color:"#dce7ee", width:"100%", boxSizing:"border-box" }
const readOnlyInput: any = { ...input, color:"#7ee0ff", fontWeight:700, background:"#060a10" }
const select: any = { ...input }
const label: any = { fontSize:10, color:"#8993a1", display:"block", marginBottom:5, letterSpacing:".04em" }
const hint: any = { fontSize:9, color:"#5f6c7a", marginTop:4 }
const field: any = { display:"flex", flexDirection:"column", gap:4 }
const valueStyle: any = { color:"#d8ff54", fontWeight:800, fontSize:18 }
const muted: any = { color:"#7e8a99", fontSize:10 }
const sectionEyebrow: any = { color:"#67f0b0", fontSize:9, letterSpacing:".16em", marginBottom:4 }
const sectionTitle: any = { margin:"0 0 16px", fontSize:14 }
const checkRow: any = { display:"flex", alignItems:"flex-start", gap:8, padding:"10px 11px", border:"1px solid rgba(255,255,255,.08)", borderRadius:8, background:"rgba(255,255,255,.02)" }
const checkLabel: any = { fontSize:12, color:"#dce7ee", fontWeight:700, display:"flex", alignItems:"center", gap:6 }
const checkSub: any = { fontSize:9, color:"#7e8a99", marginTop:2 }
const iconBadge = (bg: string, color: string): any => ({ width:30, height:30, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:bg, color, fontSize:14, flexShrink:0 })

const DRAFT_RATE_ICON: Record<string, string> = { None:"⏸️", Reservist:"🕊️", Normal:"⚔️", Aggressive:"⚡", Emergency:"🔥" }

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

function Checkbox({ checked, onChange, title, pct, sub }: { checked: boolean; onChange: (v: boolean) => void; title: string; pct: string; sub: string }) {
  return (
    <label style={{ ...checkRow, cursor:"pointer" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop:2, accentColor:"#4f9dff" }} />
      <div>
        <div style={checkLabel}>{title} <span style={{ color:"#67f0b0" }}>{pct}</span></div>
        <div style={checkSub}>{sub}</div>
      </div>
    </label>
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
  const [raceBonusActive, setRaceBonusActive] = useState(true)
  const [personalityBonusActive, setPersonalityBonusActive] = useState(true)
  const [ritualActive, setRitualActive] = useState(false)
  const [includeBirths, setIncludeBirths] = useState(true)
  const [simulationMode, setSimulationMode] = useState("auto") // "auto" | "custom"
  const [maxTicks, setMaxTicks] = useState(200)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    fetch("/api/rules").then((r) => r.json()).then((j) => {
      setRaces(j.races || [])
      setPersonalities(j.personalities || [])
    }).catch(() => {})
  }, [])

  const raceRule = races.find((r) => r.race === race)
  const personalityRule = personalities.find((p) => p.personality === personality)
  const draftRatePct = rateChoice === "Custom" ? customRate : DRAFT_RATES[rateChoice] ?? 0
  const ritualDraftPct = ritualActive ? RITUAL_DRAFT_PCT : 0
  const effectiveMaxTicks = simulationMode === "custom" ? maxTicks : 500

  const raceMultText = raceRule?.bonuses
  const raceBonusPct = useMemo(() => {
    const m = /([+\-]?\d+(?:\.\d+)?)%\s*Draft\s*(?:Speed|Rate)/i.exec(raceRule?.bonuses || "")
    return m ? Number(m[1]) : 0
  }, [raceRule])
  const personalityBonusPct = useMemo(() => {
    const m = /([+\-]?\d+(?:\.\d+)?)%\s*Draft\s*(?:Speed|Rate)/i.exec(personalityRule?.bonuses || "")
    return m ? Number(m[1]) : 0
  }, [personalityRule])

  const result = useMemo(() => simulateDraft({
    totalPopulation,
    currentSoldiers,
    targetDraftPct,
    draftRatePct,
    heroismDraftSpeedPct: heroismPct,
    raceName: race,
    raceBonusText: raceRule?.bonuses,
    racePenaltyText: raceRule?.penalties,
    raceBonusActive,
    personalityName: personality,
    personalityBonusText: personalityRule?.bonuses,
    personalityPenaltyText: personalityRule?.penalties,
    personalityBonusActive,
    patriotismActive,
    patriotismDraftSpeedPct: 30,
    ritualDraftPct,
    includeBaseBirthRate: includeBirths,
    maxTicks: effectiveMaxTicks,
  }), [totalPopulation, currentSoldiers, targetDraftPct, draftRatePct, heroismPct, race, raceRule, raceBonusActive, personality, personalityRule, personalityBonusActive, patriotismActive, ritualDraftPct, includeBirths, effectiveMaxTicks])

  const currentPct = totalPopulation > 0 ? currentSoldiers / totalPopulation * 100 : 0
  const startingPeasants = Math.max(0, totalPopulation - currentSoldiers)

  // Row 0 represents "now" — before any drafting has happened.
  const tableRows = [
    { tick: 0, isNow: true, soldiersDrafted: null as number | null, soldiers: currentSoldiers, draftPct: currentPct, peasants: startingPeasants },
    ...result.rows.map(r => ({ tick: r.tick, isNow: false, soldiersDrafted: r.soldiersDrafted, soldiers: r.soldiers, draftPct: r.draftPct, peasants: r.peasants })),
  ]
  const displayRows = tableRows.length > 12
    ? [...tableRows.slice(0, 11), null, tableRows[tableRows.length - 1]]
    : tableRows

  const totalSoldiersAdded = Math.max(0, result.targetSoldiers - result.startingSoldiers)
  const finalPeasants = result.rows.length ? result.rows[result.rows.length - 1].peasants : startingPeasants

  return (
    <main style={shell}>
      <Sidebar active="Draft Calc" />
      <section style={{ flex:1, padding:"30px 34px", maxWidth:1300, minWidth:0 }}>
        <div style={{ fontSize:9, color:"#67f0b0", letterSpacing:".2em" }}>SPARTAN // DRAFT CALCULATOR</div>
        <h1 style={{ fontSize:34, margin:"7px 0 5px" }}>Draft Calculator</h1>
        <p style={{ ...muted, margin:"0 0 22px" }}>Plan your military growth. Calculate how many troops you&apos;ll draft per tick and how long it will take to reach your target draft percentage.</p>

        <div style={{ display:"grid", gridTemplateColumns:"minmax(330px, .95fr) minmax(480px, 1.35fr)", gap:18, alignItems:"start" }}>
          {/* LEFT COLUMN — inputs */}
          <div style={{ display:"grid", gap:18 }}>
            <div style={card}>
              <div style={sectionEyebrow}>1. PROVINCE DATA</div>
              <h2 style={sectionTitle}>Province Data</h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13 }}>
                <label style={field}>
                  <span style={label}>Total Population</span>
                  <input style={input} type="number" min="0" value={totalPopulation} onChange={e=>setTotalPopulation(Math.max(0, Number(e.target.value)||0))}/>
                  <span style={hint}>Your current total population</span>
                </label>
                <label style={field}>
                  <span style={label}>Current Soldiers</span>
                  <input style={input} type="number" min="0" value={currentSoldiers} onChange={e=>setCurrentSoldiers(Math.max(0, Number(e.target.value)||0))}/>
                  <span style={hint}>Current number of soldiers</span>
                </label>
                <label style={field}>
                  <span style={label}>Current Draft %</span>
                  <input style={readOnlyInput} readOnly value={`${currentPct.toFixed(2)}%`}/>
                  <span style={hint}>(Soldiers ÷ Population)</span>
                </label>
                <label style={field}>
                  <span style={label}>Target Draft %</span>
                  <input style={input} type="number" min="0" max="100" step="1" value={targetDraftPct} onChange={e=>setTargetDraftPct(Math.min(100, Math.max(0, Number(e.target.value)||0)))}/>
                  <span style={hint}>Stop drafting when this % is reached</span>
                </label>
              </div>
            </div>

            <div style={card}>
              <div style={sectionEyebrow}>2. DRAFT SETTINGS</div>
              <h2 style={sectionTitle}>Draft Settings</h2>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13, marginBottom:13 }}>
                <label style={field}><span style={label}>Race</span><select style={select} value={race} onChange={e=>setRace(e.target.value)}>{races.map(r=><option key={r.race} value={r.race}>{r.emoji} {r.race}</option>)}</select></label>
                <label style={field}><span style={label}>Personality</span><select style={select} value={personality} onChange={e=>setPersonality(e.target.value)}>{personalities.map(p=><option key={p.personality} value={p.personality}>{p.emoji} {p.personality}</option>)}</select></label>
              </div>

              <label style={field}>
                <span style={label}>Draft Rate</span>
                <select style={select} value={rateChoice} onChange={e=>setRateChoice(e.target.value)}>
                  {Object.keys(DRAFT_RATES).map(k=><option key={k} value={k}>{DRAFT_RATE_ICON[k] ?? ""} {k} ({DRAFT_RATES[k].toFixed(1)}% per tick)</option>)}
                  <option value="Custom">⚙️ Custom</option>
                </select>
                <span style={hint}>Base draft speed per tick (before modifiers)</span>
              </label>
              {rateChoice==="Custom" && (
                <label style={{ ...field, marginTop:13 }}><span style={label}>Custom Rate % / Tick</span><input style={input} type="number" step=".1" value={customRate} onChange={e=>setCustomRate(Number(e.target.value)||0)}/></label>
              )}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:15 }}>
                <Checkbox checked={patriotismActive} onChange={setPatriotismActive} title="Patriotism" pct="+30%" sub="Increases draft rate by 30%" />
                <Checkbox checked={raceBonusActive} onChange={setRaceBonusActive} title={race} pct={raceBonusPct ? `${raceBonusPct>0?"+":""}${raceBonusPct}%` : "—"} sub="Bonus from race" />
                <Checkbox checked={personalityBonusActive} onChange={setPersonalityBonusActive} title={personality} pct={personalityBonusPct ? `${personalityBonusPct>0?"+":""}${personalityBonusPct}%` : "—"} sub="Bonus from personality" />
              </div>

              <div style={{ marginTop:10 }}>
                <Checkbox checked={ritualActive} onChange={setRitualActive} title="Ritual Draft" pct={`+${RITUAL_DRAFT_PCT}%`} sub="Requires active ritual (optional)" />
              </div>

              <div style={{ marginTop:15 }}>
                <span style={label}>Heroism — Draft Speed Bonus</span>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <input type="range" min={0} max={20} step={0.1} value={heroismPct} onChange={e=>setHeroismPct(Number(e.target.value))} style={{ flex:1, accentColor:"#d8ff54" }}/>
                  <div style={{ ...input, width:80, flexShrink:0, textAlign:"right" }}>{heroismPct.toFixed(1)} %</div>
                </div>
                <span style={hint}>Heroism bonus (0–20%)</span>
              </div>
            </div>

            <div style={card}>
              <div style={sectionEyebrow}>3. SIMULATION SETTINGS</div>
              <h2 style={sectionTitle}>Simulation Settings</h2>
              <label style={field}>
                <span style={label}>Simulation Length</span>
                <select style={select} value={simulationMode} onChange={e=>setSimulationMode(e.target.value)}>
                  <option value="auto">⏱️ Until Target Reached</option>
                  <option value="custom">🔢 Fixed number of ticks</option>
                </select>
                <span style={hint}>{simulationMode==="auto" ? "Calculates ticks/hours to reach your target draft %" : "Simulate a fixed number of ticks / hours"}</span>
              </label>
              {simulationMode==="custom" && (
                <label style={{ ...field, marginTop:13 }}><span style={label}>Max Ticks / Hours</span><input style={input} type="number" min="1" max="2000" value={maxTicks} onChange={e=>setMaxTicks(Math.min(2000, Math.max(1, Number(e.target.value)||1)))}/></label>
              )}
              <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:13, fontSize:11, color:"#aeb9c5" }}>
                <input type="checkbox" checked={includeBirths} onChange={e=>setIncludeBirths(e.target.checked)} style={{ accentColor:"#4f9dff" }}/> Include base population growth <span style={muted}>2.05% / tick</span>
              </label>

              <button
                onClick={() => { setFlash(true); setTimeout(() => setFlash(false), 550) }}
                style={{ marginTop:18, width:"100%", padding:"13px 16px", borderRadius:9, border:0, background:"#2f7dff", color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
              >
                📊 Calculate Draft
              </button>
              <div style={{ marginTop:12, padding:"10px 12px", borderRadius:7, background:"rgba(255,255,255,.025)", color:"#7e8a99", fontSize:10 }}>1 tick = 1 real hour. Results update live as you change any setting.</div>
            </div>
          </div>

          {/* RIGHT COLUMN — results */}
          <div style={{ display:"grid", gap:18 }}>
            <div style={{ ...card, transition:"box-shadow .3s", boxShadow: flash ? "0 0 0 2px rgba(47,125,255,.55)" : "none" }}>
              <div style={sectionEyebrow}>CALCULATION SUMMARY</div>
              <h2 style={sectionTitle}>Calculation Summary</h2>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={iconBadge("rgba(47,125,255,.15)", "#4f9dff")}>🎯</div>
                  <div><div style={muted}>Target Draft %</div><div style={valueStyle}>{targetDraftPct.toFixed(2)}%</div><div style={hint}>(from {currentPct.toFixed(2)}%)</div></div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={iconBadge("rgba(245,166,35,.15)", "#f5a623")}>{DRAFT_RATE_ICON[rateChoice] ?? "🔥"}</div>
                  <div><div style={muted}>Draft Rate</div><div style={{ ...valueStyle, fontSize:15 }}>{rateChoice}</div><div style={hint}>{draftRatePct.toFixed(1)}% / tick</div></div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={iconBadge("rgba(103,240,176,.15)", "#67f0b0")}>🧩</div>
                  <div style={{ flex:1 }}>
                    <div style={muted}>Active Modifiers</div>
                    {result.modifiers.map(m => (
                      <div key={m.label} style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#aeb9c5", marginTop:2 }}>
                        <span>{m.label}</span><span style={{ color:"#67f0b0" }}>{m.pct>0?"+":""}{m.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, fontWeight:800, marginTop:5, paddingTop:5, borderTop:"1px solid rgba(255,255,255,.08)" }}>
                      <span style={{ color:"#dce7ee" }}>Total Modifier</span><span style={{ color:"#d8ff54" }}>{result.combinedModifierPct>=0?"+":""}{result.combinedModifierPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div style={{ ...card, display:"flex", gap:10, alignItems:"flex-start", padding:14 }}>
                  <div style={iconBadge("rgba(103,240,176,.15)", "#67f0b0")}>👥</div>
                  <div><div style={muted}>Soldiers per Tick (initial)</div><div style={valueStyle}>{result.initialSoldiersPerTick.toLocaleString()}</div><div style={hint}>(based on current peasants: {startingPeasants.toLocaleString()})</div></div>
                </div>
                <div style={{ ...card, display:"flex", gap:10, alignItems:"flex-start", padding:14 }}>
                  <div style={iconBadge("rgba(47,125,255,.15)", "#4f9dff")}>🕐</div>
                  <div><div style={muted}>Ticks to Target</div><div style={valueStyle}>{result.targetReached ? result.ticksToTarget : "—"}</div><div style={hint}>{result.targetReached ? `(≈ ${result.ticksToTarget} hours)` : `not reached in ${effectiveMaxTicks} ticks`}</div></div>
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"end", gap:12, marginBottom:12 }}>
                <div><div style={sectionEyebrow}>PROGRESSION TO TARGET</div><h2 style={{ margin:0, fontSize:14 }}>Progression to Target</h2></div>
                <div style={{ ...muted, textAlign:"right" }}>{result.targetReached ? `Drafting stops at ${targetDraftPct.toFixed(2)}% (target reached)` : "1 tick = 1 hour"}</div>
              </div>
              <div style={{ overflowX:"auto", maxHeight:480, overflowY:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead style={{ position:"sticky", top:0, background:"#081119" }}><tr style={{ textAlign:"left", color:"#687686", textTransform:"uppercase", fontSize:9 }}>
                    <th style={{ padding:"7px 8px" }}>Tick</th><th style={{ padding:"7px 8px" }}>Soldiers Drafted</th><th style={{ padding:"7px 8px" }}>Total Soldiers</th><th style={{ padding:"7px 8px" }}>Draft %</th><th style={{ padding:"7px 8px" }}>Peasants Remaining</th>
                  </tr></thead>
                  <tbody>
                    {displayRows.map((r, i) => r === null ? (
                      <tr key={`ellipsis-${i}`}><td colSpan={5} style={{ padding:"6px 8px", textAlign:"center", color:"#5f6c7a" }}>…</td></tr>
                    ) : (
                      <tr key={r.tick} style={{ borderTop:"1px solid rgba(255,255,255,.05)", background: (!r.isNow && r.tick===result.ticksToTarget) ? "rgba(47,125,255,.10)" : "transparent" }}>
                        <td style={{ padding:"7px 8px", color: (!r.isNow && r.tick===result.ticksToTarget) ? "#7ee0ff" : "#dce7ee" }}>{r.isNow ? "0 (Now)" : (r.tick===result.ticksToTarget ? `${r.tick} (Target)` : r.tick)}</td>
                        <td style={{ padding:"7px 8px", color:"#d8ff54" }}>{r.soldiersDrafted===null ? "—" : `+${r.soldiersDrafted.toLocaleString()}`}</td>
                        <td style={{ padding:"7px 8px", fontWeight:700 }}>{r.soldiers.toLocaleString()}</td>
                        <td style={{ padding:"7px 8px" }}>{r.draftPct.toFixed(2)}%</td>
                        <td style={{ padding:"7px 8px", color:"#aeb9c5" }}>{r.peasants.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ ...card, borderColor:result.targetReached ? "rgba(103,240,176,.35)" : "rgba(255,255,255,.08)", background:result.targetReached ? "rgba(103,240,176,.04)" : card.background }}>
              <div style={sectionEyebrow}>TARGET REACHED</div>
              {result.targetReached ? (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ color:"#67f0b0", fontSize:16 }}>✅</span>
                    <span style={{ fontWeight:800, fontSize:14, color:"#dce7ee" }}>Target Reached</span>
                  </div>
                  <div style={{ fontSize:12, color:"#aeb9c5" }}>You will reach {targetDraftPct.toFixed(2)}% draft in {result.ticksToTarget} ticks (≈ {result.ticksToTarget} hours).</div>
                  <div style={{ ...muted, marginTop:6 }}>Total soldiers added: {totalSoldiersAdded.toLocaleString()} · Peasants remaining: {finalPeasants.toLocaleString()}</div>
                </div>
              ) : (
                <div style={{ color:"#ffb56b", fontSize:12 }}>Target not reached within {effectiveMaxTicks} ticks. Increase the simulation length or adjust the draft settings.</div>
              )}
            </div>

            <div style={{ ...card, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div>
                <div style={{ ...sectionEyebrow, display:"flex", alignItems:"center", gap:6 }}>ℹ️ FORMULA (PER TICK)</div>
                <div style={{ fontSize:10, color:"#7e8a99", lineHeight:1.6 }}>Peasants × Draft Speed × Race × Personality × Patriotism × Ritual × (1 + Heroism)</div>
              </div>
              <div>
                <div style={{ ...sectionEyebrow, display:"flex", alignItems:"center", gap:6 }}>📖 BASE DRAFT SPEEDS</div>
                <div style={{ fontSize:10, color:"#7e8a99", lineHeight:1.6 }}>Reservist 0.5% · Normal 1.0% · Aggressive 1.5% · Emergency 2.0%</div>
              </div>
              <div>
                <div style={{ ...sectionEyebrow, display:"flex", alignItems:"center", gap:6 }}>📝 NOTES</div>
                <div style={{ fontSize:10, color:"#7e8a99", lineHeight:1.6 }}>
                  Drafting stops when target % is reached.<br/>
                  Target % recalculates if population changes.<br/>
                  Uses current peasants for each tick calculation.
                </div>
              </div>
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
