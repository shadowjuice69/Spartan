"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { NAV_COMMAND as navCommand, NAV_INTEL as navIntel } from '@/lib/spartan/nav'

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



function scalar(v:any) {
  if (v == null || v === "") return "—"
  if (typeof v === "number") return v.toLocaleString()
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

function pretty(key:string) {
  return key.replaceAll("_"," ").replace(/w/g, c => c.toUpperCase())
}

function unwrapPayload(payload:any) {
  if (!payload || typeof payload !== "object") return {}
  const nested = payload.data ?? payload.parsed_payload?.data
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested : payload
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

function entityHref(key:string, value:any) { const k=key.toLowerCase(); const type=k.includes("race")?"race":k.includes("personality")?"personality":k.includes("kingdom")?"kingdom":k.includes("attack")?"attack":k.includes("province")?"province":null; if(!type || typeof value!=="string" || !value.trim()) return null; return "/command/entity/"+type+"/"+encodeURIComponent(value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")); }

function Value({value, depth=0, keyName}:{value:any, depth?:number, keyName?:string}) {
  if (value == null) return <span style={{color:"#718091"}}>—</span>
  if (typeof value !== "object") { const href=entityHref(String(keyName||""),value); return href ? <a href={href} style={{color:"#d8ff54",textDecoration:"none",borderBottom:"1px dashed #d8ff5455"}}>{scalar(value)}</a> : <span style={{overflowWrap:"anywhere"}}>{scalar(value)}</span> }
  if (Array.isArray(value)) {
    return <div style={{display:"grid",gap:7}}>{value.slice(0,60).map((v,i)=><div key={i} style={{padding:"8px 10px",background:"rgba(255,255,255,.025)",borderRadius:7}}><span style={{fontSize:8,color:"#657483"}}>ITEM {i+1}</span><Value value={v} depth={depth+1}/></div>)}</div>
  }
  return <div style={{display:"grid",gridTemplateColumns:depth>1?"1fr":"repeat(auto-fit,minmax(150px,1fr))",gap:7}}>{Object.entries(value).slice(0,100).map(([k,v])=><div key={k} style={{padding:"9px 10px",background:"rgba(255,255,255,.025)",borderRadius:7}}><div style={{fontSize:8,color:"#657483",textTransform:"uppercase",letterSpacing:".08em"}}>{pretty(k)}</div><div style={{fontSize:11,marginTop:4}}><Value value={v} depth={depth+1}/></div></div>)}</div>
}


function numValue(v:any) {
  if (v == null || v === "") return null
  const n = Number(String(v).replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

function Bar({value,max,label,negative=false,accent="#d8ff54"}:{value:number,max:number,label:string,negative?:boolean,accent?:string}) {
  const width = max > 0 ? Math.max(2, Math.min(100, Math.round((Math.abs(value)/max)*100))) : 2
  return <div style={{display:"grid",gridTemplateColumns:"110px 1fr 78px",gap:8,alignItems:"center",marginBottom:9}}>
    <div style={{fontSize:9,color:"#9aa7b4",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
    <div style={{height:10,background:"rgba(255,255,255,.06)",borderRadius:99,overflow:"hidden"}}><div style={{width:`${width}%`,height:"100%",background:negative?"#ff8b8b":accent,borderRadius:99}} /></div>
    <div style={{fontSize:9,textAlign:"right",color:negative?"#ff9b9b":accent}}>{negative?"-":""}{Math.round(Math.abs(value)).toLocaleString()}</div>
  </div>
}

function Sparkline({values,labels,accent}:{values:number[],labels:string[],accent:string}) {
  const clean=values.filter(v=>Number.isFinite(v))
  if(clean.length<2) return <div style={{padding:"30px 0",color:"#748190",fontSize:10}}>Not enough historical numeric data for this graphic yet.</div>
  const min=Math.min(...clean), max=Math.max(...clean), span=max-min || 1
  const points=clean.map((v,i)=>`${(i/(clean.length-1))*100},${92-((v-min)/span)*78}`).join(" ")
  return <div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:150,display:"block",overflow:"visible"}}>
      <polyline points={points} fill="none" stroke={accent} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
      <polyline points={points} fill="none" stroke={accent} strokeWidth="9" opacity=".08" vectorEffect="non-scaling-stroke"/>
    </svg>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#5f6c7a"}}><span>{labels[0]}</span><span>{labels[labels.length-1]}</span></div>
  </div>
}

function Panel({eyebrow,title,accent,children}:{eyebrow:string,title:string,accent:string,children:any}) {
  return <article style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:14,background:"linear-gradient(145deg,#0a141d,#071018)",boxShadow:"0 12px 35px rgba(0,0,0,.18)"}}>
    <div style={{fontSize:8,color:accent,letterSpacing:".2em",fontWeight:900}}>{eyebrow}</div>
    <h2 style={{margin:"7px 0 15px",fontSize:20,letterSpacing:"-.02em"}}>{title}</h2>
    {children}
  </article>
}

function MiniBars({items,accent,limit=8}:{items:Array<[string,number]>,accent:string,limit?:number}) {
  const rows=items.filter(([,v])=>Number.isFinite(v)).slice(0,limit)
  const max=Math.max(1,...rows.map(([,v])=>Math.abs(v)))
  return rows.length ? <div>{rows.map(([label,value])=><Bar key={label} value={value} max={max} label={label} accent={accent}/>)}</div> : <div style={{padding:"28px 0",color:"#748190",fontSize:10}}>Waiting for enough structured intelligence.</div>
}

function MetricStrip({items,accent}:{items:Array<[string,string]>,accent:string}) {
  return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(115px,1fr))",gap:7}}>
    {items.map(([label,value])=><div key={label} style={{padding:"10px 11px",borderRadius:9,background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.055)"}}>
      <div style={{fontSize:7,color:"#647382",letterSpacing:".12em"}}>{label.toUpperCase()}</div>
      <div style={{marginTop:5,fontSize:14,fontWeight:850,color:accent,overflowWrap:"anywhere"}}>{value}</div>
    </div>)}
  </div>
}

function graphicFor(section:string,records:any[],accent:string) {
  const recent=[...records].slice(0,24).reverse()
  const payload=(r:any)=>r?.payload?.data ?? r?.payload ?? {}
  const field=(r:any,keys:string[])=>numValue(valueAt(payload(r),keys))
  const time=(r:any)=>r?.captured_at?new Date(r.captured_at).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"—"

  if(!records.length) return <Panel eyebrow="LIVE VISUALIZATION" title="Awaiting intelligence" accent={accent}><div style={{padding:"45px 0",textAlign:"center",color:"#748190",fontSize:10}}>The display is ready. Structured captures will populate the tactical graphics automatically.</div></Panel>

  if(section==="intel") {
    const kinds=new Map<string,number>(), sources=new Map<string,number>()
    records.forEach(r=>{const k=String(r.page_kind||"unknown");kinds.set(k,(kinds.get(k)||0)+1);const src=String(r.source||"unknown");sources.set(src,(sources.get(src)||0)+1)})
    const items=[...kinds.entries()].sort((a,b)=>b[1]-a[1]), sourceItems=[...sources.entries()].sort((a,b)=>b[1]-a[1])
    return <div style={{display:"grid",gap:14}}>
      <Panel eyebrow="COMMAND PICTURE" title="Intelligence distribution" accent={accent}><MiniBars items={items} accent={accent}/></Panel>
      <Panel eyebrow="SIGNAL DIVERSITY" title="Source network" accent={accent}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
          {sourceItems.slice(0,8).map(([name,n],i)=><div key={name} style={{padding:13,borderRadius:10,background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.055)"}}>
            <div style={{fontSize:8,color:"#647382"}}>SOURCE {String(i+1).padStart(2,"0")}</div><div style={{fontSize:11,marginTop:6,overflowWrap:"anywhere"}}>{name}</div><div style={{fontSize:19,fontWeight:900,color:accent,marginTop:5}}>{n.toLocaleString()}</div>
          </div>)}
        </div>
      </Panel>
    </div>
  }

  if(section==="magic") {
    const spells=new Map<string,number>(), targets=new Map<string,number>()
    records.forEach(r=>{const spell=String(valueAt(payload(r),["spellName","spell","name","operation"])||"Unknown");spells.set(spell,(spells.get(spell)||0)+1);const target=String(valueAt(payload(r),["targetProvince","target","target_name"])||"Unknown");targets.set(target,(targets.get(target)||0)+1)})
    const effects=records.map(r=>field(r,["damage","damageDone","effectValue","runes","mana"])).filter((v):v is number=>v!==null)
    return <div style={{display:"grid",gap:14}}>
      <Panel eyebrow="ARCANE ACTIVITY" title="Spell activity matrix" accent={accent}><MiniBars items={[...spells.entries()].sort((a,b)=>b[1]-a[1])} accent={accent}/></Panel>
      <Panel eyebrow="TARGET PICTURE" title="Who is being affected" accent={accent}><MiniBars items={[...targets.entries()].sort((a,b)=>b[1]-a[1])} accent={accent}/></Panel>
      {effects.length>=2&&<Panel eyebrow="RESOURCE / EFFECT HISTORY" title="Captured effect movement" accent={accent}><Sparkline values={effects.slice(-16)} labels={recent.slice(-Math.min(16,effects.length)).map(time)} accent={accent}/></Panel>}
    </div>
  }

  if(section==="thievery") {
    const ops=new Map<string,number>(), targets=new Map<string,number>()
    records.forEach(r=>{const op=String(valueAt(payload(r),["operation","op","operationName","type"])||"Unknown");ops.set(op,(ops.get(op)||0)+1);const target=String(valueAt(payload(r),["targetProvince","target"])||"Unknown");targets.set(target,(targets.get(target)||0)+1)})
    const thieves=records.map(r=>field(r,["thievesSent","thieves","thievesUsed"])).filter((v):v is number=>v!==null)
    const lost=records.map(r=>field(r,["thievesLost","losses"])).filter((v):v is number=>v!==null)
    return <div style={{display:"grid",gap:14}}>
      <Panel eyebrow="COVERT OPS" title="Operations profile" accent={accent}><MiniBars items={[...ops.entries()].sort((a,b)=>b[1]-a[1])} accent={accent}/></Panel>
      <Panel eyebrow="TARGET NETWORK" title="Target activity" accent={accent}><MiniBars items={[...targets.entries()].sort((a,b)=>b[1]-a[1])} accent={accent}/></Panel>
      {(thieves.length>=2||lost.length>=2)&&<Panel eyebrow="ASSET EXPOSURE" title="Thief commitment & losses" accent={accent}><MetricStrip accent={accent} items={[[ "Sent", String(thieves.at(-1)??0) ],[ "Lost", String(lost.at(-1)??0) ],[ "Successes", String(records.filter(r=>String(valueAt(payload(r),["success","result","outcome"])).toLowerCase().includes("success")).length) ]]}/></Panel>}
    </div>
  }

  if(section==="science") {
    const categories=new Map<string,number>()
    records.forEach(r=>{const c=String(valueAt(payload(r),["category","science","name"])||"Unknown");categories.set(c,(categories.get(c)||0)+1)})
    const levels=recent.map(r=>field(r,["level","scienceLevel","value"])).filter((v):v is number=>v!==null)
    return <div style={{display:"grid",gap:14}}>
      <Panel eyebrow="RESEARCH PROGRAM" title="Science by category" accent={accent}><MiniBars items={[...categories.entries()].sort((a,b)=>b[1]-a[1])} accent={accent}/></Panel>
      {levels.length>=2&&<Panel eyebrow="PROGRESSION" title="Research level history" accent={accent}><Sparkline values={levels} labels={recent.slice(-levels.length).map(time)} accent={accent}/></Panel>}
      <Panel eyebrow="LAB TELEMETRY" title="Latest research signals" accent={accent}><MetricStrip accent={accent} items={recent.slice(-4).reverse().map((r,i)=>["Signal "+(i+1),String(valueAt(payload(r),["category","science","name","level"])??"Captured")])}/></Panel>
    </div>
  }

  if(section==="buildings") {
    const composition=new Map<string,number>()
    records.forEach(r=>{const name=String(valueAt(payload(r),["building","buildingName","name"])||"Buildings");const value=field(r,["percent","percentage","count"]);if(value!==null)composition.set(name,(composition.get(name)||0)+value)})
    const land=recent.map(r=>field(r,["land","totalLand","acres"])).filter((v):v is number=>v!==null)
    return <div style={{display:"grid",gap:14}}>
      <Panel eyebrow="PROVINCE DEVELOPMENT" title="Building composition" accent={accent}><MiniBars items={[...composition.entries()].sort((a,b)=>b[1]-a[1])} accent={accent}/></Panel>
      {land.length>=2&&<Panel eyebrow="LAND MOVEMENT" title="Total land history" accent={accent}><Sparkline values={land} labels={recent.slice(-land.length).map(time)} accent={accent}/></Panel>}
      <Panel eyebrow="CONSTRUCTION SIGNALS" title="Latest building telemetry" accent={accent}><MetricStrip accent={accent} items={recent.slice(-5).reverse().map((r,i)=>["Capture "+(i+1),String(valueAt(payload(r),["building","buildingName","name","percent","percentage"])??"Survey")])}/></Panel>
    </div>
  }

  if(section==="throne") {
    const metrics=[["Acres",["acres","land"]],["Networth",["networth","nw"]],["Offense",["offense","off"]],["Defense",["defense","def"]],["TPA",["tpa"]],["WPA",["wpa"]]].map(([label,keys])=>({label:String(label),values:recent.map(r=>field(r,keys as string[])).filter((v):v is number=>v!==null)}))
    return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14}}>
      {metrics.filter(m=>m.values.length>=2).map(m=><Panel key={m.label} eyebrow="PROVINCE TELEMETRY" title={m.label+" movement"} accent={accent}><Sparkline values={m.values} labels={recent.slice(-m.values.length).map(time)} accent={accent}/><div style={{marginTop:10,fontSize:9,color:"#718091"}}>Latest: <span style={{color:accent,fontWeight:800}}>{m.values.at(-1)?.toLocaleString()}</span> · Samples: {m.values.length}</div></Panel>)}
    </div>
  }

  if(section==="news" || section==="war-room") {
    const rows=recent.map(r=>({time:time(r),acres:field(r,["acresCaptured","acres_captured","acres","acresGained"])??0,kills:field(r,["kills"])??0,losses:field(r,["losses","troopsLost"])??0}))
    const impact=rows.map(x=>x.acres+x.kills+x.losses)
    return <div style={{display:"grid",gap:14}}>
      <Panel eyebrow={section==="war-room"?"TACTICAL OPERATIONS":"EVENT INTELLIGENCE"} title="Operational impact timeline" accent={accent}>
        {rows.slice(-10).reverse().map((x,i)=><div key={i} style={{padding:"11px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#718091",marginBottom:7}}><span>{x.time}</span><span>{x.acres.toLocaleString()} acres · {x.kills.toLocaleString()} kills · {x.losses.toLocaleString()} losses</span></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
            <Bar value={x.acres} max={Math.max(1,...rows.map(y=>y.acres))} label="ACRES" accent={accent}/>
            <Bar value={x.kills} max={Math.max(1,...rows.map(y=>y.kills))} label="KILLS" accent={accent}/>
            <Bar value={x.losses} max={Math.max(1,...rows.map(y=>y.losses))} label="LOSSES" negative accent={accent}/>
          </div>
        </div>)}
      </Panel>
      <Panel eyebrow="BATTLE RHYTHM" title="Impact over captured history" accent={accent}><Sparkline values={impact} labels={rows.map(x=>x.time)} accent={accent}/></Panel>
    </div>
  }

  return null
}

function summary(row:any, vertical:Vertical) {
  const p=unwrapPayload(row?.payload ?? row?.parsed_payload)
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
  const [showAll,setShowAll]=useState(false)
  const [recordSearch,setRecordSearch]=useState("")
  const [sourceFilter,setSourceFilter]=useState("all")
  const [kindFilter,setKindFilter]=useState("all")
  const [compareLeft,setCompareLeft]=useState("")
  const [compareRight,setCompareRight]=useState("")

  useEffect(()=>{
    let live=true
    const load=async()=>{
      try{
        const apiSection=section
        const r=await fetch("/api/intel-data?section="+encodeURIComponent(apiSection),{cache:"no-store"})
        const j=await r.json().catch(()=>({}))
        if(!r.ok) throw new Error(j.error||"Intel data unavailable")
        if(live){setData(j);setError("")}
      }catch(e){if(live)setError(e instanceof Error?e.message:"Intel data unavailable")}
      finally{if(live)setLoading(false)}
    }
    load()
    const t=setInterval(()=>{if(document.visibilityState==='visible')load()},60000)
    return()=>{live=false;clearInterval(t)}
  },[section])

  const records=data?.records||[]
  const counts=data?.counts||{}
  const latest=unwrapPayload(records[0]?.payload ?? records[0]?.parsed_payload)
  const current=useMemo(()=>vertical.metrics.map(([label,keys])=>({label,value:valueAt(latest,keys)})).filter(x=>x.value!==null),[latest,vertical])
  const sourceCounts=useMemo(()=>{
    const m=new Map<string,number>()
    records.forEach((r:any)=>m.set(String(r.source||"unknown"),(m.get(String(r.source||"unknown"))||0)+1))
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)
  },[records])
  const recordKey=(row:any,index:number)=>String(row.id||row.capture_id||`${row.source||"record"}-${row.captured_at||index}`)
  const sourceOptions=useMemo(()=>[...new Set(records.map((r:any)=>String(r.source||"unknown")))].sort(),[records])
  const kindOptions=useMemo(()=>[...new Set(records.map((r:any)=>String(r.page_kind||section)))].sort(),[records,section])
  const visibleRecords=useMemo(()=>{
    const query=recordSearch.trim().toLowerCase()
    return records.filter((row:any)=>{
      if(sourceFilter!=="all"&&String(row.source||"unknown")!==sourceFilter)return false
      if(kindFilter!=="all"&&String(row.page_kind||section)!==kindFilter)return false
      if(!query)return true
      const searchable=[row.province_name,row.province_id,row.kingdom_id,row.source,row.page_kind,row.raw_text,JSON.stringify(row.payload||row.parsed_payload||row.raw_payload||{})].join(" ").toLowerCase()
      return searchable.includes(query)
    })
  },[records,recordSearch,sourceFilter,kindFilter,section])
  useEffect(()=>{
    if(records.length<2)return
    setCompareLeft(current=>current&&records.some((row:any,index:number)=>recordKey(row,index)===current)?current:recordKey(records[1],1))
    setCompareRight(current=>current&&records.some((row:any,index:number)=>recordKey(row,index)===current)?current:recordKey(records[0],0))
  },[records])
  const compareA=records.find((row:any,index:number)=>recordKey(row,index)===compareLeft)||null
  const compareB=records.find((row:any,index:number)=>recordKey(row,index)===compareRight)||null
  const compareRows=useMemo(()=>vertical.metrics.map(([label,keys])=>{
    const left=valueAt(unwrapPayload(compareA?.payload??compareA?.parsed_payload),keys)
    const right=valueAt(unwrapPayload(compareB?.payload??compareB?.parsed_payload),keys)
    const a=numValue(left),b=numValue(right)
    return {label,left,right,delta:a!==null&&b!==null?a-b:null}
  }).filter(row=>row.left!==null||row.right!==null),[compareA,compareB,vertical])

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

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
        {graphicFor(section, records, vertical.accent)}

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

      <section style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119",marginBottom:16}}>
        <div style={{fontSize:9,color:vertical.accent,letterSpacing:".16em"}}>HISTORICAL COMPARISON</div>
        <h2 style={{margin:"7px 0 12px",fontSize:20}}>Compare two captured records</h2>
        {records.length>1?<div style={{display:"grid",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
            {[["Earlier / baseline",compareLeft,setCompareLeft],["Later / comparison",compareRight,setCompareRight]].map(([label,value,setter]:any)=><label key={label} style={{display:"grid",gap:5,fontSize:9,color:"#8b99a8"}}>{label}<select value={value} onChange={e=>setter(e.target.value)} style={{width:"100%",padding:10,borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"#050b11",color:"#e7eef5",fontSize:11}}>
              {records.map((row:any,index:number)=><option key={recordKey(row,index)} value={recordKey(row,index)}>{row.page_kind||section} · {row.province_name||row.province_id||"Unknown"} · {row.captured_at?new Date(row.captured_at).toLocaleString():"undated"}</option>)}
            </select></label>)}
          </div>
          {compareA&&compareB&&<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead><tr>{["FIELD","BASELINE","COMPARISON","CHANGE"].map(label=><th key={label} style={{textAlign:label==="FIELD"?"left":"right",padding:"9px 8px",color:"#748394",borderBottom:"1px solid rgba(255,255,255,.08)"}}>{label}</th>)}</tr></thead>
              <tbody>{compareRows.map(row=><tr key={row.label}>
                <td style={{padding:"9px 8px",color:"#aeb9c5",borderBottom:"1px solid rgba(255,255,255,.05)"}}>{row.label}</td>
                <td style={{padding:"9px 8px",textAlign:"right",borderBottom:"1px solid rgba(255,255,255,.05)"}}>{scalar(row.left)}</td>
                <td style={{padding:"9px 8px",textAlign:"right",borderBottom:"1px solid rgba(255,255,255,.05)"}}>{scalar(row.right)}</td>
                <td style={{padding:"9px 8px",textAlign:"right",borderBottom:"1px solid rgba(255,255,255,.05)",color:row.delta===null?"#718091":row.delta>=0?"#67f0b0":"#ff8b8b"}}>{row.delta===null?"—":(row.delta>0?"+":"")+scalar(row.delta)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>:<div style={{fontSize:11,color:"#748394"}}>Two records are needed before a comparison can be made.</div>}
      </section>

      <section style={{padding:20,border:"1px solid "+vertical.accent+"22",borderRadius:12,background:"linear-gradient(135deg,#081119,#071018)",marginBottom:16}}>
        <div style={{fontSize:9,color:vertical.accent,letterSpacing:".16em"}}>INTEL DATA CONTRACT</div>
        <h2 style={{margin:"7px 0 12px",fontSize:22}}>Complete signal coverage</h2>
        <div style={{fontSize:11,color:"#83919f",marginBottom:14}}>This vertical is fed from the shared Intel records, not a separate scraper feed. Every classified record keeps its parsed payload, identity, timestamp, classification and source evidence for drill-down.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
          {Object.entries(counts).sort((a:any,b:any)=>Number(b[1])-Number(a[1])).map(([kind,n])=><div key={kind} style={{padding:11,border:"1px solid rgba(255,255,255,.06)",borderRadius:8,background:"rgba(255,255,255,.02)"}}><div style={{fontSize:8,color:"#657483",letterSpacing:".1em"}}>{kind.toUpperCase()}</div><strong style={{display:"block",fontSize:19,color:vertical.accent,marginTop:5}}>{Number(n).toLocaleString()}</strong><div style={{fontSize:8,color:"#586675",marginTop:3}}>classified records</div></div>)}
        </div>
      </section>

      <section style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap",marginBottom:10}}>
          <div><div style={{fontSize:9,color:vertical.accent,letterSpacing:".16em"}}>CAPTURED INTELLIGENCE</div><h2 style={{margin:"7px 0 4px",fontSize:22}}>Operational records</h2><div style={{fontSize:11,color:"#748190"}}>Newest first. Every record retains identity, classification and source provenance.</div></div>
          <div style={{fontSize:9,color:vertical.accent}}>AUTO-REFRESH 60s</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,margin:"14px 0 8px"}}>
          <input value={recordSearch} onChange={e=>setRecordSearch(e.target.value)} placeholder="Search province, event, source or payload…" style={{width:"100%",padding:10,borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"#050b11",color:"#e7eef5",fontSize:11}}/>
          <select value={kindFilter} onChange={e=>setKindFilter(e.target.value)} style={{padding:10,borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"#050b11",color:"#e7eef5",fontSize:11}}><option value="all">All page types</option>{kindOptions.map(kind=><option key={kind} value={kind}>{kind}</option>)}</select>
          <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} style={{padding:10,borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"#050b11",color:"#e7eef5",fontSize:11}}><option value="all">All sources</option>{sourceOptions.map(source=><option key={source} value={source}>{source}</option>)}</select>
        </div>
        <div style={{fontSize:9,color:"#718091",marginBottom:8}}>Showing {visibleRecords.length.toLocaleString()} matching records from {records.length.toLocaleString()} available.</div>
        {visibleRecords.slice(0,showAll?visibleRecords.length:40).map((row:any,i:number)=>{
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
        {!visibleRecords.length&&<div style={{padding:"45px 0",color:"#748190",textAlign:"center"}}>{records.length?"No records match these filters.":"No processed intelligence is available for this vertical yet."}</div>}
        {visibleRecords.length>40&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,255,255,.06)"}}><div style={{fontSize:9,color:"#718091"}}>{showAll?"Showing all "+visibleRecords.length.toLocaleString()+" matching records.":"Showing the latest 40 of "+visibleRecords.length.toLocaleString()+" matching records."} Full parsed payload and source evidence remain available on every record.</div><button onClick={()=>setShowAll(v=>!v)} style={{padding:"9px 12px",borderRadius:8,border:"1px solid "+vertical.accent+"55",background:vertical.accent+"12",color:vertical.accent,fontWeight:800,fontSize:9,cursor:"pointer",whiteSpace:"nowrap"}}>{showAll?"SHOW LATEST 40":"SHOW ALL INTEL"}</button></div>}
      </section>
    </section>
  </main>
}
