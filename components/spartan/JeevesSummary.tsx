"use client"

import { useEffect, useMemo, useState } from "react"

type JeevesSummaryProps = { compact?: boolean }

function fmt(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString() : "—"
}

function ageLabel(v: string | null | undefined) {
  if (!v) return "unknown age"
  const ms = Date.now() - new Date(v).getTime()
  if (!Number.isFinite(ms)) return "unknown age"
  if (ms < 60_000) return "just now"
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`
}

export default function JeevesSummary({ compact = false }: JeevesSummaryProps) {
  const [history, setHistory] = useState<any>(null)
  const [kingdom, setKingdom] = useState<any>(null)
  const [enemy, setEnemy] = useState<any>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const [h, k, e] = await Promise.all([
          fetch("/api/history?limit=20", { cache: "no-store" }).then(async r => {
            const d = await r.json()
            if (!r.ok) throw new Error(d.error || "History unavailable")
            return d
          }),
          fetch("/api/kingdom-data", { cache: "no-store" }).then(async r => {
            const d = await r.json()
            return r.ok ? d : null
          }),
          fetch("/api/enemy-intel", { cache: "no-store" }).then(async r => {
            const d = await r.json()
            return r.ok ? d : null
          }),
        ])
        if (live) {
          setHistory(h)
          setKingdom(k)
          setEnemy(e)
          setError("")
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Jeeves could not assemble the summary")
      }
    }
    load()
    const timer = setInterval(load, 15000)
    return () => { live = false; clearInterval(timer) }
  }, [])

  const lines = useMemo(() => {
    const result: string[] = []
    const snapshots = history?.snapshots || []
    const latest = snapshots.at(-1)
    const previous = snapshots.at(-2)
    if (latest) {
      const changes: string[] = []
      for (const key of ["acres", "networth", "offense", "defense", "soldiers", "elites", "thieves", "wizards"]) {
        const a = Number(latest?.[key])
        const b = Number(previous?.[key])
        if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
          changes.push(`${key} ${a - b > 0 ? "+" : ""}${fmt(a - b)}`)
        }
      }
      result.push(changes.length ? `Your province changed since the previous observation: ${changes.slice(0, 4).join(", ")}.` : "No material change is visible in the latest province observations.")
    }
    const members = kingdom?.latest?.members || []
    if (members.length) {
      const landMoves = members.filter((p: any) => Number(p.deltaLand) !== 0).length
      const nwMoves = members.filter((p: any) => Number(p.deltaNw) !== 0).length
      result.push(`${members.length} kingdom mates are in the latest roster; ${landMoves} show land movement and ${nwMoves} show networth movement.`)
    }
    const enemyProvinces = enemy?.provinces || []
    if (enemyProvinces.length) {
      const freshest = enemyProvinces[0]
      result.push(`${enemyProvinces.length} enemy province intelligence profiles are currently known. Freshest enemy evidence is ${ageLabel(freshest?.latest)}.`)
    } else {
      result.push("No enemy province intelligence is currently available to summarize.")
    }
    const events = history?.events || []
    if (events.length) result.push(`${events.length} recent events are available in the command history.`)
    return result
  }, [history, kingdom, enemy])

  return (
    <section style={{
      marginTop: compact ? 12 : 18,
      padding: compact ? 15 : 20,
      border: "1px solid rgba(216,255,84,.2)",
      borderRadius: 12,
      background: "linear-gradient(135deg,rgba(216,255,84,.06),rgba(8,17,25,.96) 42%)",
      boxShadow: "0 14px 40px rgba(0,0,0,.22)"
    }}>
      <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:9,color:"#d8ff54",letterSpacing:".2em"}}>JEEVES // INTELLIGENCE SUMMARY</div>
          <h2 style={{margin:"6px 0 3px",fontSize:compact?18:22}}>Command Brief</h2>
          <div style={{fontSize:10,color:"#748391"}}>Synthesized from Spartan's existing captured evidence · refreshed every 15 seconds</div>
        </div>
        <div style={{fontSize:9,color:"#67f0b0",letterSpacing:".08em"}}>● LIVE</div>
      </div>
      {error ? (
        <div style={{marginTop:14,color:"#ffb4a8",fontSize:11}}>Jeeves summary unavailable: {error}</div>
      ) : (
        <div style={{display:"grid",gap:8,marginTop:14}}>
          {lines.map((line, i) => (
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 12px",borderRadius:8,background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.05)",fontSize:11,lineHeight:1.55,color:"#c6d1da"}}>
              <span style={{color:"#d8ff54",fontWeight:900}}>{String(i + 1).padStart(2,"0")}</span>
              <span>{line}</span>
            </div>
          ))}
          {!lines.length && <div style={{color:"#748391",fontSize:11}}>Jeeves is waiting for captured intelligence.</div>}
        </div>
      )}
    </section>
  )
}
