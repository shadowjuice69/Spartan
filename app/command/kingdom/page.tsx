"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import CanonicalIntelStrip from "@/app/components/CanonicalIntelStrip"

type Member = {
  slot:number; name:string; race:string; land:number; nw:number; nwpa:number; nobility:string; gains:number
  deltaLand:number|null; deltaNw:number|null; deltaNwpa:number|null; deltaGains:number|null
}
type Trend = {capturedAt:string; totalLand:number; totalNw:number; avgNwpa:number|null; totalGains:number; provinceCount:number}

const navCommand=[["Command","/"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Wiki","/command/wiki"],["Tools","/command/tools"],["Scraper Generator","/command/scraper"]]
const navIntel=[["Intel","/command/intel"],["Kingdom","/command/kingdom"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"],["Enemy Intel","/command/enemy-intel"]]

const fmt=(v:any)=>v==null?"—":Number(v).toLocaleString()
const signed=(v:any)=>v==null?"—":`${Number(v)>0?"+":""}${Number(v).toLocaleString()}`
const dateTime=(v:string)=>new Date(v).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})
const tone=(v:number|null)=>v==null?"#718091":v>0?"#67f0b0":v<0?"#ff7b72":"#718091"

function Sparkline({values}:{values:number[]}){
  if(values.length<2) return <div style={{height:80,display:"grid",placeItems:"center",color:"#5e6c79",fontSize:10}}>Need 2+ kingdom captures for a trend</div>
  const min=Math.min(...values), max=Math.max(...values), span=max-min||1
  const points=values.map((v,i)=>`${(i/(values.length-1))*100},${72-((v-min)/span)*60}`).join(" ")
  return <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{width:"100%",height:80,display:"block"}}>
    <polyline points={points} fill="none" stroke="#d8ff54" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
  </svg>
}

function Delta({value}:{value:number|null}){return <span style={{color:tone(value),fontWeight:800,fontSize:10}}>{value==null?"—":value===0?"•":value>0?"▲ "+signed(value):"▼ "+signed(value)}</span>}

export default function KingdomPage(){
  const router=useRouter()
  const [data,setData]=useState<any>(null)
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(true)
  const [query,setQuery]=useState("")
  const [sort,setSort]=useState<keyof Member>("slot")
  const [selected,setSelected]=useState<number|null>(null)

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      try{
        const r=await fetch("/api/kingdom-data",{cache:"no-store"})
        const j=await r.json()
        if(!r.ok) throw new Error(j.error||"Kingdom data unavailable")
        if(alive){setData(j);setError("")}
      }catch(e){if(alive)setError(e instanceof Error?e.message:"Kingdom data unavailable")}
      finally{if(alive)setLoading(false)}
    }
    load()
    const t=setInterval(load,15000)
    return()=>{alive=false;clearInterval(t)}
  },[])

  const members:Member[]=data?.latest?.members||[]
  const trend:Trend[]=data?.trend||[]
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return [...members].filter(p=>!q||p.name.toLowerCase().includes(q)||p.race.toLowerCase().includes(q)||String(p.slot)===q)
      .sort((a:any,b:any)=>sort==="name"?a.name.localeCompare(b.name):Number(b[sort]??0)-Number(a[sort]??0))
  },[members,query,sort])
  const selectedMember=members.find(p=>p.slot===selected)||null
  const selectedHistory=data?.memberHistory?.[String(selectedMember?.slot)]||[]
  const landSeries=trend.map(x=>x.totalLand)
  const nwSeries=trend.map(x=>x.totalNw)
  const first=trend[0]
  const lastTrend=trend[trend.length-1]
  const totalLandDelta=first&&lastTrend?lastTrend.totalLand-first.totalLand:null
  const totalNwDelta=first&&lastTrend?lastTrend.totalNw-first.totalNw:null
  const last=data?.latest

  return <main style={{minHeight:"100vh",background:"#05080d",color:"#e7eef5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}}>
    <aside style={{width:245,flexShrink:0,minHeight:"100vh",background:"#071018",borderRight:"1px solid rgba(255,255,255,.08)",padding:24,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
      <div style={{fontWeight:900,letterSpacing:".18em",color:"#d8ff54"}}>SPARTAN</div>
      <div style={{fontSize:9,color:"#718091",letterSpacing:".16em",marginTop:5}}>UTOPIA COMMAND</div>
      <div style={{margin:"30px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>COMMAND SYSTEMS</div>
      {navCommand.map(([name,path])=><button key={name} onClick={()=>router.push(path)} style={{display:"block",width:"100%",textAlign:"left",padding:"11px 12px",marginBottom:4,border:0,borderRadius:8,background:"transparent",color:"#aeb9c5",fontWeight:700,fontSize:11,cursor:"pointer"}}>{name}</button>)}
      <div style={{margin:"22px 0 10px",fontSize:9,color:"#5f6c7a",letterSpacing:".18em"}}>INTEL DATA</div>
      {navIntel.map(([name,path])=><button key={name} onClick={()=>router.push(path)} style={{display:"block",width:"100%",textAlign:"left",padding:"11px 12px",marginBottom:4,border:0,borderRadius:8,background:name==="Kingdom"?"rgba(216,255,84,.08)":"transparent",color:name==="Kingdom"?"#d8ff54":"#aeb9c5",fontWeight:700,fontSize:11,cursor:"pointer"}}>{name}</button>)}
      <div style={{marginTop:25,padding:12,border:"1px solid rgba(103,240,176,.18)",borderRadius:9,color:"#67f0b0",fontSize:9}}>● KINGDOM FEED ONLINE<br/><span style={{color:"#718091"}}>Live scrape projection · 15s refresh</span></div>
    </aside>

    <section style={{flex:1,padding:"28px 34px 50px",maxWidth:1600,overflowX:"hidden"}}>
      <header style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:9,color:"#67f0b0",letterSpacing:".2em"}}>SPARTAN // KINGDOM INTELLIGENCE</div>
          <h1 style={{fontSize:38,margin:"7px 0 3px",letterSpacing:"-.04em"}}>{data?.kingdom?.name||"KINGDOM"}</h1>
          <div style={{fontSize:12,color:"#83919f"}}>{data?.kingdom?.code||"—"} · {last?.totalProvinces||0} kingdom mates · {last?.capturedAt ? ("last scrape " + dateTime(last.capturedAt)) : "waiting for first Kingdom scrape"}</div>
        </div>
        <button onClick={()=>router.push("/")} style={{padding:"11px 16px",borderRadius:9,border:"1px solid #d8ff54",background:"#101c23",color:"#d8ff54",fontWeight:900,fontSize:10,letterSpacing:".08em",cursor:"pointer"}}>← RETURN TO COMMAND CENTER</button>
      </header>

      {error&&<div style={{padding:14,marginBottom:18,border:"1px solid rgba(255,100,100,.3)",background:"rgba(255,60,60,.06)",borderRadius:10,color:"#ff9b9b"}}>{error}</div>}
      {loading&&!data&&<div style={{padding:20,border:"1px solid rgba(103,240,176,.18)",background:"#081119",borderRadius:12,color:"#67f0b0"}}>CONNECTING TO KINGDOM DATA CORE…</div>}

      {!loading&&!last&&<section style={{padding:30,border:"1px solid rgba(216,255,84,.2)",background:"#081119",borderRadius:14}}>
        <div style={{fontSize:9,color:"#d8ff54",letterSpacing:".16em"}}>KINGDOM FEED READY</div>
        <h2 style={{margin:"9px 0 8px",fontSize:24}}>Scrape the Kingdom page once.</h2>
        <p style={{color:"#82909e",fontSize:13,lineHeight:1.6,maxWidth:720,margin:0}}>Spartan is wired to store the full Kingdom snapshot, normalize every province, and build the historical trend from each subsequent scrape. Once the scraper sends the Kingdom page, the roster and graphs populate automatically.</p>
      </section>}

      {last&&<div>
        <section style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:10,marginBottom:18}}>
          {[
            ["PROVINCES",last.totalProvinces||members.length,""],
            ["TOTAL LAND",last.totalLand,"acres"],
            ["TOTAL NETWORTH",last.totalNw,"gc"],
            ["LAND DELTA",totalLandDelta,"acres"],
            ["NW DELTA",totalNwDelta,"gc"]
          ].map(([label,value,suffix])=><article key={String(label)} style={{padding:"16px 17px",border:"1px solid rgba(255,255,255,.08)",borderRadius:11,background:"#081119"}}>
            <div style={{fontSize:8,color:"#687686",letterSpacing:".14em"}}>{label}</div>
            <strong style={{fontSize:22,display:"block",marginTop:7,color:label==="LAND DELTA"||label==="NW DELTA"?tone(Number(value)):label==="PROVINCES"?"#d8ff54":"#e7eef5"}}>{value==null?"—":fmt(value)}<span style={{fontSize:9,color:"#647382",marginLeft:5}}>{suffix}</span></strong>
          </article>)}
        </section>

        <section style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:14,marginBottom:18}}>
          <article style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".14em"}}>KINGDOM GROWTH</div><h2 style={{margin:"6px 0 2px",fontSize:18}}>Total land</h2></div><div style={{fontSize:10,color:tone(totalLandDelta)}}>{signed(totalLandDelta)} acres</div></div>
            <Sparkline values={landSeries}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#5f6d79"}}><span>{trend[0]?dateTime(trend[0].capturedAt):"—"}</span><span>{lastTrend?dateTime(lastTrend.capturedAt):"—"}</span></div>
          </article>
          <article style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".14em"}}>KINGDOM ECONOMY</div><h2 style={{margin:"6px 0 2px",fontSize:18}}>Total networth</h2></div><div style={{fontSize:10,color:tone(totalNwDelta)}}>{signed(totalNwDelta)} gc</div></div>
            <Sparkline values={nwSeries}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#5f6d79"}}><span>{trend[0]?dateTime(trend[0].capturedAt):"—"}</span><span>{lastTrend?dateTime(lastTrend.capturedAt):"—"}</span></div>
          </article>\n          <article style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119"}}>\n            <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".14em"}}>KINGDOM EFFICIENCY</div><h2 style={{margin:"6px 0 2px",fontSize:18}}>Average NW / acre</h2></div><div style={{fontSize:10,color:"#718091"}}>{lastTrend?.avgNwpa==null?"—":fmt(lastTrend.avgNwpa)}</div></div>\n            <Sparkline values={trend.map((x:any)=>Number(x.avgNwpa)).filter(Number.isFinite)}/>\n            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#5f6d79"}}><span>{trend[0]?dateTime(trend[0].capturedAt):"—"}</span><span>{lastTrend?dateTime(lastTrend.capturedAt):"—"}</span></div>\n          </article>
        </section>

        <CanonicalIntelStrip section="kingdom"/>

        <section style={{padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:12,background:"#081119",marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
            <div><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".16em"}}>KINGDOM ROSTER</div><h2 style={{margin:"6px 0 2px",fontSize:20}}>Every province. Every scrape.</h2><div style={{fontSize:10,color:"#687686"}}>Click any province to open its full intelligence profile. Green/red movement is calculated against the previous Kingdom scrape.</div></div>
            <div style={{display:"flex",gap:8}}>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search province…" style={{width:180,padding:"10px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",background:"#05080d",color:"#e7eef5",outline:"none"}}/>
              <select value={String(sort)} onChange={e=>setSort(e.target.value as keyof Member)} style={{padding:"10px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",background:"#05080d",color:"#e7eef5"}}><option value="slot">Slot</option><option value="name">Name</option><option value="land">Land</option><option value="nw">Networth</option><option value="nwpa">NW/A</option><option value="gains">Gains</option></select>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>{["#","Province","Race","Land","Δ","Networth","Δ","NW/A","Nobility","Gains","Δ"].map(h=><th key={h} style={{textAlign:h==="Province"||h==="Race"||h==="Nobility"?"left":"right",padding:"9px 8px",borderBottom:"1px solid rgba(255,255,255,.08)",color:"#5f6d79",fontSize:8,letterSpacing:".12em"}}>{h}</th>)}</tr></thead>
              <tbody>{filtered.map(p=><tr key={p.slot} onClick={()=>router.push(`/command/province?province=${encodeURIComponent(p.name)}`)} style={{cursor:"pointer",background:selected===p.slot?"rgba(216,255,84,.06)":"transparent"}}>
                <td style={{padding:"11px 8px",color:"#657482"}}>{p.slot}</td>
                <td style={{padding:"11px 8px",fontWeight:800,color:"#e7eef5"}}>{p.name}{p.name===data?.kingdom?.yourProvince&&<span style={{marginLeft:7,color:"#d8ff54",fontSize:8}}>YOU</span>}</td>
                <td style={{padding:"11px 8px",color:"#a8b4bf"}}>{p.race}</td>
                <td style={{padding:"11px 8px",textAlign:"right"}}>{fmt(p.land)}</td><td style={{padding:"11px 8px",textAlign:"right"}}><Delta value={p.deltaLand}/></td>
                <td style={{padding:"11px 8px",textAlign:"right"}}>{fmt(p.nw)}</td><td style={{padding:"11px 8px",textAlign:"right"}}><Delta value={p.deltaNw}/></td>
                <td style={{padding:"11px 8px",textAlign:"right"}}>{fmt(p.nwpa)}</td>
                <td style={{padding:"11px 8px",color:"#a8b4bf"}}>{p.nobility}</td>
                <td style={{padding:"11px 8px",textAlign:"right"}}>{signed(p.gains)}</td><td style={{padding:"11px 8px",textAlign:"right"}}><Delta value={p.deltaGains}/></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        {selectedMember&&<section style={{padding:18,border:"1px solid rgba(216,255,84,.18)",borderRadius:12,background:"#081119"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
            <div><div style={{fontSize:9,color:"#d8ff54",letterSpacing:".16em"}}>PROVINCE TELEMETRY · #{selectedMember.slot}</div><h2 style={{margin:"6px 0 2px",fontSize:23}}>{selectedMember.name}</h2><div style={{fontSize:11,color:"#718091"}}>{selectedMember.race} · {selectedMember.nobility} · current {fmt(selectedMember.land)} acres · {fmt(selectedMember.nw)} nw</div></div>
            <button onClick={()=>setSelected(null)} style={{border:0,background:"transparent",color:"#718091",cursor:"pointer"}}>CLOSE ×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:16}}>
            {[
              ["LAND",selectedHistory.map((x:any)=>x.land),selectedMember.land],
              ["NETWORTH",selectedHistory.map((x:any)=>x.nw),selectedMember.nw],
              ["NW / ACRE",selectedHistory.map((x:any)=>x.nwpa),selectedMember.nwpa]
            ].map(([label,values,current])=><article key={String(label)} style={{padding:14,border:"1px solid rgba(255,255,255,.07)",borderRadius:10,background:"#05080d"}}><div style={{fontSize:8,color:"#657482",letterSpacing:".14em"}}>{label}</div><strong style={{display:"block",fontSize:19,margin:"5px 0"}}>{fmt(current)}</strong><Sparkline values={(values as number[]).filter(v=>typeof v==="number")}/></article>)}
          </div>
        </section>}
      </div>}
    </section>
  </main>
}
