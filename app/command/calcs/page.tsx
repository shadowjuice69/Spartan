"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { NAV_COMMAND as nav, NAV_INTEL as intel } from '@/lib/spartan/nav'



const shell: React.CSSProperties={minHeight:"100vh",background:"#05080d",color:"#e7eef5",fontFamily:"Inter,system-ui,sans-serif",display:"flex"}
const side: React.CSSProperties={width:245,flexShrink:0,minHeight:"100vh",background:"#071018",borderRight:"1px solid rgba(255,255,255,.08)",padding:24,position:"sticky",top:0,height:"100vh",overflowY:"auto"}
const card: React.CSSProperties={padding:18,border:"1px solid rgba(255,255,255,.08)",borderRadius:10,background:"#081119"}
const input: React.CSSProperties={background:"#05080d",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"9px 10px",fontSize:12,color:"#dce7ee",width:"100%",boxSizing:"border-box"}
const label: React.CSSProperties={fontSize:10,color:"#8993a1",display:"block",marginBottom:5}
const primary: React.CSSProperties={background:"#d8ff54",color:"#101408",border:"1px solid #91a93a",borderRadius:8,padding:"9px 14px",fontWeight:800,fontSize:11,cursor:"pointer"}
const ghost: React.CSSProperties={background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",color:"#dce7ee",borderRadius:8,padding:"9px 14px",fontSize:11,cursor:"pointer"}

function Sidebar(){const r=useRouter();return <aside style={side}><b style={{letterSpacing:".18em",color:"#d8ff54"}}>SPARTAN</b><div style={{fontSize:9,color:"#718091",letterSpacing:".16em",marginTop:5}}>UTOPIA COMMAND</div><div style={{margin:"30px 0 10px",fontSize:9,color:"#5f6c7a"}}>COMMAND SYSTEMS</div>{nav.map(function(x){return <button key={x[0]} onClick={()=>r.push(x[1])} style={{...ghost,width:"100%",textAlign:"left",marginBottom:4,border:0,background:x[0]==="Calcs"?"rgba(216,255,84,.08)":"transparent",color:x[0]==="Calcs"?"#d8ff54":"#aeb9c5"}}>{x[0]}</button>})}<div style={{margin:"22px 0 10px",fontSize:9,color:"#5f6c7a"}}>INTEL DATA</div>{intel.map(function(x){return <button key={x[0]} onClick={()=>r.push(x[1])} style={{...ghost,width:"100%",textAlign:"left",marginBottom:4,border:0,background:"transparent",color:"#aeb9c5"}}>{x[0]}</button>})}</aside>}

function Field(p:{name:string;value:number;setValue:(n:number)=>void;step?:string}){return <label><span style={label}>{p.name}</span><input style={input} type="number" step={p.step||"1"} value={p.value} onChange={e=>p.setValue(Number(e.target.value)||0)}/></label>}
function Grid(p:{children:React.ReactNode}){return <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>{p.children}</div>}
function Results(p:{rows:Array<[string,string,string?]>}){return <div style={{marginTop:16,borderTop:"1px solid rgba(255,255,255,.08)"}}>{p.rows.map(function(x,i){return <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:12,padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,.06)",fontSize:11}}><span style={{color:"#8ea0ab"}}>{x[0]}</span><b style={{color:"#d8ff54"}}>{x[1]}</b><span style={{color:"#6f7f8d"}}>{x[2]||""}</span></div>})}</div>}
function Card(p:{title:string;subtitle:string;children:React.ReactNode}){return <section style={card}><div style={{color:"#67f0b0",fontSize:9,letterSpacing:".16em"}}>SPARTAN // CALCULATOR</div><h2 style={{margin:"6px 0"}}>{p.title}</h2><p style={{fontSize:10,color:"#7e8a99",marginTop:0}}>{p.subtitle}</p>{p.children}</section>}

function Attack(){const [yn,setYn]=useState(100000),[tn,setTn]=useState(100000),[ya,setYa]=useState(1000),[ta,setTa]=useState(1000),[map,setMap]=useState(0),[mods,setMods]=useState(0),[war,setWar]=useState(false);const r=useMemo(function(){let a=tn/Math.max(yn,1)-.05;if(a>=1)a=1/a;const magic=Math.max(.67,a<.9?a+.1:a),gf=Math.min(1.35,Math.max(.01,3*magic-2*mods)),mf=war?(1-map/100+3)/4:1-map/100,gain=Math.min(.12*ta*gf*mf,.2*ya),mg=Math.floor(275*(gain/Math.max(ta,1)));return {magic,gf,mf,gain:Math.floor(gain),mg,newMap:Math.min(100,map+mg),cap:gain>=.2*ya}},[yn,tn,ya,ta,map,mods,war]);return <Card title="⚔️ Attack Calculator" subtitle="Traditional attack land and MAP projection"><Grid><Field name="Your NW" value={yn} setValue={setYn}/><Field name="Target NW" value={tn} setValue={setTn}/><Field name="Your Acres" value={ya} setValue={setYa}/><Field name="Target Acres" value={ta} setValue={setTa}/><Field name="Your MAP %" value={map} setValue={setMap}/><Field name="Offense modifiers" value={mods} setValue={setMods} step=".01"/></Grid><label style={{display:"flex",gap:8,margin:"14px 0",fontSize:11}}><input type="checkbox" checked={war} onChange={e=>setWar(e.target.checked)}/> War MAP formula</label><Results rows={[["Magic factor",r.magic.toFixed(4)],["Gains factor",r.gf.toFixed(4)],["MAP factor",r.mf.toFixed(4)],["Acres gained",r.gain.toLocaleString()],["MAP gained",String(r.mg)],["New MAP",r.newMap+"%"],["20% acre cap",r.cap?"ACTIVE":"not reached"]]}/></Card>}

function Thievery(){
  const ops=[
    {name:"Rob the Granaries",resource:"Food",capOow:.315,capWar:.46,perOow:95,perWar:135,lost:0.10,unit:"bushels",notes:"10% of stolen food is lost."},
    {name:"Rob the Vaults",resource:"Gold",capOow:.052,capWar:.14,perOow:40,perWar:106,lost:0,unit:"gc",notes:"No resource-loss modifier listed."},
    {name:"Rob the Towers",resource:"Runes",capOow:.245,capWar:.35,perOow:18.2,perWar:26,lost:0,unit:"runes",notes:"No resource-loss modifier listed."},
    {name:"Kidnapping",resource:"Peasants",capOow:.0185,capWar:.04,perOow:.132,perWar:.285,lost:0,unit:"peasants",notes:"Gains can drop by 50% against a low-population target."},
    {name:"Steal War Horses",resource:"War Horses",capOow:.1275,capWar:.136,perOow:.094,perWar:.10,lost:0.50,unit:"horses",notes:"Only half of the horses released are kept."},
    {name:"Free Prisoners",resource:"Prisoners",capOow:.12,capWar:.17,perOow:.06,perWar:.07,lost:0.50,unit:"prisoners",notes:"You gain half of the prisoners freed."},
  ]
  const [opName,setOpName]=useState("Rob the Granaries")
  const [war,setWar]=useState(false),[available,setAvailable]=useState(10000),[targetResource,setTargetResource]=useState(100000)
  const [racialMod,setRacialMod]=useState(1)
  const [watchTowers,setWatchTowers]=useState(0)
  const [selfNW,setSelfNW]=useState(100000),[targetNW,setTargetNW]=useState(100000),[targetRaceMod,setTargetRaceMod]=useState(1),[targetPersonalityMod,setTargetPersonalityMod]=useState(1),[guile,setGuile]=useState(1),[cunning,setCunning]=useState(1),[targetIlluminate,setTargetIlluminate]=useState(1),[targetShielding,setTargetShielding]=useState(0),[stance,setStance]=useState(1)
  const op=ops.find(x=>x.name===opName)||ops[0]
  const r=useMemo(function(){
    const cap=war?op.capWar:op.capOow
    const per=war?op.perWar:op.perOow
    const targetNWRatio=Math.min(targetNW/Math.max(selfNW,1),selfNW/Math.max(targetNW,1))
    const watch=Math.max(0,1-Math.min(watchTowers*0.024,.625))
    const baseYield=targetNWRatio*per*(1-op.lost)*racialMod*targetRaceMod*targetPersonalityMod*guile*cunning*targetIlluminate*watch*(1-targetShielding)*stance
    const maxGross=targetResource*cap
    const rawNeed=Math.ceil(maxGross/Math.max(per*racialMod,Number.EPSILON))
    const recommended=Math.max(0,rawNeed)
    const canSend=Math.max(0,available)
    const actualSend=Math.min(recommended,canSend)
    const theoreticalGross=Math.min(maxGross,actualSend*per*racialMod)
    const estimatedNet=war?null:Math.max(0,theoreticalGross*(1-op.lost)*targetNWRatio*targetRaceMod*targetPersonalityMod*guile*cunning*targetIlluminate*watch*(1-targetShielding)*stance)
    return {cap,per,targetNWRatio,watch,maxGross,rawNeed,recommended,actualSend,theoreticalGross,estimatedNet,baseYield}
  },[op,war,targetResource,available,racialMod,selfNW,targetNW,targetRaceMod,targetPersonalityMod,guile,cunning,targetIlluminate,targetShielding,stance,watchTowers])
  const fmt=(n:number)=>Math.round(n).toLocaleString()
  return <Card title="🗡️ Thievery Calculator" subtitle="Wiki-based instant-sabotage planning. The recommended send count uses the documented optimal-thieves formula; yield factors are shown separately.">
    <Grid>
      <label><span style={label}>Operation</span><select style={input} value={opName} onChange={e=>setOpName(e.target.value)}>{ops.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
      <Field name="Target resource / troops" value={targetResource} setValue={setTargetResource}/>
      <Field name="Thieves available" value={available} setValue={setAvailable}/>
      <Field name="Your racial mod" value={racialMod} setValue={setRacialMod} step=".01"/>
      <Field name="Target Watch Towers %" value={watchTowers} setValue={setWatchTowers} step=".1"/>
      <Field name="Your NW" value={selfNW} setValue={setSelfNW}/>
      <Field name="Target NW" value={targetNW} setValue={setTargetNW}/>
      <Field name="Target race mod" value={targetRaceMod} setValue={setTargetRaceMod} step=".01"/>
      <Field name="Target personality mod" value={targetPersonalityMod} setValue={setTargetPersonalityMod} step=".01"/>
      <Field name="Guile modifier" value={guile} setValue={setGuile} step=".01"/>
      <Field name="Cunning modifier" value={cunning} setValue={setCunning} step=".01"/>
      <Field name="Target Illuminate Shadows" value={targetIlluminate} setValue={setTargetIlluminate} step=".01"/>
      <Field name="Target Shielding" value={targetShielding} setValue={setTargetShielding} step=".01"/>
      <Field name="Stance modifier" value={stance} setValue={setStance} step=".01"/>
    </Grid>
    <label style={{display:"flex",gap:8,margin:"14px 0",fontSize:11}}><input type="checkbox" checked={war} onChange={e=>setWar(e.target.checked)}/> In War</label>
    <Results rows={[
      ["Optimal thieves to send",fmt(r.recommended),"(documented formula)"],
      ["Thieves available",fmt(available)],
      ["Thieves you can actually send",fmt(r.actualSend),r.actualSend<r.recommended?"NOT ENOUGH TO HIT CAP":"CAP SEND"],
      ["Maximum operation amount",fmt(r.maxGross)+" "+op.unit],
      ["Gross amount at your send",fmt(r.theoreticalGross)+" "+op.unit],
      ["Estimated net received",r.estimatedNet===null?"Not exact in war (war bonus value not documented here)":fmt(r.estimatedNet)+" "+op.unit],
      ["Target NW / self NW factor",r.targetNWRatio.toFixed(4)+"x"],
      ["Watch Tower factor",r.watch.toFixed(4)+"x"],
      ["Base yield per thief",r.baseYield.toFixed(3)+" "+op.unit],
      ["Cap reached",r.actualSend>=r.recommended?"YES":"NO"],
    ]}/>
    <div style={{fontSize:10,color:"#718091",marginTop:10}}>
      Accurate send-count formula: (Target Resources × Max % of Total) ÷ Gains Per Thief ÷ Racial Mod. TPA, NW ratio, target modifiers, Watch Towers, losses and stance affect the operation's yield, not the documented optimal send-count formula. For Kidnapping, low target population can reduce gains by 50%.
    </div>
  </Card>
}
function Declare(){const [on,setOn]=useState(100000),[tn,setTn]=useState(100000),[ol,setOl]=useState(1000),[tl,setTl]=useState(1000),[om,setOm]=useState(15),[tm,setTm]=useState(30),[q,setQ]=useState(3);const r=useMemo(function(){const nw=tn/Math.max(on,1),land=tl/Math.max(ol,1),nwi=nw>=.85&&nw<=1.1765,li=land>=.85&&land<=1.1765,small=tn<on||tl<ol,range=small?nwi&&li:nwi||li,we=om>=15&&tm>=30&&tm>om&&range,they=tm>=15&&om>=30&&om>tm&&range,fcf=tm-om>=15&&om<30&&q>=3&&on<tn&&ol<tl;return {nw,land,nwi,li,range,we,they,fcf}},[on,tn,ol,tl,om,tm,q]);return <Card title="⚖️ Declare Calculator" subtitle="War range, declare legality, and FCF checks"><Grid><Field name="Our NW" value={on} setValue={setOn}/><Field name="Their NW" value={tn} setValue={setTn}/><Field name="Our land" value={ol} setValue={setOl}/><Field name="Their land" value={tl} setValue={setTl}/><Field name="Our meter" value={om} setValue={setOm}/><Field name="Their meter" value={tm} setValue={setTm}/><Field name="Quiet ticks" value={q} setValue={setQ}/></Grid><Results rows={[["NW range",r.nwi?"PASS":"FAIL",(r.nw*100).toFixed(1)+"%"],["Land range",r.li?"PASS":"FAIL",(r.land*100).toFixed(1)+"%"],["Overall range",r.range?"IN RANGE":"OUT OF RANGE"],["Can we declare",r.we?"YES":"NO"],["Can they declare",r.they?"YES":"NO"],["FCF available",r.fcf?"YES":"NO"]]}/></Card>}

function Science(){
  const [province,setProvince]=useState("")
  const [provinces,setProvinces]=useState<Array<{province_name:string;kingdom_code:string|null}>>([])
  const [provinceLoading,setProvinceLoading]=useState(true)
  const [provinceError,setProvinceError]=useState("")
  const [libraries,setLibraries]=useState(0)
  const [books,setBooks]=useState("alchemy:1000\nstrategy:1000\nchanneling:500")
  const [result,setResult]=useState<any>(null)
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    let active=true
    fetch("/api/tools/science-summary/provinces")
      .then(async res=>{
        const data=await res.json()
        if(!res.ok) throw new Error(data.error||"Could not load Spartan provinces.")
        return data
      })
      .then(data=>{
        if(!active)return
        const list=Array.isArray(data.provinces)?data.provinces:[]
        setProvinces(list)
        setProvinceError(list.length?"":"No provinces were found in Spartan's province registry.")
        if(list.length)setProvince(list[0].province_name)
      })
      .catch(err=>{if(active)setProvinceError(err.message||"Could not load Spartan provinces.")})
      .finally(()=>{if(active)setProvinceLoading(false)})
    return ()=>{active=false}
  },[])

  async function run(){
    if(!province){setProvinceError("Choose a province first.");return}
    setLoading(true)
    try{
      const parsed:any={}
      books.split("\n").forEach(function(line){
        const p=line.split(":")
        if(p.length===2)parsed[p[0].trim()]=Number(p[1])||0
      })
      const q=new URLSearchParams({province,libraries:String(libraries),books:JSON.stringify(parsed)})
      const res=await fetch("/api/tools/science-summary?"+q.toString())
      const data=await res.json()
      setResult(data)
    }catch(e:any){
      setResult({error:e?.message||"Science summary failed."})
    }finally{
      setLoading(false)
    }
  }

  return <Card title="🔬 Science / Science Summary" subtitle="Estimate science effects using a province's latest captured science as the baseline. Choose any province registered in Spartan.">
    <Grid>
      <label>
        <span style={label}>Spartan province</span>
        <select style={input} value={province} onChange={e=>{setProvince(e.target.value);setResult(null)}} disabled={provinceLoading||provinces.length===0}>
          <option value="">{provinceLoading?"Loading Spartan provinces…":"Choose a province…"}</option>
          {provinces.map(p=><option key={p.province_name} value={p.province_name}>{p.province_name}{p.kingdom_code?" — "+p.kingdom_code:""}</option>)}
        </select>
        {provinceError&&<span style={{display:"block",fontSize:10,color:"#ff9b9b",marginTop:5}}>{provinceError}</span>}
        {!provinceError&&<span style={{display:"block",fontSize:10,color:"#718091",marginTop:5}}>{provinces.length} province{provinces.length===1?"":"s"} loaded from Spartan's registry.</span>}
      </label>
      <Field name="Libraries %" value={libraries} setValue={setLibraries} step="0.1"/>
    </Grid>
    <label style={{display:"block",marginTop:12}}>
      <span style={label}>Books — science:value per line</span>
      <textarea style={{...input,minHeight:130,fontFamily:"monospace"}} value={books} onChange={e=>setBooks(e.target.value)}/>
    </label>
    <button style={{...primary,marginTop:12}} onClick={run} disabled={loading||provinceLoading||!province}>{loading?"Loading…":"Build Science Summary"}</button>
    {result&&<div>{result.error?<p style={{color:"#ff9b9b",fontSize:11}}>{result.error}</p>:<Results rows={Object.entries(result.summary||{}).map(function(x:any){return [x[0],x[1].bonus+"%",x[1].books+" books"]})}/>}</div>}
  </Card>
}

export default function Calcs(){const [tab,setTab]=useState("Attack"),items=["Thievery","Attack","Declare","Science / Summary"];return <main style={shell}><Sidebar/><section style={{flex:1,padding:"30px 34px",maxWidth:1300,minWidth:0}}><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".2em"}}>SPARTAN // CALCULATORS</div><h1 style={{fontSize:34,margin:"7px 0 5px"}}>Calculators</h1><p style={{fontSize:11,color:"#7e8a99"}}>Thievery, attack, declare, and science tools live here. Build Library remains the home for science investment.</p><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>{items.map(x=><button key={x} style={tab===x?primary:ghost} onClick={()=>setTab(x)}>{x}</button>)}</div>{tab==="Thievery"&&<Thievery/>}{tab==="Attack"&&<Attack/>}{tab==="Declare"&&<Declare/>}{tab==="Science / Summary"&&<Science/>}</section></main>}
