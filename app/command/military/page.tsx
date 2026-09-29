"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type RecordRow = {
  id?: string
  capture_id?: string
  page_kind?: string
  source?: string
  province_id?: string
  kingdom_id?: string
  captured_at?: string
  created_at?: string
  payload?: any
  raw_payload?: any
}

type Battle = {
  id: string
  time: string
  attacker: string
  attackerKd: string
  target: string
  targetKd: string
  acres: number
  kills: number
  prisoners: number
  losses: number
  lossUnits: string
  offense: number | null
  defense: number | null
  returnDays: number | null
  loot: string
  type: string
  raw: string
  source: string
}

const navCommand = [
  ["Command", "/"],
  ["Province", "/command/province"],
  ["War Room", "/command/war-room"],
  ["Build Lab", "/command/build-lab"],
  ["Draft Calc", "/command/draft-calc"],
  ["Wiki", "/command/wiki"],
  ["Tools", "/command/tools"],
  ["Scraper Generator","/command/scraper"],
]

const navIntel = [
  ["Intel", "/command/intel"],
  ["Kingdom", "/command/kingdom"],
  ["Military", "/command/military"],
  ["Magic", "/command/magic"],
  ["Thievery", "/command/thievery"],
  ["Science", "/command/science"],
  ["Buildings", "/command/buildings"],
  ["Throne", "/command/throne"],
  ["News", "/command/news"],
  ["Enemy Intel", "/command/enemy-intel"],
]

