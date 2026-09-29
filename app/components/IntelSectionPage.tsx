"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Row = {
  id?: string
  capture_id?: string
  page_kind?: string
  source?: string
  province_id?: string
  province_name?: string
  kingdom_id?: string
  captured_at?: string
  created_at?: string
  raw_text?: string
  payload?: any
}

const NAV = [
  ["Command","/"],["Province","/command/province"],["War Room","/command/war-room"],
  ["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Wiki","/command/wiki"],["Tools","/command/tools"],["Scraper Generator","/command/scraper"]
]
const INTEL = [
  ["Intel","/command/intel"],["Kingdom","/command/kingdom"],["Military","/command/military"],
  ["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],
  ["Buildings","/command/buildings"],["Throne","/command/throne"],["News","/command/news"],["Enemy Intel","/command/enemy-intel"]
]

function scalar(v:any): string {
  if(v==null || v==="") return "—"
  if(typeof v==="number") return Number.isFinite(v)?v.toLocaleString():"—"
  if(typeof v==="boolean") return v?"Yes":"No"
  return String(v)
}
function keyName(k:string){return k.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function flatten(obj:any,prefix="",out:Array<[string,any]>=[]):Array<[string,any]>{
  if(obj==null) return out
  if(typeof obj!=="object"){out.push([prefix,obj]);return out}
  if(Array.isArray(obj)){out.push([prefix,obj.length+" items"]);return out}
  for(const [k,v] of Object.entries(obj)){
    const p=prefix?prefix+"."+k:k
    if(v && typeof v==="object" && !Array.isArray(v)) flatten(v,p,out)
    else out.push([p,v])
  }
  return out
}
function date(v:any){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
function BarChart({rows}:{rows:Row[]}){
  const series=useMemo(()=>{
    const totals=new Map<string,number>()
    for(const r of rows){
      for(const [k,v] of flatten(r.payload||{})){
        const n=typeof v==="number"?v:Number(typeof v==="string"?v.replace(/,/g,""):"")
        if(Number.isFinite(n) && Math.abs(n)>0 && Math.abs(n)<1e12){
          const leaf=k.split(".").at(-1)||k
          totals.set(leaf,(totals.get(leaf)||0)+Math.abs(n))
        }
      }
    }
    return [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)
  },[rows])
  const max=Math.max(1,...series.map(x=>x[1]))
  if(!series.length)return <div style={{padding:20,color:"#718091",fontSize:11}}>No numeric Intel fields are available for a graph yet.</div>
  return <div style={{display:"grid",gap:10}}>{series.map(([k,v])=><div key={k} style={{display:"grid",gridTemplateColumns:"120px 1fr 100px",gap:10,alignItems:"center"}}><span style={{fontSize:9,color:"#91a2b0",overflow:"hidden",textOverflow:"ellipsis"}}>{keyName(k)}</span><div style={{height:10,background:"rgba(255,255,255,.06)",borderRadius:99,overflow:"hidden"}}><div style={{width:(Math.max(2,v/max*100))+"%",height:"100%",background:"#67f0b0"}}/></div><strong style={{fontSize:9,textAlign:"right",color:"#d8ff54"}}>{scalar(v)}</strong></div>)}</div>
}
function Timeline({rows}:{rows:Row[]}){
  return <div style={{display:"grid",gap:0}}>{rows.slice(0,20).map((r,i)=><article key={String(r.id||r.capture_id||i)} style={{padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap"}}><div><strong style={{color:"#d8ff54",fontSize:11}}>{keyName(r.page_kind||"intel")}</strong><div style={{fontSize:10,color:"#91a2b0",marginTop:4}}>{r.province_name||r.province_id||"Unknown province"} · {r.kingdom_id||"Unknown KD"}</div></div><span style={{fontSize:9,color:"#718091"}}>{date(r.captured_at||r.created_at)}</span></div>
    <div style={{marginTop:9,fontSize:11,color:"#c7d1da",lineHeight:1.55,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{r.raw_text||flatten(r.payload||{}).slice(0,8).map(([k,v])=>keyName(k)+": "+scalar(v)).join(" · ")||"Classified Intel record"}</div>
  </article>)}</div>
}

export default function IntelSectionPage({section,title,kinds,description}:{section:string,title:string,kinds?:string[],description:string}){
  const router=useRouter(); const [data,setData]=useState<any>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(true); const [query,setQuery]=useState(""); const [kind,setKind]=useState("all")
  useEffect(()=>{let live=true;const load=async()=>{try{const r=await fetch("/api/intel-data?section="+encodeURIComponent(section),{cache:"no-store"});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||title+" unavailable");if(live){setData(j);setError("")}}catch(e){if(live)setError(e instanceof Error?e.message:title+" unavailable")}finally{if(live)setLoading(false)}};load();const t=setInterval(load,15000);return()=>{live=false;clearInterval(t)}},[section,title])
  const all:Row[]=data?.records||[]
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return all.filter(r=>(kind==="all"||r.page_kind===kind)&&(!q||JSON.stringify(r).toLowerCase().includes(q)))},[all,kind,query])
  const counts=useMemo(()=>{const m=new Map<string,number>();for(const r of all)m.set(r.page_kind||"intel",(m.get(r.page_kind||"intel")||0)+1);return [...m.entries()].sort((a,b)=>b[1]-a[1])},[all])
  const fields=useMemo(()=>{const m=new Map<string,{value:any,count:number}>();for(const r of filtered.slice(0,100)){for(const [k,v] of flatten(r.payload||{})){if(v==null||v==="")continue;const key=k.split(".").at(-1)||k;const x=m.get(key);if(x)x.count++;else m.set(key,{value:v,count:1})}}return [...m.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,24)},[filtered])
  return <main style={{minHeight:"100vh",background:"#05080d",color:"#e7eef5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
    <aside style={{width:250,flexShrink:0,background:"#071018",borderRight:"1px solid rgba(255,255,255,.08)",padding:24,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
      <div style={{fontWeight:900,letterSpacing:".18em",color:"#d8ff54"}}>SPARTAN</div><div style={{fontSize:9,color:"#718091",letterSpacing:".16em",marginTop:5}}>UTOPIA COMMAND</div>
      <div style={{margin:"30px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>COMMAND SYSTEMS</div>
      {NAV.map(([n,p])=><button key={n} onClick={()=>router.push(p)} style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:3,border:0,borderRadius:8,background:"transparent",color:"#aeb9c5",fontWeight:700,fontSize:11,cursor:"pointer"}}>{n}</button>)}
      <div style={{margin:"22px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>INTEL DATA</div>
      {INTEL.map(([n,p])=><button key={n} onClick={()=>router.push(p)} style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",marginBottom:3,border:0,borderRadius:8,background:n===title||n.toLowerCase()===title.toLowerCase()? "rgba(216,255,84,.08)":"transparent",color:n===title||n.toLowerCase()===title.toLowerCase()?"#d8ff54":"#aeb9c5",fontWeight:700,fontSize:11,cursor:"pointer"}}>{n}</button>)}
      <div style={{marginTop:25,padding:12,border:"1px solid rgba(103,240,176,.18)",borderRadius:9,color:"#67f0b0",fontSize:9}}>● INTEL CORE ONLINE<br/><span style={{color:"#718091"}}>15s live refresh · canonical classified records</span></div>
    </aside>
    <section style={{flex:1,padding:"30px 34px",maxWidth:1600,overflowX:"hidden"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:24}}><div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".2em"}}>SPARTAN // {title.toUpperCase()} INTELLIGENCE</div><h1 style={{fontSize:38,margin:"7px 0 4px",letterSpacing:"-.04em"}}>{title}</h1><div style={{fontSize:12,color:"#83919f",maxWidth:850}}>{description}</div></div><button onClick={()=>router.push("/")} style={{padding:"11px 16px",borderRadius:9,border:"1px solid #d8ff54",background:"#101c23",color:"#d8ff54",fontWeight:900,fontSize:10,cursor:"pointer"}}>← COMMAND CENTER</button></header>
      {error&&<div style={{padding:14,marginBottom:18,border:"1px solid rgba(255,100,100,.3)",background:"rgba(255,60,60,.06)",borderRadius:10,color:"#ff9b9b"}}>{error}</div>}
      <section style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:18}}>
        {[["CAPTURED INTEL",filtered.length],["PROVINCES",new Set(filtered.map(r=>r.province_id||r.province_name).filter(Boolean)).size],["KINGDOMS",new Set(filtered.map(r=>r.kingdom_id).filter(Boolean)).size],["KINDS",counts.length]].map(([l,v])=><article key={String(l)} style={{padding:16,border:"1px solid rgba(255,255,255,.08)",borderRadius:10,background:"#081119"}}><div style={{fontSize:8,color:"#687686",letterSpacing:".12em"}}>{l}</div><strong style={{display:"block",fontSize:24,marginTop:7,color:l==="CAPTURED INTEL"?"#d8ff54":"#e7eef5"}}>{Number(v).toLocaleString()}</strong></article>)}
      </section>
      <section style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:16,marginBottom:16}}>
        <article style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>ACTUAL NUMERIC INTEL</div><h2 style={{margin:"7px 0 18px",fontSize:21}}>Captured intelligence profile</h2><BarChart rows={filtered}/></article>
        <article style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>CLASSIFICATION</div><h2 style={{margin:"7px 0 15px",fontSize:21}}>Intel types</h2>{counts.map(([k,v])=><button key={k} onClick={()=>setKind(kind===k?"all":k)} style={{display:"flex",justifyContent:"space-between",width:"100%",padding:"9px 0",border:0,borderBottom:"1px solid rgba(255,255,255,.05)",background:"transparent",color:kind===k?"#d8ff54":"#b8c4ce",cursor:"pointer",fontSize:10,textAlign:"left"}}><span>{keyName(k)}</span><strong>{v}</strong></button>)}</article>
      </section>
      <section style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>CURRENT INTELLIGENCE</div><h2 style={{margin:"7px 0 3px",fontSize:22}}>Fields actually present in the captured data</h2></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search captured Intel…" style={{background:"#05080d",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"10px 12px",color:"#e7eef5",minWidth:230}}/></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginTop:15}}>{fields.map(([k,x])=><div key={k} style={{padding:10,border:"1px solid rgba(255,255,255,.06)",borderRadius:7}}><div style={{fontSize:8,color:"#687686",textTransform:"uppercase"}}>{keyName(k)}</div><strong style={{display:"block",fontSize:12,marginTop:4,overflowWrap:"anywhere"}}>{scalar(x.value)}</strong><span style={{fontSize:8,color:"#718091"}}>present in {x.count} records</span></div>)}</div>
      </section>
      <section style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>EVIDENCE / EVENT STREAM</div><h2 style={{margin:"7px 0 15px",fontSize:22}}>Latest classified intelligence</h2><Timeline rows={filtered}/></section>
    </section>
  </main>
}
