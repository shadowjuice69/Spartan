"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

function prettyKey(key:string){ return key.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()) }
function scalar(v:any){ if(v==null) return "—"; if(typeof v==='number') return v.toLocaleString(); if(typeof v==='boolean') return v?'Yes':'No'; return String(v) }
function Value({value,depth=0}:{value:any,depth?:number}){
  if(value==null) return <span style={{color:"#718091"}}>—</span>
  if(typeof value!=='object') return <span style={{overflowWrap:"anywhere"}}>{scalar(value)}</span>
  if(Array.isArray(value)) return <div style={{display:"grid",gap:6,marginTop:5}}>{value.map((v,i)=><div key={i} style={{padding:"8px 10px",background:"rgba(255,255,255,.025)",borderRadius:6}}><span style={{fontSize:9,color:"#657483"}}>ITEM {i+1}</span><Value value={v} depth={depth+1}/></div>)}</div>
  return <div style={{display:"grid",gap:6,marginTop:depth?5:0}}>{Object.entries(value).map(([k,v])=><div key={k} style={{padding:"8px 10px",background:"rgba(255,255,255,.025)",borderRadius:6}}><div style={{fontSize:8,color:"#647382",textTransform:"uppercase",letterSpacing:".08em"}}>{prettyKey(k)}</div><div style={{fontSize:11,color:"#dce7ee",marginTop:3}}><Value value={v} depth={depth+1}/></div></div>)}</div>
}

