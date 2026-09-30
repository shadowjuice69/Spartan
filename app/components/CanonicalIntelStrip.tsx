"use client"

import { useEffect, useState } from "react"

function scalar(v:any){
  if(v==null||v==="") return "—"
  if(typeof v==="object") return JSON.stringify(v)
  return String(v)
}

export default function CanonicalIntelStrip({section="kingdom"}:{section?:string}){
  const [records,setRecords]=useState<any[]>([])
  const [error,setError]=useState("")
  useEffect(()=>{
    let live=true
    const load=async()=>{
      try{
        const r=await fetch("/api/intel-data?section="+encodeURIComponent(section),{cache:"no-store"})
        const j=await r.json().catch(()=>({}))
        if(!r.ok) throw new Error(j.error||"Intel unavailable")
        if(live){setRecords(j.records||[]);setError("")}
      }catch(e){if(live)setError(e instanceof Error?e.message:"Intel unavailable")}
    }
    load()
    const t=setInterval(load,15000)
    return()=>{live=false;clearInterval(t)}
  },[section])
  return <section style={{padding:18,border:"1px solid rgba(103,240,176,.16)",borderRadius:12,background:"#081119",marginBottom:18}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:12,marginBottom:12}}>
      <div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>CANONICAL INTEL FEED</div><h2 style={{margin:"6px 0 2px",fontSize:20}}>Live intelligence evidence</h2><div style={{fontSize:10,color:"#687686"}}>The same classified records available to the Spartan Intel core and Discord bot.</div></div>
      <span style={{fontSize:8,color:"#67f0b0"}}>{records.length} RECORDS · 15s</span>
    </div>
    {error&&<div style={{color:"#ff9b9b",fontSize:10,padding:"8px 0"}}>{error}</div>}
    {!error&&!records.length&&<div style={{color:"#718091",fontSize:10,padding:"18px 0"}}>No canonical Intel has been captured for this section yet.</div>}
    <div style={{display:"grid",gap:7}}>
      {records.slice(0,12).map((r:any,i:number)=><article key={String(r.id||r.capture_id||i)} style={{display:"grid",gridTemplateColumns:"105px 1fr 85px",gap:10,padding:"10px 0",borderTop:"1px solid rgba(255,255,255,.05)"}}>
        <div><strong style={{fontSize:9,color:"#d8ff54"}}>{String(r.page_kind||"intel").toUpperCase()}</strong><div style={{fontSize:7,color:r.visibility==="enemy"?"#ffbd66":"#67f0b0",marginTop:3}}>{r.visibility==="enemy"?"ENEMY":"OWN"}</div></div>
        <div style={{fontSize:9,color:"#cbd6de",lineHeight:1.45,overflowWrap:"anywhere"}}>{r.raw_text||scalar(r.payload)||"Classified record"}<div style={{fontSize:7,color:"#657483",marginTop:3}}>Target {r.target_province_id||"—"} · KD {r.target_kingdom_id||r.kingdom_id||"—"}</div></div>
        <div style={{fontSize:7,color:"#718091",textAlign:"right"}}>{r.captured_at?new Date(r.captured_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"}</div>
      </article>)}
    </div>
  </section>
}