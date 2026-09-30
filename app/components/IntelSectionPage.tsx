"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Row = {
  id?: string; capture_id?: string; page_kind?: string; source?: string
  province_id?: string; province_name?: string; kingdom_id?: string
  target_province_id?: string; target_kingdom_id?: string
  captured_at?: string; created_at?: string; raw_text?: string; payload?: any
  visibility?: string; metrics?: Record<string, any>
}

const NAV = [
  ["Command","/"],["Province","/command/province"],["War Room","/command/war-room"],
  ["Build Lab","/command/build-lab"],["Calcs","/command/calcs"],["Wiki","/command/wiki"],["Tools","/command/tools"],["Scraper Generator","/command/scraper"]
]
const INTEL = [
  ["Intel","/command/intel"],["Kingdom","/command/kingdom"],["Military","/command/military"],
  ["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],
  ["Buildings","/command/buildings"],["Throne","/command/throne"],["News","/command/news"],
  ["Aid & Logistics","/command/aid"],["Exploration","/command/exploration"],["Enemy Intel","/command/enemy-intel"]
]

function scalar(v:any): string {
  if(v==null || v==="") return "—"
  if(typeof v==="number") return Number.isFinite(v)?v.toLocaleString():"—"
  if(typeof v==="boolean") return v?"Yes":"No"
  return String(v)
}
function keyName(k:string){return k.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function flatten(obj:any,prefix="",out:Array<[string,any]>=[]):Array<[string,any]>{
  if(obj==null)return out
  if(typeof obj!=="object"){out.push([prefix,obj]);return out}
  if(Array.isArray(obj)){out.push([prefix,obj.length+" items"]);return out}
  for(const [k,v] of Object.entries(obj)){const p=prefix?prefix+"."+k:k;if(v&&typeof v==="object"&&!Array.isArray(v))flatten(v,p,out);else out.push([p,v])}
  return out
}
function textOf(r:Row){const p=r.payload?.data?.content||r.payload?.content||r.raw_text||"";return String(p)}
function num(t:string,re:RegExp){const m=t.match(re);return m?Number(String(m[1]).replace(/,/g,"")):null}
function metricRows(rows:Row[]){
  const defs=[
    ["Acres",/([\d,]+) acres/i],["Offense",/([\d,]+) off(?:ense)?/i],["Defense",/([\d,]+) def(?:ense)?/i],
    ["Kills",/killed (?:about )?([\d,]+) enemy troops/i],["Losses",/lost ([\d,]+) /i],["Prisoners",/imprisoned ([\d,]+)/i],
    ["Runes",/gather ([\d,]+) runes/i],["Mana",/mana (\d+)%/i],["Thieves",/([\d,]+) thieves/i],
    ["Wizards",/([\d,]+) wizards/i],["Books",/([\d,]+) books/i],["Networth",/NW[ :]+([\d,]+)/i]
  ]
  const out:{label:string,value:number}[]=[]
  for(const [label,re] of defs){let total=0,seen=0;for(const r of rows){const n=num(textOf(r),re);if(n!=null){total+=n;seen++}}if(seen)out.push({label,value:total})}
  return out.sort((a,b)=>b.value-a.value).slice(0,8)
}
function Sparkline({rows}:{rows:Row[]}){
  const points=rows.slice(0,18).reverse().map((r,i)=>{const t=textOf(r);const n=num(t,/([\d,]+) acres/i)??num(t,/([\d,]+) runes/i)??num(t,/([\d,]+) def/i)??i;return n})
  if(points.length<2)return <div style={{height:100,display:"grid",placeItems:"center",color:"#657483",fontSize:10}}>Waiting for enough numeric history for a trend.</div>
  const min=Math.min(...points),max=Math.max(...points),range=Math.max(1,max-min)
  const pts=points.map((v,i)=>{const x=4+i*92/Math.max(1,points.length-1);const y=92-((v-min)/range)*78;return `${x},${y}`}).join(" ")
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:110,display:"block"}}><polyline points={pts} fill="none" stroke="#d8ff54" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/><polyline points={`4,94 ${pts} 96,94`} fill="rgba(216,255,84,.06)" stroke="none"/></svg>
}
function MetricBars({rows}:{rows:Row[]}){
  const metrics=metricRows(rows), max=Math.max(1,...metrics.map(x=>x.value))
  if(!metrics.length)return <div style={{padding:"25px 0",color:"#657483",fontSize:10}}>No numeric fields have been captured for this section yet.</div>
  return <div style={{display:"grid",gap:10}}>{metrics.map(m=><div key={m.label} style={{display:"grid",gridTemplateColumns:"90px 1fr 82px",gap:9,alignItems:"center"}}><span style={{fontSize:9,color:"#93a1ae"}}>{m.label}</span><div style={{height:9,background:"rgba(255,255,255,.055)",borderRadius:99,overflow:"hidden"}}><div style={{width:`${Math.max(3,m.value/max*100)}%`,height:"100%",background:"linear-gradient(90deg,#67f0b0,#d8ff54)",borderRadius:99}}/></div><strong style={{fontSize:9,textAlign:"right",color:"#d8ff54"}}>{scalar(m.value)}</strong></div>)}</div>
}