export default function EnemyIntel(){
  const router=useRouter()
  const [data,setData]=useState<any>(null)
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(true)
  const [selected,setSelected]=useState<string|null>(null)

  useEffect(()=>{ let live=true; const load=async()=>{ try{ const r=await fetch("/api/enemy-intel",{cache:"no-store"}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||"Enemy Intel unavailable"); if(live){setData(j);setError("")} }catch(e){if(live)setError(e instanceof Error?e.message:"Enemy Intel unavailable")}finally{if(live)setLoading(false)} }; load(); const t=setInterval(load,15000); return()=>{live=false;clearInterval(t)} },[])

  const provinces=data?.provinces||[]
  const records=data?.records||[]
  const visible=useMemo(()=>selected?records.filter((r:any)=>String(r.province_id||"unknown")===selected):records,[records,selected])

  return <main style={{minHeight:"100vh",background:"#05080d",color:"#e7eef5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
    <aside style={{width:250,borderRight:"1px solid rgba(255,255,255,.08)",padding:24,background:"#071018",position:"sticky",top:0,height:"100vh"}}>
      <div style={{fontWeight:900,letterSpacing:".18em",color:"#d8ff54",fontSize:15}}>SPARTAN</div>
      <div style={{fontSize:10,color:"#718091",letterSpacing:".16em",marginTop:5}}>UTOPIA INTELLIGENCE</div>
      <div style={{margin:"30px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>INTEL DATA</div>
      {["Kingdom","Military","Magic","Thievery","Science","Buildings","Throne"].map(item=><button key={item} onClick={()=>router.push("/command/"+item.toLowerCase())} style={{width:"100%",textAlign:"left",padding:"11px 12px",marginBottom:4,border:"1px solid transparent",borderRadius:8,background:"transparent",color:"#aeb9c5",cursor:"pointer",fontWeight:700,fontSize:11}}>{item}</button>)}
      <button onClick={()=>router.push("/command/enemy-intel")} style={{width:"100%",textAlign:"left",padding:"11px 12px",marginBottom:4,border:"1px solid #d8ff54",borderRadius:8,background:"rgba(216,255,84,.08)",color:"#d8ff54",cursor:"pointer",fontWeight:900,fontSize:11}}>Enemy Intel</button>
      <div style={{marginTop:28,padding:12,border:"1px solid rgba(103,240,176,.18)",borderRadius:10,fontSize:9,color:"#67f0b0"}}>● SHARED INTEL CORE ONLINE<br/><span style={{color:"#718091"}}>Enemy visibility follows target KD</span></div>
    </aside>

    <section style={{flex:1,padding:"28px 34px",maxWidth:1500,overflowX:"hidden",position:"relative"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div><div style={{fontSize:9,color:"#ffbd66",letterSpacing:".2em"}}>SPARTAN // SHARED INTELLIGENCE</div><h1 style={{fontSize:34,margin:"7px 0 0"}}>ENEMY INTEL</h1><div style={{fontSize:12,color:"#778493",marginTop:5}}>Your province {data?.ownProvince||"—"} · KD {data?.ownKingdom||"—"} · auto-refresh 15s</div></div>
        <button onClick={()=>router.push("/")} style={{position:"fixed",top:16,right:18,zIndex:1000,background:"#101c23",border:"1px solid #d8ff54",color:"#d8ff54",padding:"11px 16px",borderRadius:9,fontWeight:900,fontSize:10,letterSpacing:".08em",cursor:"pointer"}}>← RETURN TO COMMAND CENTER</button>
      </header>
      <JeevesSummary compact />

      {loading&&!data&&!error&&<div style={{padding:18,marginBottom:18,border:"1px solid rgba(103,240,176,.18)",background:"rgba(103,240,176,.04)",borderRadius:10,color:"#67f0b0"}}>LOADING SHARED ENEMY INTELLIGENCE…</div>}
      {error&&<div style={{padding:14,marginBottom:18,border:"1px solid rgba(255,100,100,.3)",background:"rgba(255,60,60,.06)",borderRadius:10,color:"#ff9b9b"}}>{error}</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
        <div style={{padding:17,border:"1px solid rgba(255,189,102,.25)",borderRadius:10,background:"#081119"}}><div style={{fontSize:9,color:"#687686",letterSpacing:".14em"}}>ENEMY RECORDS</div><strong style={{fontSize:25,display:"block",marginTop:7,color:"#ffbd66"}}>{records.length.toLocaleString()}</strong></div>
        <div style={{padding:17,border:"1px solid rgba(255,255,255,.08)",borderRadius:10,background:"#081119"}}><div style={{fontSize:9,color:"#687686",letterSpacing:".14em"}}>ENEMY PROVINCES</div><strong style={{fontSize:25,display:"block",marginTop:7}}>{provinces.length.toLocaleString()}</strong></div>
      </div>

      <section style={{display:"grid",gridTemplateColumns:"minmax(260px,360px) 1fr",gap:16,alignItems:"start"}}>
        <div style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
          <div style={{fontSize:9,color:"#ffbd66",letterSpacing:".16em"}}>TARGET PROVINCES</div>
          <h2 style={{margin:"7px 0 16px",fontSize:20}}>Enemy profiles</h2>
          <button onClick={()=>setSelected(null)} style={{width:"100%",textAlign:"left",padding:11,marginBottom:6,border:"1px solid rgba(216,255,84,.25)",borderRadius:8,background:selected===null?"rgba(216,255,84,.08)":"transparent",color:"#dce7ee",cursor:"pointer"}}>ALL ENEMY INTEL <span style={{float:"right"}}>{records.length}</span></button>
          {provinces.map((p:any)=><button key={String(p.province_id||"unknown")} onClick={()=>setSelected(String(p.province_id||"unknown"))} style={{width:"100%",textAlign:"left",padding:12,marginBottom:5,border:"1px solid rgba(255,255,255,.06)",borderRadius:8,background:selected===String(p.province_id||"unknown")?"rgba(255,189,102,.08)":"transparent",color:"#dce7ee",cursor:"pointer"}}>
            <strong style={{display:"block"}}>{p.province_id||"Unknown Province"}</strong><span style={{fontSize:10,color:"#ffbd66"}}>KD {p.kingdom_id||"Unknown"} · {p.records} records</span><span style={{display:"block",fontSize:9,color:"#718091",marginTop:4}}>Latest {p.latest?new Date(p.latest).toLocaleString():"—"}</span>
          </button>)}
          {!provinces.length&&<div style={{padding:"24px 5px",color:"#718091",fontSize:11,textAlign:"center"}}>No enemy Intel has been classified yet.</div>}
        </div>

        <div style={{padding:20,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
          <div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>SHARED CAPTURED EVIDENCE</div>
          <h2 style={{margin:"7px 0 5px",fontSize:22}}>{selected?"Province Intel":"All Enemy Intel"}</h2>
          <div style={{fontSize:11,color:"#748190",marginBottom:18}}>Intel is shared across Spartan. The page is determined by the target province's KD, not the user who captured it.</div>
          {visible.map((row:any,i:number)=><article key={row.id||row.capture_id||i} style={{padding:"18px 0",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:15,marginBottom:12,flexWrap:"wrap"}}><div><strong style={{fontSize:13,textTransform:"uppercase",color:"#ffbd66"}}>{row.page_kind||"intel"}</strong><div style={{fontSize:11,color:"#b7c3ce",marginTop:5}}>Province {row.province_id||"—"} · Kingdom {row.kingdom_id||"Unknown"}</div></div><div style={{textAlign:"right",fontSize:10,color:"#748190"}}>{row.captured_at?new Date(row.captured_at).toLocaleString():row.created_at?new Date(row.created_at).toLocaleString():"—"}<div style={{marginTop:3}}>Captured by shared Spartan core · {row.source||"—"}</div></div></div>
            <Value value={row.payload}/>
            <details style={{marginTop:12}}><summary style={{cursor:"pointer",color:"#67f0b0",fontSize:10,letterSpacing:".08em"}}>SHOW RAW CAPTURE / SOURCE EVIDENCE</summary><div style={{marginTop:10,padding:12,background:"#05080d",borderRadius:8,overflowX:"auto",fontSize:10,lineHeight:1.5,color:"#9eabb8",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{typeof row.raw_payload==='string'?row.raw_payload:JSON.stringify(row.raw_payload,null,2)}</div></details>
            {row.url&&<div style={{marginTop:10,fontSize:9,color:"#657483",overflowWrap:"anywhere"}}>SOURCE URL · {row.url}</div>}
          </article>)}
          {!visible.length&&<div style={{padding:"45px 0",color:"#748190",textAlign:"center"}}>No enemy Intel records available yet.</div>}
        </div>
      </section>
    </section>
  </main>
}
