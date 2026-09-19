#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash setup-draft-calc.sh
set -e
mkdir -p lib/spartan app/command/draft-calc

echo "→ lib/spartan/draft-calculator.ts"
cat > lib/spartan/draft-calculator.ts << 'EOF'
// lib/spartan/draft-calculator.ts
// Soldiers/tick = Peasants × Draft Rate × Race × Personality × Patriotism × Ritual × Heroism Science
// (formula per the Utopia wiki reference; Race/Personality multipliers are extracted
// live from their stored bonus/penalty text so this stays correct if either changes)

export const DRAFT_RATES: Record<string, number> = {
  None: 0,
  Reservist: 0.5,
  Normal: 1.0,
  Aggressive: 1.5,
  Emergency: 2.0,
}

/** Scans bonus/penalty text for "±N% Draft Speed" or "±N% Draft Rate" (never "Draft Cost" —
 *  that's a different formula) and returns a combined multiplier, e.g. "−25% Draft Speed" → 0.75 */
export function extractDraftMultiplier(...texts: (string | null | undefined)[]): number {
  let mult = 1
  const re = /([+\-\u2212]?\d+(?:\.\d+)?)%\s*Draft\s*(?:Speed|Rate)\b/gi
  for (const text of texts) {
    if (!text) continue
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text))) {
      const raw = m[1].replace(/\u2212/, '-')
      mult += Number(raw) / 100
    }
  }
  return mult
}

export interface DraftCalcInputs {
  peasants: number
  land: number
  homesCount: number
  guildsCount: number
  heroismDraftSpeedPct: number // e.g. 7.8 for +7.8%
  raceBonusText?: string | null
  racePenaltyText?: string | null
  personalityBonusText?: string | null
  patriotismActive: boolean
  ritualDraftPct: number // 0 unless a draft-affecting ritual (e.g. Affluent = +20) is active
  draftRatePct: number // e.g. 2.0 for Emergency, 0.5 for Reservist, or any custom value
  days: number
  includeBaseBirthRate: boolean // off by default — see overpopulation note in the UI
  raceLivingSpaceBonusPct?: number
  populationSciencePct?: number
}

export interface DraftCalcDay {
  day: number
  peasants: number
  army: number
  draftedCumulative: number
  draftedToday: number
}

export interface DraftCalcResult {
  rows: DraftCalcDay[]
  modLivingSpace: number
  isOverpopulated: number | null // excess population, or null if unknown (peasants-only estimate)
  combinedDraftMultiplier: number
  effectiveDailyRatePct: number
}

const TICKS_PER_DAY = 24
const BASE_BIRTH_RATE = 0.0205 // 2.05%, wiki-documented base

export function simulateDraft(inputs: DraftCalcInputs): DraftCalcResult {
  const raceMult = extractDraftMultiplier(inputs.raceBonusText, inputs.racePenaltyText)
  const persMult = extractDraftMultiplier(inputs.personalityBonusText)
  const heroismMult = 1 + inputs.heroismDraftSpeedPct / 100
  const patriotismMult = inputs.patriotismActive ? 1.3 : 1
  const ritualMult = 1 + inputs.ritualDraftPct / 100
  const combinedDraftMultiplier = raceMult * persMult * heroismMult * patriotismMult * ritualMult
  const dailyRate = (inputs.draftRatePct / 100) * combinedDraftMultiplier
  const perTickRate = dailyRate / TICKS_PER_DAY // the named rate (e.g. Emergency 2.0%) is a daily target

  const rawLivingSpace = inputs.land * 25 + inputs.homesCount * 10
  const modLivingSpace = rawLivingSpace * (1 + (inputs.raceLivingSpaceBonusPct || 0) / 100) * (1 + (inputs.populationSciencePct || 0) / 100)
  const isOverpopulated = inputs.peasants > modLivingSpace ? Math.round(inputs.peasants - modLivingSpace) : null

  const homesBonusPerTick = inputs.homesCount * 0.3
  const wizardsPerTick = inputs.guildsCount * 0.02

  let peasants = inputs.peasants
  let army = 0
  let draftedCumulative = 0
  const rows: DraftCalcDay[] = []

  for (let day = 1; day <= inputs.days; day++) {
    const draftedBefore = draftedCumulative
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const drafted = peasants * perTickRate
      draftedCumulative += drafted
      army += drafted
      peasants -= drafted
      peasants -= wizardsPerTick
      if (inputs.includeBaseBirthRate) peasants += peasants * BASE_BIRTH_RATE
      peasants += homesBonusPerTick
      if (peasants < 0) peasants = 0
    }
    rows.push({
      day,
      peasants: Math.round(peasants),
      army: Math.round(army),
      draftedCumulative: Math.round(draftedCumulative),
      draftedToday: Math.round(draftedCumulative - draftedBefore),
    })
  }

  return {
    rows,
    modLivingSpace: Math.round(modLivingSpace),
    isOverpopulated,
    combinedDraftMultiplier,
    effectiveDailyRatePct: Math.round(dailyRate * 10000) / 100,
  }
}
EOF

echo "→ app/command/draft-calc/page.tsx"
cat > app/command/draft-calc/page.tsx << 'EOF'
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
  const [patriotismActive, setPatriotismActive] = useState(false)
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
EOF

echo "→ adding Draft Calc to Build Lab's nav (other pages need the same one-line addition manually)"
cat > ./_patch-nav.js << 'EOF'
const fs = require('fs');
const path = 'app/command/build-lab/page.tsx';
let src = fs.readFileSync(path, 'utf8');
const oldNav = `["Build Lab","/command/build-lab"],["Military","/command/military"]`;
const newNav = `["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Military","/command/military"]`;
if (src.includes(oldNav)) {
  fs.writeFileSync(path, src.replace(oldNav, newNav));
  console.log('nav patched OK');
} else {
  console.log('nav line not found (build-lab/page.tsx may have changed) — skipped, not fatal');
}
EOF
node ./_patch-nav.js
rm ./_patch-nav.js

echo ""
echo "Done. Draft Calculator is at /command/draft-calc, pre-filled with your real Halfling/Heretic"
echo "numbers as of your last capture. Race, Personality, and Draft Rate are all selectable."
echo ""
echo "Honest caveat: the underlying formula's Race/Personality/Heroism multipliers come straight"
echo "from your wiki-seeded data, but I could not fully verify them against your real sample table"
echo "(from a week earlier, so Homes/Guilds/Heroism were likely different then). Treat the numbers"
echo "as formula-accurate but not independently verified against a live in-game match yet."
echo ""
echo "Next: git add -A && git commit -m 'Add Draft Calculator' "
echo "      git fetch && git merge origin/main && git push"
