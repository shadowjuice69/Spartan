"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type Vertical = {
  title: string
  eyebrow: string
  description: string
  kinds: string[]
  accent: string
  metrics: Array<[string, string[]]>
  links?: string[]
}

const verticals: Record<string, Vertical> = {
  intel: {
    title: "INTELLIGENCE CORE",
    eyebrow: "SPARTAN // COMPLETE INTELLIGENCE",
    description: "Cross-system intelligence, provenance, classification and source evidence.",
    kinds: ["intel","utopiaintel","bot_event","news","attack","aid","military","som","magic","ritual","dragon","thievery","science","buildings","survey","throne","kingdom","universal","exploration","war","council_history","council_spells","council_state","council_military","council_science","council_internal","province_state","age_stats","unknown"],
    accent: "#d8ff54",
    metrics: [["Records",["records"]],["Latest",["captured_at"]],["Sources",["source"]],["Classifications",["classification_source"]]],
  },
  magic: {
    title: "MAGIC INTELLIGENCE",
    eyebrow: "SPARTAN // ARCANE OPERATIONS",
    description: "Spells, rituals, dragons, targets, effects, resources and outcomes.",
    kinds: ["magic","ritual","dragon","council_spells"],
    accent: "#c69cff",
    metrics: [["Spell",["spellName","spell","name"]],["Caster",["caster","attacker","province_name"]],["Target",["target","targetProvince"]],["Result",["effect","result","success"]],["Runes",["runes"]],["Duration",["duration"]]],
  },
  thievery: {
    title: "THIEVERY INTELLIGENCE",
    eyebrow: "SPARTAN // COVERT OPERATIONS",
    description: "Hostile operations, targets, thieves committed, results, losses and resources.",
    kinds: ["thievery"],
    accent: "#ffbd66",
    metrics: [["Operation",["operation","op","operationName"]],["Province",["attacker","province","province_name"]],["Target",["target","targetProvince"]],["Result",["result","success","outcome"]],["Thieves",["thievesSent","thieves"]],["Losses",["thievesLost"]]],
  },
  science: {
    title: "SCIENCE INTELLIGENCE",
    eyebrow: "SPARTAN // SCIENCE LAB",
    description: "Science categories, levels, effects, progression and source captures.",
    kinds: ["science","council_science"],
    accent: "#67f0b0",
    metrics: [["Category",["category","science"]],["Level",["level"]],["Effect",["effect"]],["Change",["change"]],["Province",["province","province_name"]]],
  },
  buildings: {
    title: "BUILDING INTELLIGENCE",
    eyebrow: "SPARTAN // DEVELOPMENT",
    description: "Survey/building intelligence, land allocation, percentages and changes.",
    kinds: ["survey","buildings","council_internal"],
    accent: "#7db7ff",
    metrics: [["Building",["building","buildings"]],["Count",["count"]],["Percent",["percent","percentage"]],["Land",["land","totalLand","acres"]],["Change",["change"]]],
  },
  throne: {
    title: "THRONE INTELLIGENCE",
    eyebrow: "SPARTAN // PROVINCE STATE",
    description: "Canonical province state, military, economy, ratios and captured telemetry.",
    kinds: ["throne","province_state"],
    accent: "#d8ff54",
    metrics: [["Province",["province_name","province"]],["Acres",["acres","land"]],["Networth",["networth","nw"]],["Offense",["offense","off"]],["Defense",["defense","def"]],["TPA",["tpa"]],["WPA",["wpa"]],["BE",["build_efficiency","be"]]],
  },
  news: {
    title: "NEWS INTELLIGENCE",
    eyebrow: "SPARTAN // EVENT FEED",
    description: "Kingdom news, attacks, diplomacy, rituals, dragons and other captured events.",
    kinds: ["news","attack","war","aid","dragon","ritual"],
    accent: "#ffbd66",
    metrics: [["Event",["category","event_type","attackType"]],["Attacker",["attacker","attackerProvince"]],["Target",["target","targetProvince"]],["Acres",["acres_captured","acresCaptured","acres"]],["Loot",["loot","books_looted"]],["Result",["result","narrative"]]],
  },
  "war-room": {
    title: "WAR ROOM",
    eyebrow: "SPARTAN // OPERATIONS",
    description: "Combat, hostile magic, thievery and strategic events in one operational view.",
    kinds: ["news","attack","war","military","thievery","magic","ritual","dragon","aid"],
    accent: "#ff8b8b",
    metrics: [["Type",["attackType","operation","spell","category"]],["Attacker",["attacker","attackerProvince"]],["Target",["target","targetProvince"]],["Acres",["acres","acresCaptured"]],["Kills",["kills"]],["Losses",["losses"]]],
  },
}