function num(v: string | number | null | undefined) {
  if (v == null) return 0
  const n = Number(String(v).replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

function fmt(n: number) {
  return Math.round(n).toLocaleString()
}

function parseBattle(row: RecordRow): Battle | null {
  const raw = String(row.payload?.data?.content || row.payload?.raw_text || "")
  const text = raw.replace(/\u2014/g, "—").replace(/\s+/g, " ").trim()
  if (!text) return null

  const simple = text.match(/^\s*(?:⚔\s*)?(?:#?\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\)\s+(invaded|attacked|ambushed armies from|conquered)\s+(?:#?\d+\s*-\s*)?(.+?)\s*\((\d+:\d+)\).*?(?:captured|took|gained)\s+([\d,]+)\s+acres?/i)
  const battleHead = text.match(/(?:⚔\s*)?(.+?)\s*\((\d+:\d+)\)\s*[—-]\s*(?:#?\d+\s*-\s*)?([^:]+):/i)
  const target = text.match(/(?:arrive at|arrives at)\s+(.+?)\s*\((\d+:\d+)\)/i)

  let attacker = simple?.[1]?.trim() || battleHead?.[1]?.trim() || null
  let attackerKd = simple?.[2] || battleHead?.[2] || row.kingdom_id || "?"
  let targetName = simple?.[4]?.trim() || target?.[1]?.trim() || null
  let targetKd = simple?.[5] || target?.[2] || "?"
  if (!attacker || !targetName) return null

  const acres = num(simple?.[6]) || num(text.match(/(?:captured|took|gained|taken)\s+([\d,]+)\s+acres?/i)?.[1])
  const kills = num(text.match(/killed\s+(?:about\s+)?([\d,]+)\s+enemy troops/i)?.[1])
  const prisoners = num(text.match(/imprisoned\s+([\d,]+)\s+additional troops/i)?.[1])
  const offense = text.match(/(?:—|\b)\s*([\d,]+)\s+off\b/i)?.[1]
  const defense = text.match(/vs\s+([\d,]+)\s+def\b/i)?.[1]
  const returnDaysRaw = text.match(/available again in\s+([\d.]+)\s+days/i)?.[1]
  const returnDays = returnDaysRaw ? Number(returnDaysRaw) : null

  const lossParts = [...text.matchAll(/lost\s+([\d,]+)\s+([A-Za-z][A-Za-z ]+?)(?=,|\s+and\s+|\s+in this battle)/gi)]
  const lossValues = lossParts.map(m => num(m[1]))
  const losses = lossValues.reduce((a, b) => a + b, 0)
  const lossUnits = lossParts.map(m => `${fmt(num(m[1]))} ${m[2].trim()}`).join(", ")

  const lootParts = [
    text.match(/looted\s+([\d,]+)\s+gold/i)?.[1] ? `${fmt(num(text.match(/looted\s+([\d,]+)\s+gold/i)?.[1]))} gold` : "",
    text.match(/looted\s+([\d,]+)\s+books?/i)?.[1] ? `${fmt(num(text.match(/looted\s+([\d,]+)\s+books?/i)?.[1]))} books` : "",
    text.match(/([\d,]+)\s+bushels/i)?.[1] ? `${fmt(num(text.match(/([\d,]+)\s+bushels/i)?.[1]))} bushels` : "",
    text.match(/([\d,]+)\s+runes/i)?.[1] ? `${fmt(num(text.match(/([\d,]+)\s+runes/i)?.[1]))} runes` : "",
  ].filter(Boolean).join(" · ")

  const type = /ambush/i.test(text) ? "AMBUSH" : /massacre/i.test(text) ? "MASSACRE" : /plunder|loot/i.test(text) ? "PLUNDER" : /learn/i.test(text) ? "LEARN" : "INVASION"

  return {
    id: String(row.id || row.capture_id || text),
    time: row.captured_at || row.created_at || new Date().toISOString(),
    attacker,
    attackerKd,
    target: targetName,
    targetKd,
    acres,
    kills,
    prisoners,
    losses,
    lossUnits,
    offense: offense ? num(offense) : null,
    defense: defense ? num(defense) : null,
    returnDays: Number.isFinite(returnDays) ? returnDays : null,
    loot: lootParts || "—",
    type,
    raw: text,
    source: row.source || "unknown",
  }
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <article style={{ padding: 16, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, background: "#081119" }}>
    <div style={{ fontSize: 8, color: "#687686", letterSpacing: ".12em" }}>{label}</div>
    <strong style={{ display: "block", fontSize: 25, marginTop: 7, color: "#d8ff54" }}>{value}</strong>
    {detail && <div style={{ fontSize: 9, color: "#748190", marginTop: 5 }}>{detail}</div>}
  </article>
}

function Bar({ value, max, label, negative = false }: { value: number; max: number; label: string; negative?: boolean }) {
  const width = max > 0 ? Math.max(2, Math.round((Math.abs(value) / max) * 100)) : 2
  return <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 85px", gap: 8, alignItems: "center", marginBottom: 9 }}>
    <div style={{ fontSize: 9, color: "#9aa7b4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${width}%`, height: "100%", background: negative ? "#ff8b8b" : "#67f0b0", borderRadius: 99 }} />
    </div>
    <div style={{ fontSize: 9, textAlign: "right", color: negative ? "#ff9b9b" : "#d8ff54" }}>{negative ? "-" : ""}{fmt(Math.abs(value))}</div>
  </div>
}

export default function MilitaryPage() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const r = await fetch("/api/intel-data?section=military", { cache: "no-store" })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || "Military intelligence unavailable")
        if (live) { setData(j); setError("") }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Military intelligence unavailable")
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 15000)
    return () => { live = false; clearInterval(timer) }
  }, [])

  const records: RecordRow[] = data?.records || []
  const battles = useMemo(() => records.map(parseBattle).filter(Boolean).sort((a: any, b: any) => Date.parse(b.time) - Date.parse(a.time)) as Battle[], [records])
  const recent = battles.slice(0, 16)

  const militaryState = useMemo(() => {
    const rows = records.filter(r => ['military','som','throne','council_military'].includes(String(r.page_kind)))
    const latest = rows[0]?.payload || {}
    const data = latest?.data || latest
    const field = (name: string) => num(data?.[name] ?? data?.fields?.[name] ?? latest?.[name])
    return {
      acres: field('acres'), offense: field('offense'), defense: field('defense'),
      soldiers: field('soldiers'), thieves: field('thieves'), wizards: field('wizards'),
      warHorses: field('war_horses'), prisoners: field('prisoners'), networth: field('networth'),
      capturedAt: rows[0]?.captured_at || rows[0]?.created_at || null
    }
  }, [records])

  const totals = useMemo(() => ({
    acres: battles.reduce((s, b) => s + b.acres, 0),
    kills: battles.reduce((s, b) => s + b.kills, 0),
    prisoners: battles.reduce((s, b) => s + b.prisoners, 0),
    losses: battles.reduce((s, b) => s + b.losses, 0),
  }), [battles])

  const attackTypes = useMemo(() => {
    const out: Record<string, number> = {}
    for (const b of battles) out[b.type] = (out[b.type] || 0) + 1
    return Object.entries(out).sort((a,b) => b[1]-a[1])
  }, [battles])

  const maxAcres = Math.max(1, ...recent.map(b => b.acres))
  const maxKillsLosses = Math.max(1, ...recent.map(b => Math.max(b.kills, b.losses)))
  const latestBattle = battles[0] || null
  const readiness = latestBattle?.returnDays == null ? null : latestBattle.returnDays <= 0 ? 'READY' : `${latestBattle.returnDays} DAYS`

  return <main style={{ minHeight: "100vh", background: "#05080d", color: "#e7eef5", fontFamily: "Inter,system-ui,sans-serif", display: "flex" }}>
    <aside style={{ width: 250, borderRight: "1px solid rgba(255,255,255,.08)", padding: 24, background: "#071018", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
      <div style={{ fontWeight: 900, letterSpacing: ".18em", color: "#d8ff54", fontSize: 15 }}>SPARTAN</div>
      <div style={{ fontSize: 10, color: "#718091", letterSpacing: ".16em", marginTop: 5 }}>UTOPIA INTELLIGENCE</div>
      <div style={{ margin: "30px 0 10px", fontSize: 9, color: "#5f6c7a", letterSpacing: ".18em" }}>COMMAND SYSTEMS</div>
      {navCommand.map(([n, p]) => <button key={n} onClick={() => router.push(p)} style={{ width: "100%", textAlign: "left", padding: "11px 12px", marginBottom: 4, border: 0, borderRadius: 8, background: "transparent", color: "#aeb9c5", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>{n}</button>)}
      <div style={{ margin: "22px 0 10px", fontSize: 9, color: "#5f6c7a", letterSpacing: ".18em" }}>INTEL DATA</div>
      {navIntel.map(([n, p]) => <button key={n} onClick={() => router.push(p)} style={{ width: "100%", textAlign: "left", padding: "11px 12px", marginBottom: 4, border: p === "/command/military" ? "1px solid rgba(216,255,84,.2)" : "1px solid transparent", borderRadius: 8, background: p === "/command/military" ? "rgba(216,255,84,.08)" : "transparent", color: p === "/command/military" ? "#d8ff54" : "#aeb9c5", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>{n}</button>)}
      <div style={{ marginTop: 28, padding: 12, border: "1px solid rgba(103,240,176,.18)", borderRadius: 10, fontSize: 9, color: "#67f0b0" }}>● INTEL CORE ONLINE<br /><span style={{ color: "#718091" }}>Live classified evidence · 15s refresh</span></div>
    </aside>

    <section style={{ flex: 1, padding: "28px 34px 50px", maxWidth: 1550, overflowX: "hidden" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".2em" }}>SPARTAN // MILITARY INTELLIGENCE</div>
          <h1 style={{ fontSize: 36, margin: "7px 0 4px" }}>MILITARY INTELLIGENCE</h1>
          <div style={{ fontSize: 12, color: "#778493" }}>Attacks, land movement, troop exchange and battle evidence from the live Intel core.</div>
        </div>
        <button onClick={() => router.push("/")} style={{ padding: "11px 16px", borderRadius: 9, border: "1px solid #d8ff54", background: "#101c23", color: "#d8ff54", fontWeight: 900, fontSize: 10, cursor: "pointer" }}>← COMMAND CENTER</button>
      </header>

      {loading && !data && !error && <div style={{ padding: 18, color: "#67f0b0" }}>LOADING MILITARY INTELLIGENCE…</div>}
      {error && <div style={{ padding: 14, color: "#ff9b9b" }}>{error}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 18 }}>
        <Stat label="BATTLE RECORDS" value={fmt(battles.length)} detail={`${fmt(records.length)} classified military-source records`} />
        <Stat label="ACRES CAPTURED" value={fmt(totals.acres)} detail="From parsed attack evidence" />
        <Stat label="ENEMY TROOPS KILLED" value={fmt(totals.kills)} detail="Reported battlefield kills" />
        <Stat label="OUR TROOP LOSSES" value={fmt(totals.losses)} detail="Parsed losses across reports" />
        <Stat label="PRISONERS" value={fmt(totals.prisoners)} detail="Additional troops imprisoned" />
        <Stat label="LATEST READINESS" value={readiness || "—"} detail={latestBattle ? "Based on latest captured battle return" : "No battle return captured"} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginBottom: 18 }}>
        {[
          ["LAND", militaryState.acres, "acres"],
          ["OFFENSE", militaryState.offense, "points"],
          ["DEFENSE", militaryState.defense, "points"],
          ["SOLDIERS", militaryState.soldiers, "units"],
          ["WAR HORSES", militaryState.warHorses, "units"],
          ["PRISONERS", militaryState.prisoners, "units"],
        ].map(([label,value,unit]) => <Stat key={label as string} label={label as string} value={value ? fmt(value as number) : "—"} detail={unit as string} />)}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginBottom: 18 }}>
        <article style={{ padding: 18, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "#081119" }}>
          <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".16em" }}>FORCE COMPOSITION</div>
          <h2 style={{ margin: "7px 0 15px", fontSize: 20 }}>Current military state</h2>
          {[
            ["Soldiers", militaryState.soldiers],
            ["War Horses", militaryState.warHorses],
            ["Prisoners", militaryState.prisoners],
            ["Thieves", militaryState.thieves],
            ["Wizards", militaryState.wizards],
          ].map(([label,value]) => <Bar key={label as string} value={value as number} max={Math.max(1, militaryState.soldiers, militaryState.warHorses, militaryState.prisoners, militaryState.thieves, militaryState.wizards)} label={label as string} />)}
          <div style={{ marginTop: 10, fontSize: 9, color: "#667585" }}>Latest military-state capture: {militaryState.capturedAt ? new Date(militaryState.capturedAt).toLocaleString() : "—"}</div>
        </article>
        <article style={{ padding: 18, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "#081119" }}>
          <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".16em" }}>ATTACK PROFILE</div>
          <h2 style={{ margin: "7px 0 15px", fontSize: 20 }}>Battle mix</h2>
          {attackTypes.length ? attackTypes.map(([type,count]) => <Bar key={type} value={count} max={attackTypes[0][1]} label={type} />) : <div style={{ color: "#748190", padding: "30px 0" }}>No classified attack mix yet.</div>}
          {latestBattle && <div style={{ marginTop: 12, padding: 11, borderRadius: 8, background: "rgba(216,255,84,.05)", color: "#aeb9c5", fontSize: 10 }}>Latest: <strong style={{ color: "#d8ff54" }}>{latestBattle.type}</strong> · {latestBattle.attacker} → {latestBattle.target}</div>}
        </article>
        <article style={{ padding: 18, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "#081119" }}>
          <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".16em" }}>FORCE POWER</div>
          <h2 style={{ margin: "7px 0 15px", fontSize: 20 }}>Current points</h2>
          <Bar value={militaryState.offense} max={Math.max(1,militaryState.offense,militaryState.defense)} label="Offense" />
          <Bar value={militaryState.defense} max={Math.max(1,militaryState.offense,militaryState.defense)} label="Defense" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10 }}>
            <Stat label="NETWORTH" value={militaryState.networth ? fmt(militaryState.networth) : "—"} />
            <Stat label="O/D RATIO" value={militaryState.defense ? (militaryState.offense/militaryState.defense).toFixed(2) : "—"} />
          </div>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 18 }}>
        <article style={{ padding: 18, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "#081119" }}>
          <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".16em" }}>LAND MOVEMENT</div>
          <h2 style={{ margin: "7px 0 15px", fontSize: 20 }}>Recent acreage gains</h2>
          {recent.length ? recent.map((b, i) => <Bar key={b.id} value={b.acres} max={maxAcres} label={b.target} />) : <div style={{ color: "#748190", padding: "30px 0" }}>No parsed attack results yet.</div>}
        </article>

        <article style={{ padding: 18, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "#081119" }}>
          <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".16em" }}>COMBAT EXCHANGE</div>
          <h2 style={{ margin: "7px 0 15px", fontSize: 20 }}>Kills vs. losses</h2>
          {recent.length ? recent.map(b => <div key={b.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 9, color: "#9aa7b4", marginBottom: 5 }}><span>{b.target}</span><span>{fmt(b.kills)} K / {fmt(b.losses)} L</span></div>
            <Bar value={b.kills} max={maxKillsLosses} label="Killed" />
            <Bar value={b.losses} max={maxKillsLosses} label="Lost" negative />
          </div>) : <div style={{ color: "#748190", padding: "30px 0" }}>No parsed battle exchange yet.</div>}
        </article>
      </section>

      <section style={{ padding: 20, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "#081119" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 15, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: "#67f0b0", letterSpacing: ".16em" }}>BATTLE INTELLIGENCE</div>
            <h2 style={{ margin: "7px 0 5px", fontSize: 22 }}>Recent military actions</h2>
            <div style={{ fontSize: 11, color: "#748190" }}>Every item opens into the complete captured evidence used to build the summary.</div>
          </div>
          <div style={{ fontSize: 9, color: "#67f0b0" }}>AUTO-REFRESH 15s</div>
        </div>

        {recent.length ? recent.map(b => <details key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <summary style={{ listStyle: "none", cursor: "pointer", padding: "16px 0", display: "flex", justifyContent: "space-between", gap: 15, alignItems: "center" }}>
            <span>
              <strong style={{ color: "#d8ff54", fontSize: 13 }}>{b.type} · {b.acres ? `${fmt(b.acres)} AC` : "NO LAND"}</strong>
              <span style={{ display: "block", fontSize: 10, color: "#748190", marginTop: 4 }}>{b.attacker} ({b.attackerKd}) → {b.target} ({b.targetKd}) · {new Date(b.time).toLocaleString()}</span>
            </span>
            <span style={{ fontSize: 10, color: "#67f0b0" }}>OPEN DETAILS</span>
          </summary>
          <div style={{ padding: "0 0 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
              {[
                ["ACRES", fmt(b.acres)],
                ["KILLED", fmt(b.kills)],
                ["LOSSES", fmt(b.losses)],
                ["PRISONERS", fmt(b.prisoners)],
                ["OFFENSE", b.offense == null ? "—" : fmt(b.offense)],
                ["DEFENSE", b.defense == null ? "—" : fmt(b.defense)],
                ["RETURN", b.returnDays == null ? "—" : `${b.returnDays} days`],
                ["LOOT", b.loot],
              ].map(([label, value]) => <div key={label} style={{ padding: 10, background: "rgba(255,255,255,.025)", borderRadius: 7 }}>
                <div style={{ fontSize: 8, color: "#657483" }}>{label}</div>
                <div style={{ fontSize: 11, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
              </div>)}
            </div>
            {b.lossUnits && <div style={{ marginTop: 9, padding: 12, border: "1px solid rgba(255,255,255,.05)", borderRadius: 8, fontSize: 10, color: "#ffb0b0" }}>UNIT LOSSES · {b.lossUnits}</div>}
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "#67f0b0", fontSize: 10 }}>SHOW CAPTURED EVIDENCE</summary>
              <div style={{ marginTop: 9, padding: 12, background: "#05080d", borderRadius: 8, fontSize: 10, lineHeight: 1.5, color: "#9eabb8", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{b.raw}</div>
            </details>
          </div>
        </details>) : <div style={{ padding: "45px 0", color: "#748190", textAlign: "center" }}>The Military page is connected to the live Intel core. It will populate as military captures arrive.</div>}
      </section>
    </section>
  </main>
}