export default function IntelSectionPage({section,title,description}:{section:string,title:string,kinds?:string[],description:string}){
  const router=useRouter();const [data,setData]=useState<any>(null);const [error,setError]=useState("");const [query,setQuery]=useState("");const [kind,setKind]=useState("all");const [loading,setLoading]=useState(true)
  useEffect(()=>{let live=true;const load=async()=>{try{const r=await fetch("/api/intel-data?section="+encodeURIComponent(section),{cache:"no-store"});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||title+" unavailable");if(live){setData(j);setError("")}}catch(e){if(live)setError(e instanceof Error?e.message:title+" unavailable")}finally{if(live)setLoading(false)}};load();const t=setInterval(load,15000);return()=>{live=false;clearInterval(t)}},[section,title])
  const all:Row[]=data?.records||[]
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return all.filter(r=>(kind==="all"||r.page_kind===kind)&&(!q||JSON.stringify(r).toLowerCase().includes(q)))},[all,kind,query])
  const counts=useMemo(()=>{const m=new Map<string,number>();for(const r of all)m.set(r.page_kind||"intel",(m.get(r.page_kind||"intel")||0)+1);return [...m.entries()].sort((a,b)=>b[1]-a[1])},[all])
  const own=filtered.filter(r=>r.visibility!=="enemy").length, enemy=filtered.filter(r=>r.visibility==="enemy").length
  const provinces=new Set(filtered.map(r=>r.target_province_id||r.province_id).filter(Boolean)).size
  const kingdoms=new Set(filtered.map(r=>r.target_kingdom_id||r.kingdom_id).filter(Boolean)).size
  return <main style={{minHeight:"100vh",background:"#05080d",color:"#e7eef5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
    <aside style={{width:248,flexShrink:0,background:"#071018",borderRight:"1px solid rgba(255,255,255,.08)",padding:22,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
      <div style={{fontWeight:950,letterSpacing:".2em",color:"#d8ff54",fontSize:15}}>SPARTAN</div><div style={{fontSize:9,color:"#718091",letterSpacing:".18em",marginTop:5}}>UTOPIA COMMAND</div>
      <div style={{margin:"27px 0 9px",fontSize:8,color:"#5f6c7a",letterSpacing:".2em"}}>COMMAND SYSTEMS</div>
      {NAV.map(([n,p])=><button key={n} onClick={()=>router.push(p)} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 11px",marginBottom:2,border:0,borderRadius:8,background:"transparent",color:"#aeb9c5",fontWeight:700,fontSize:10,cursor:"pointer"}}>{n}</button>)}
      <div style={{margin:"20px 0 9px",fontSize:8,color:"#5f6c7a",letterSpacing:".2em"}}>INTEL DATA</div>
      {INTEL.map(([n,p])=><button key={n} onClick={()=>router.push(p)} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 11px",marginBottom:2,border:n===title?"1px solid rgba(216,255,84,.18)":"1px solid transparent",borderRadius:8,background:n===title?"rgba(216,255,84,.07)":"transparent",color:n===title?"#d8ff54":"#aeb9c5",fontWeight:n===title?900:700,fontSize:10,cursor:"pointer"}}>{n}</button>)}
      <div style={{marginTop:20,padding:11,border:"1px solid rgba(103,240,176,.18)",borderRadius:9,color:"#67f0b0",fontSize:8}}>● LIVE INTEL CORE<br/><span style={{color:"#718091"}}>15s refresh · canonical records</span></div>
    </aside>
    <section style={{flex:1,padding:"30px 34px 60px",maxWidth:1650,overflowX:"hidden"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:22}}>
        <div><div style={{fontSize:8,color:"#67f0b0",letterSpacing:".22em"}}>SPARTAN // CLASSIFIED DATA LAYER</div><h1 style={{fontSize:40,margin:"7px 0 4px",letterSpacing:"-.045em"}}>{title}</h1><div style={{fontSize:12,color:"#82909e",maxWidth:900}}>{description}</div></div>
        <button onClick={()=>router.push("/")} style={{padding:"10px 15px",borderRadius:9,border:"1px solid #d8ff54",background:"#101c23",color:"#d8ff54",fontWeight:900,fontSize:9,cursor:"pointer"}}>← COMMAND CENTER</button>
      </header>
      {error&&<div style={{padding:14,marginBottom:15,border:"1px solid rgba(255,100,100,.3)",background:"rgba(255,60,60,.06)",borderRadius:10,color:"#ff9b9b"}}>{error}</div>}
      <section style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(120px,1fr))",gap:9,marginBottom:14}}>
        {[[title.toUpperCase(),filtered.length],["PROVINCES",provinces],["KINGDOMS",kingdoms],["OWN",own],["ENEMY",enemy],["KINDS",counts.length]].map(([l,v])=><article key={String(l)} style={{padding:14,border:"1px solid rgba(255,255,255,.075)",borderRadius:10,background:"linear-gradient(145deg,#0a141d,#071018)"}}><div style={{fontSize:7,color:"#687686",letterSpacing:".14em"}}>{l}</div><strong style={{display:"block",fontSize:22,marginTop:6,color:l==="ENEMY"?"#ffbd66":"#d8ff54"}}>{Number(v).toLocaleString()}</strong></article>)}
      </section>
      <section style={{display:"grid",gridTemplateColumns:"1.3fr .9fr .8fr",gap:12,marginBottom:12}}>
        <article style={{padding:18,border:"1px solid rgba(255,255,255,.075)",borderRadius:12,background:"#081119"}}>
          <div style={{fontSize:8,color:"#67f0b0",letterSpacing:".17em"}}>LIVE TREND</div><h2 style={{fontSize:19,margin:"6px 0 12px"}}>Signal over capture history</h2><Sparkline rows={filtered}/><div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#657483"}}><span>OLDEST</span><span>NEWEST</span></div>
        </article>
        <article style={{padding:18,border:"1px solid rgba(255,255,255,.075)",borderRadius:12,background:"#081119"}}><div style={{fontSize:8,color:"#67f0b0",letterSpacing:".17em"}}>MEASURED DATA</div><h2 style={{fontSize:19,margin:"6px 0 15px"}}>Signal profile</h2><MetricBars rows={filtered}/></article>
        <article style={{padding:18,border:"1px solid rgba(255,255,255,.075)",borderRadius:12,background:"#081119"}}><div style={{fontSize:8,color:"#67f0b0",letterSpacing:".17em"}}>CLASSIFICATION</div><h2 style={{fontSize:19,margin:"6px 0 12px"}}>Intel types</h2>{counts.map(([k,v])=><button key={k} onClick={()=>setKind(kind===k?"all":k)} style={{display:"flex",justifyContent:"space-between",width:"100%",padding:"8px 0",border:0,borderBottom:"1px solid rgba(255,255,255,.05)",background:"transparent",color:kind===k?"#d8ff54":"#aeb9c5",cursor:"pointer",fontSize:9,textAlign:"left"}}><span>{keyName(k)}</span><strong>{v}</strong></button>)}</article>
      </section>
      <section style={{padding:18,border:"1px solid rgba(255,255,255,.075)",borderRadius:12,background:"#081119",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:8,color:"#67f0b0",letterSpacing:".17em"}}>CANONICAL EVIDENCE</div><h2 style={{margin:"6px 0 2px",fontSize:21}}>Data actually captured from Utopia</h2></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Intel…" style={{background:"#05080d",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"9px 11px",color:"#e7eef5",minWidth:220}}/></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:7,marginTop:14}}>{useMemo(()=>{const m=new Map<string,{value:any,count:number}>();for(const r of filtered.slice(0,120)){for(const [k,v] of flatten(r.payload?.data||r.payload||{})){if(v==null||v==="")continue;const leaf=k.split(".").at(-1)||k;const x=m.get(leaf);if(x)x.count++;else m.set(leaf,{value:v,count:1})}}return [...m.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,20)},[filtered]).map(([k,x])=><div key={k} style={{padding:10,border:"1px solid rgba(255,255,255,.055)",borderRadius:8,background:"rgba(255,255,255,.012)"}}><div style={{fontSize:7,color:"#687686",textTransform:"uppercase"}}>{keyName(k)}</div><strong style={{display:"block",fontSize:11,marginTop:4,overflowWrap:"anywhere"}}>{scalar(x.value)}</strong><span style={{fontSize:7,color:"#718091"}}>{x.count} records</span></div>)}</div>
      </section>
      <section style={{padding:18,border:"1px solid rgba(255,255,255,.075)",borderRadius:12,background:"#081119"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div><div style={{fontSize:8,color:"#67f0b0",letterSpacing:".17em"}}>EVENT STREAM</div><h2 style={{margin:"6px 0 2px",fontSize:21}}>Latest classified intelligence</h2></div><span style={{fontSize:8,color:"#67f0b0"}}>{loading?"SYNCING…":"LIVE · 15s"}</span></div>
        {filtered.slice(0,30).map((r,i)=><article key={String(r.id||r.capture_id||i)} style={{padding:"13px 0",borderTop:"1px solid rgba(255,255,255,.06)",display:"grid",gridTemplateColumns:"120px 1fr 90px",gap:14}}>
          <div><strong style={{fontSize:9,color:"#d8ff54"}}>{keyName(r.page_kind||"intel")}</strong><div style={{fontSize:7,color:r.visibility==="enemy"?"#ffbd66":"#67f0b0",marginTop:4}}>{r.visibility==="enemy"?"ENEMY":"OWN"} · {r.target_kingdom_id||r.kingdom_id||"—"}</div></div>
          <div><div style={{fontSize:10,color:"#d7e0e7",lineHeight:1.5,overflowWrap:"anywhere"}}>{textOf(r)||flatten(r.payload||{}).slice(0,7).map(([k,v])=>keyName(k)+": "+scalar(v)).join(" · ")||"Classified record"}</div><div style={{fontSize:7,color:"#5f6c7a",marginTop:5}}>Target: {r.target_province_id||"—"} · Source: {r.source||"—"}</div></div>
          <time style={{fontSize:7,color:"#718091",textAlign:"right"}}>{r.captured_at?new Date(r.captured_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"}</time>
        </article>)}
        {!filtered.length&&<div style={{padding:"45px 0",textAlign:"center",color:"#657483",fontSize:11}}>No classified records yet. The page is ready for the next capture.</div>}
      </section>
    </section>
  </main>
}