const navCommand = [["Command","/"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Wiki","/command/wiki"],["Tools","/command/tools"],["Scraper Generator","/command/scraper"]]
const navIntel = [["Intel","/command/intel"],["Kingdom","/command/kingdom"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["News","/command/news"],["Enemy Intel","/command/enemy-intel"]]

function scalar(v:any) {
  if (v == null || v === "") return "—"
  if (typeof v === "number") return v.toLocaleString()
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

function pretty(key:string) {
  return key.replaceAll("_"," ").replace(/w/g, c => c.toUpperCase())
}

function valueAt(payload:any, keys:string[]) {
  if (!payload || typeof payload !== "object") return null
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") return payload[key]
    const hit = Object.entries(payload).find(([k,v]) => k.toLowerCase() === key.toLowerCase() && v !== undefined && v !== null && v !== "")
    if (hit) return hit[1]
  }
  return null
}

function Value({value, depth=0}:{value:any, depth?:number}) {
  if (value == null) return <span style={{color:"#718091"}}>—</span>
  if (typeof value !== "object") return <span style={{overflowWrap:"anywhere"}}>{scalar(value)}</span>
  if (Array.isArray(value)) {
    return <div style={{display:"grid",gap:7}}>{value.slice(0,60).map((v,i)=><div key={i} style={{padding:"8px 10px",background:"rgba(255,255,255,.025)",borderRadius:7}}><span style={{fontSize:8,color:"#657483"}}>ITEM {i+1}</span><Value value={v} depth={depth+1}/></div>)}</div>
  }
  return <div style={{display:"grid",gridTemplateColumns:depth>1?"1fr":"repeat(auto-fit,minmax(150px,1fr))",gap:7}}>{Object.entries(value).slice(0,100).map(([k,v])=><div key={k} style={{padding:"9px 10px",background:"rgba(255,255,255,.025)",borderRadius:7}}><div style={{fontSize:8,color:"#657483",textTransform:"uppercase",letterSpacing:".08em"}}>{pretty(k)}</div><div style={{fontSize:11,marginTop:4}}><Value value={v} depth={depth+1}/></div></div>)}</div>
}

function summary(row:any, vertical:Vertical) {
  const p=row?.payload || {}
  const values = vertical.metrics.map(([label,keys]) => [label,valueAt(p,keys)] as const).filter(([,v])=>v!==null)
  if (values.length) return values.slice(0,4).map(([k,v])=>`${k}: ${scalar(v)}`).join(" · ")
  return row?.classification_reason || "Captured intelligence record"
}

export default function IntelVerticalPage() {
  const params=useParams<{section:string}>()
  const router=useRouter()
  const section=String(params.section||"intel")
  const vertical=verticals[section] || verticals.intel
  const [data,setData]=useState<any>(null)
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(true)
  const [expanded,setExpanded]=useState<string|null>(null)

  useEffect(()=>{
    let live=true
    const load=async()=>{
      try{
        const apiSection=section==="news" ? "war-room" : section
        const r=await fetch("/api/intel-data?section="+encodeURIComponent(apiSection),{cache:"no-store"})
        const j=await r.json().catch(()=>({}))
        if(!r.ok) throw new Error(j.error||"Intel data unavailable")
        if(live){setData(j);setError("")}
      }catch(e){if(live)setError(e instanceof Error?e.message:"Intel data unavailable")}
      finally{if(live)setLoading(false)}
    }
    load()
    const t=setInterval(load,30000)
    return()=>{live=false;clearInterval(t)}
  },[section])

  const records=data?.records||[]
  const counts=data?.counts||{}
  const latest=records[0]?.payload||{}
  const current=useMemo(()=>vertical.metrics.map(([label,keys])=>({label,value:valueAt(latest,keys)})).filter(x=>x.value!==null),[latest,vertical])
  const sourceCounts=useMemo(()=>{
    const m=new Map<string,number>()
    records.forEach((r:any)=>m.set(String(r.source||"unknown"),(m.get(String(r.source||"unknown"))||0)+1))
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)
  },[records])

  return <main style={{minHeight:"100vh",background:"#05080d",color:"#e7eef5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
    <aside style={{width:250,flexShrink:0,borderRight:"1px solid rgba(255,255,255,.08)",padding:24,background:"#071018",position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
      <div style={{fontWeight:900,letterSpacing:".18em",color:"#d8ff54",fontSize:15}}>SPARTAN</div>
      <div style={{fontSize:10,color:"#718091",letterSpacing:".16em",marginTop:5}}>UTOPIA INTELLIGENCE</div>
      <div style={{margin:"30px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>COMMAND SYSTEMS</div>
      {navCommand.map(([n,p])=><button key={n} onClick={()=>router.push(p)} style={{width:"100%",textAlign:"left",padding:"11px 12px",marginBottom:4,border:0,borderRadius:8,background:"transparent",color:"#aeb9c5",cursor:"pointer",fontWeight:700,fontSize:11}}>{n}</button>)}
      <div style={{margin:"22px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>INTEL DATA</div>
      {navIntel.map(([n,p])=><button key={n} onClick={()=>router.push(p)} style={{width:"100%",textAlign:"left",padding:"11px 12px",marginBottom:4,border:"1px solid transparent",borderRadius:8,background:p===`/command/${section}`?"rgba(216,255,84,.08)":"transparent",color:p===`/command/${section}`?"#d8ff54":"#aeb9c5",cursor:"pointer",fontWeight:700,fontSize:11}}>{n}</button>)}
      <div style={{marginTop:28,padding:12,border:`1px solid ${vertical.accent}35`,borderRadius:10,fontSize:9,color:vertical.accent}}>● INTEL CORE ONLINE<br/><span style={{color:"#718091"}}>Classified evidence · 30s refresh</span></div>
    </aside>

    <section style={{flex:1,padding:"28px 34px 50px",maxWidth:1550,overflowX:"hidden"}}>
      <header style={{display:"flex",justifyContent:"space-between",gap:18,alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:9,color:vertical.accent,letterSpacing:".2em"}}>{vertical.eyebrow}</div>
          <h1 style={{fontSize:36,margin:"7px 0 4px"}}>{vertical.title}</h1>
          <div style={{fontSize:12,color:"#778493"}}>Province {data?.province||"—"} · Kingdom {data?.kingdom||"—"} · {vertical.description}</div>
        </div>
        <button onClick={()=>router.push("/")} style={{padding:"11px 16px",borderRadius:9,border:"1px solid #d8ff54",background:"#101c23",color:"#d8ff54",fontWeight:900,fontSize:10,cursor:"pointer"}}>← COMMAND CENTER</button>
      </header>

      {loading&&!data&&!error&&<div style={{padding:18,color:vertical.accent}}>LOADING {vertical.title}…</div>}
      {error&&<div style={{padding:14,marginBottom:18,border:"1px solid rgba(255,100,100,.3)",background:"rgba(255,60,60,.06)",borderRadius:10,color:"#ff9b9b"}}><strong>DATA CORE NOTICE</strong><div style={{marginTop:5}}>{error}</div></div>}

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:16}}>
        <article style={{padding:16,border:`1px solid ${vertical.accent}35`,borderRadius:10,background:"#081119"}}><div style={{fontSize:8,color:"#687686"}}>CLASSIFIED RECORDS</div><strong style={{display:"block",fontSize:24,marginTop:7,color:vertical.accent}}>{records.length.toLocaleString()}</strong></article>
        {current.slice(0,7).map(x=><article key={x.label} style={{padding:16,border:"1px solid rgba(255,255,255,.08)",borderRadius:10,background:"#081119"}}><div style={{fontSize:8,color:"#687686"}}>{x.label.toUpperCase()}</div><strong style={{display:"block",fontSize:17,marginTop:7,overflowWrap:"anywhere"}}>{scalar(x.value)}</strong></article>)}
      </section>

      <section style={{display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(260px,1fr)",gap:16,marginBottom:16}}>
        <article style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
          <div style={{fontSize:9,color:vertical.accent,letterSpacing:".16em"}}>DATA MAP</div>
          <h2 style={{margin:"7px 0 12px",fontSize:20}}>What this page knows</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8}}>
            {vertical.metrics.map(([label,keys])=>{
              const value=valueAt(latest,keys)
              return <div key={label} style={{padding:11,border:"1px solid rgba(255,255,255,.06)",borderRadius:8}}><div style={{fontSize:8,color:"#657483"}}>{label}</div><div style={{fontSize:11,marginTop:4,overflowWrap:"anywhere"}}>{value==null?"Waiting for matching field":scalar(value)}</div><div style={{fontSize:8,color:"#4f5d6a",marginTop:5}}>keys: {keys.join(", ")}</div></div>
            })}
          </div>
        </article>
        <article style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
          <div style={{fontSize:9,color:vertical.accent,letterSpacing:".16em"}}>SOURCE MIX</div>
          <h2 style={{margin:"7px 0 12px",fontSize:20}}>Where the intelligence comes from</h2>
          {sourceCounts.length?sourceCounts.map(([source,n])=><div key={source} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.05)",fontSize:11}}><span style={{color:"#9aa7b4",overflowWrap:"anywhere"}}>{source}</span><strong>{n}</strong></div>):<div style={{color:"#718091"}}>No classified records yet.</div>}
        </article>
      </section>

      <section style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap",marginBottom:10}}>
          <div><div style={{fontSize:9,color:vertical.accent,letterSpacing:".16em"}}>CAPTURED INTELLIGENCE</div><h2 style={{margin:"7px 0 4px",fontSize:22}}>Operational records</h2><div style={{fontSize:11,color:"#748190"}}>Newest first. Every record retains identity, classification and source provenance.</div></div>
          <div style={{fontSize:9,color:vertical.accent}}>AUTO-REFRESH 30s</div>
        </div>
        {records.slice(0,40).map((row:any,i:number)=>{
          const id=String(row.id||row.capture_id||i)
          const open=expanded===id
          return <article key={id} style={{borderBottom:"1px solid rgba(255,255,255,.07)",padding:"14px 0"}}>
            <button onClick={()=>setExpanded(open?null:id)} style={{width:"100%",border:0,background:"transparent",color:"#e7eef5",textAlign:"left",cursor:"pointer",padding:0}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:15,alignItems:"center"}}>
                <div><strong style={{fontSize:12,color:vertical.accent,textTransform:"uppercase"}}>{row.page_kind||section}</strong><div style={{fontSize:11,color:"#aeb9c5",marginTop:5}}>{row.province_name||row.province_id||"Unknown province"} · {row.kingdom_id||data?.kingdom||"Unknown kingdom"}</div><div style={{fontSize:10,color:"#718091",marginTop:4}}>{summary(row,vertical)}</div></div>
                <div style={{textAlign:"right",fontSize:9,color:"#718091",whiteSpace:"nowrap"}}>{row.captured_at?new Date(row.captured_at).toLocaleString():"—"}<div style={{marginTop:4,color:open?vertical.accent:"#718091"}}>{open?"CLOSE":"OPEN DETAILS"}</div></div>
              </div>
            </button>
            {open&&<div style={{paddingTop:14}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:8,marginBottom:12}}>
                {[["Province",row.province_name||row.province_id],["Kingdom",row.kingdom_id],["Source",row.source],["Source ID",row.source_id],["Game age",row.age],["Game year",row.game_year],["Tick",row.game_tick],["Classification",row.classification_source],["Confidence",row.classification_confidence]].map(([k,v])=><div key={String(k)} style={{padding:10,border:"1px solid rgba(255,255,255,.05)",borderRadius:7}}><div style={{fontSize:8,color:"#657483"}}>{k}</div><div style={{fontSize:10,marginTop:4,overflowWrap:"anywhere"}}>{scalar(v)}</div></div>)}
              </div>
              {row.classification_reason&&<div style={{padding:10,marginBottom:12,border:`1px solid ${vertical.accent}22`,borderRadius:7,fontSize:10,color:"#9eabb8"}}><strong style={{color:vertical.accent}}>CLASSIFICATION:</strong> {row.classification_reason}</div>}
              <div style={{padding:12,border:"1px solid rgba(255,255,255,.05)",borderRadius:8}}><div style={{fontSize:8,color:"#657483",marginBottom:7}}>PARSED INTELLIGENCE</div><Value value={row.payload}/></div>
              <details style={{marginTop:10}}><summary style={{cursor:"pointer",color:vertical.accent,fontSize:10}}>SOURCE EVIDENCE</summary>{row.raw_text&&<div style={{marginTop:8,padding:12,background:"#05080d",borderRadius:8,fontSize:10,lineHeight:1.5,color:"#9eabb8",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{row.raw_text}</div>}{row.raw_payload&&<pre style={{marginTop:8,padding:12,background:"#05080d",borderRadius:8,fontSize:9,lineHeight:1.45,color:"#9eabb8",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(row.raw_payload,null,2)}</pre>}</details>
            </div>}
          </article>
        })}
        {!records.length&&<div style={{padding:"45px 0",color:"#748190",textAlign:"center"}}>No processed intelligence is available for this vertical yet.</div>}
        {records.length>40&&<div style={{marginTop:14,fontSize:9,color:"#718091"}}>Showing the latest 40 records. Full history remains in the intelligence core and will be surfaced through drill-down/history views.</div>}
      </section>
    </section>
  </main>
}
