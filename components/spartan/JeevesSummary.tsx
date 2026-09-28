"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { getCommandIntel } from "@/lib/spartan/client-intel-cache"

type JeevesSummaryProps = { compact?: boolean }

function fmt(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString() : "—"
}
function ageLabel(v: string | null | undefined) {
  if (!v) return "unknown"
  const ms = Date.now() - new Date(v).getTime()
  if (!Number.isFinite(ms)) return "unknown"
  if (ms < 60_000) return "just now"
  const m = Math.floor(ms / 60_000)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`
}
function delta(a: unknown,b: unknown) {
  const x=Number(a), y=Number(b)
  return Number.isFinite(x)&&Number.isFinite(y) ? `${x-y>=0?"+":""}${fmt(x-y)}` : "—"
}

export default function JeevesSummary({ compact = false }: JeevesSummaryProps) {
  const [history,setHistory]=useState<any>(null)
  const [kingdom,setKingdom]=useState<any>(null)
  const [enemy,setEnemy]=useState<any>(null)
  const [error,setError]=useState("")

  useEffect(()=>{
    let live=true
    const load=async()=>{
      try{
        const [intel]=await Promise.all([
          getCommandIntel(),
        ])
        if(live){const [h,k,e]=intel;setHistory(h);setKingdom(k);setEnemy(e);setError("")}
      }catch(e){if(live)setError(e instanceof Error?e.message:"Jeeves could not assemble the summary")}
    }
    load();const timer=setInterval(load,20000);return()=>{live=false;clearInterval(timer)}
  },[])

  const latest=history?.snapshots?.at(-1)
  const previous=history?.snapshots?.at(-2)
  const members=kingdom?.latest?.members||[]
  const enemies=enemy?.provinces||[]
  const events=history?.events||[]
  const changed=useMemo(()=>["acres","networth","offense","defense","soldiers","elites","thieves","wizards"].filter(k=>{
    const a=Number(latest?.[k]),b=Number(previous?.[k]);return Number.isFinite(a)&&Number.isFinite(b)&&a!==b
  }),[latest,previous])

  const signals=useMemo(()=>{
    const items:{label:string;value:string;detail:string;href:string}[]=[]
    if(latest) items.push({label:"PROVINCE STATE",value:latest.province_name||history?.identity?.provinceName||"ONLINE",detail:latest.observed_at?"Observed "+ageLabel(latest.observed_at):"Waiting for observation",href:"/command/province"})
    if(members.length) items.push({label:"ROSTER",value:fmt(members.length),detail:"Known kingdom provinces",href:"/command/kingdom"})
    if(enemies.length) items.push({label:"TARGETS",value:fmt(enemies.length),detail:"Classified enemy provinces",href:"/command/enemy-intel"})
    if(events.length) items.push({label:"ACTIVITY",value:fmt(events.length),detail:"Recent command events",href:"/command/war-room"})
    return items
  },[latest,history,members,enemies,events])

  const brief=useMemo(()=>{
    const out:string[]=[]
    if(latest){
      if(changed.length) out.push(`Province movement detected: ${changed.slice(0,5).map(k=>`${k.replaceAll("_"," ")} ${delta(latest[k],previous?.[k])}`).join(" · ")}.`)
      else out.push("No movement detected between the two newest province observations.")
    }
    if(members.length){
      const land=members.filter((p:any)=>Number(p.deltaLand)!==0).length
      const nw=members.filter((p:any)=>Number(p.deltaNw)!==0).length
      out.push(`Kingdom roster: ${members.length} provinces visible. ${land} changed land and ${nw} changed networth on the latest comparison.`)
    }
    if(enemies.length) out.push(`Enemy picture: ${enemies.length} target provinces are known. Newest evidence is ${ageLabel(enemies[0]?.latest)}.`)
    else out.push("Enemy picture: no classified enemy province profiles are available yet.")
    if(events.length) out.push(`Activity: ${events.length} recent events are available in your command history.`)
    return out
  },[latest,previous,changed,members,enemies,events])

  return <section style={{
    marginTop:compact?12:18,padding:compact?15:20,border:"1px solid rgba(216,255,84,.25)",borderRadius:14,
    background:"linear-gradient(135deg,rgba(216,255,84,.075),rgba(8,17,25,.98) 48%)",boxShadow:"0 16px 50px rgba(0,0,0,.28)"
  }}>
    <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:9,color:"#d8ff54",letterSpacing:".2em"}}>JEEVES // COMMAND INTELLIGENCE</div>
        <h2 style={{margin:"6px 0 3px",fontSize:compact?18:23}}>What Spartan knows right now</h2>
        <div style={{fontSize:10,color:"#748391"}}>Plain-language brief from existing captured data · refreshes every 15 seconds</div>
      </div>
      <div style={{fontSize:9,color:"#67f0b0",letterSpacing:".08em"}}>● LIVE</div>
    </div>

    {error?<div style={{marginTop:14,color:"#ffb4a8",fontSize:11}}>Jeeves summary unavailable: {error}</div>:
      <div style={{display:"grid",gap:9,marginTop:15}}>
        {brief.map((line,i)=><div key={i} style={{display:"flex",gap:11,alignItems:"flex-start",padding:"11px 13px",borderRadius:9,background:"rgba(255,255,255,.028)",border:"1px solid rgba(255,255,255,.055)",fontSize:11,lineHeight:1.55,color:"#cbd5dd"}}>
          <span style={{color:"#d8ff54",fontWeight:900,minWidth:22}}>{String(i+1).padStart(2,"0")}</span><span>{line}</span>
        </div>)}
        {!brief.length&&<div style={{color:"#748391",fontSize:11}}>Jeeves is waiting for the first usable capture.</div>}
      </div>
    }

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:9,marginTop:14}}>
      {[
        ["YOUR PROVINCE",latest?.province_name||history?.identity?.provinceName||"—",latest?.observed_at?"Updated "+ageLabel(latest.observed_at):"No capture","/command/province"],
        ["KINGDOM",kingdom?.kingdom?.code||history?.identity?.kingdomId||"—",members.length?`${members.length} provinces visible`:"No roster capture","/command/kingdom"],
        ["ENEMY INTEL",fmt(enemy?.count||0),enemies.length?"profiles available":"No classified targets","/command/enemy-intel"],
        ["EVENTS",fmt(events.length),events.length?"recent activity":"No recent events","/command/war-room"],
      ].map(([label,value,sub,href])=><Link key={label} href={href as string} style={{textDecoration:"none",color:"inherit",padding:"13px",borderRadius:9,border:"1px solid rgba(255,255,255,.06)",background:"#081119"}}>
        <div style={{fontSize:8,color:"#657482",letterSpacing:".14em"}}>{label}</div>
        <strong style={{display:"block",fontSize:17,marginTop:6,color:"#e7eef5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</strong>
        <span style={{display:"block",fontSize:9,color:"#718091",marginTop:4}}>{sub}</span>
        <span style={{display:"block",fontSize:8,color:"#d8ff54",marginTop:8,letterSpacing:".08em"}}>OPEN →</span>
      </Link>)}
    </div>

    {!error&&signals.length>0&&<>
      <div style={{marginTop:16,fontSize:8,color:"#657482",letterSpacing:".18em"}}>JEEVES // LIVE SIGNAL BOARD</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:9,marginTop:8}}>
        {signals.map(s=><Link key={s.label} href={s.href} style={{textDecoration:"none",color:"inherit",padding:"11px 12px",borderRadius:9,border:"1px solid rgba(255,255,255,.06)",background:"rgba(255,255,255,.018)"}}>
          <div style={{fontSize:8,color:"#657482",letterSpacing:".12em"}}>{s.label}</div>
          <strong style={{display:"block",fontSize:16,marginTop:5,color:"#e7eef5"}}>{s.value}</strong>
          <span style={{display:"block",fontSize:9,color:"#718091",marginTop:3}}>{s.detail}</span>
          <span style={{display:"block",fontSize:8,color:"#d8ff54",marginTop:7}}>DRILL DOWN →</span>
        </Link>)}
      </div>
    </>}
  </section>
}