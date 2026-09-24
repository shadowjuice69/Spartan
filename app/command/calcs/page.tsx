"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

const nav = [["Command","/"],["Province","/command/province"],["War Room","/command/war-room"],["Build Lab","/command/build-lab"],["Draft Calc","/command/draft-calc"],["Calcs","/command/calcs"],["Tools","/command/tools"],["Wiki","/command/wiki"]]
const intel = [["Kingdom","/command/kingdom"],["Military","/command/military"],["Magic","/command/magic"],["Thievery","/command/thievery"],["Science","/command/science"],["Buildings","/command/buildings"],["Throne","/command/throne"]]
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
    {name:"Rob the Granaries",resource:"Food",capOow:.315,capWar:.46,perOow:95,perWar:135,unit:"bushels"},
    {name:"Rob the Vaults",resource:"Gold",capOow:.052,capWar:.14,perOow:40,perWar:106,unit:"gc"},
    {name:"Rob the Towers",resource:"Runes",capOow:.245,capWar:.35,perOow:18.2,perWar:26,unit:"runes"},
    {name:"Kidnapping",resource:"Peasants",capOow:.0185,capWar:.04,perOow:null,perWar:null,unit:"peasants"},
    {name:"Steal Horses",resource:"War Horses",capOow:.1275,capWar:.136,perOow:null,perWar:null,unit:"horses"},
  ]
  const [opName,setOpName]=useState("Rob the Granaries")
  const [war,setWar]=useState(false),[available,setAvailable]=useState(10000),[targetResource,setTargetResource]=useState(100000)
  const [yourTpa,setYourTpa]=useState(8),[targetTpa,setTargetTpa]=useState(4),[watchTowers,setWatchTowers]=useState(0)
  const [crime,setCrime]=useState(1),[race,setRace]=useState(1),[dens,setDens]=useState(1),[honor,setHonor]=useState(1),[invis,setInvis]=useState(1),[ritual,setRitual]=useState(1)
  const op=ops.find(x=>x.name===opName)||ops[0]
  const r=useMemo(function(){
    const cap=war?op.capWar:op.capOow
    const per=war?op.perWar:op.perOow
    const watch=Math.max(0,1-Math.min(watchTowers*0.024,.625))
    const attacker=invis*crime*race*dens*honor*ritual
    const ratio=targetTpa>0?yourTpa/targetTpa:999
    const maxReturn=targetResource*cap
    const rawNeed=per?Math.ceil(maxReturn/(per*watch*attacker)):null
    const thievesNeeded=rawNeed===null?0:Math.min(Math.max(rawNeed,0),Math.max(available,0))
    const projected=rawNeed===null?null:Math.min(maxReturn,Math.max(0,thievesNeeded*per*watch*attacker))
    return {cap,per,watch,attacker,ratio,maxReturn,rawNeed,thievesNeeded,projected}
  },[op,war,targetResource,available,targetTpa,yourTpa,watchTowers,crime,race,dens,honor,invis,ritual])
  const fmt=(n:number)=>Math.round(n).toLocaleString()
  return <Card title="🗡️ Thievery Calculator" subtitle="Wiki-based max-return planning: calculate how many thieves are needed to reach the operation's maximum return.">
    <Grid>
      <label><span style={label}>Operation</span><select style={input} value={opName} onChange={e=>setOpName(e.target.value)}>{ops.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
      <Field name="Target resource / troops" value={targetResource} setValue={setTargetResource}/>
      <Field name="Thieves available" value={available} setValue={setAvailable}/>
      <Field name="Your effective raw TPA" value={yourTpa} setValue={setYourTpa} step=".01"/>
      <Field name="Target raw TPA" value={targetTpa} setValue={setTargetTpa} step=".01"/>
      <Field name="Target Watch Towers %" value={watchTowers} setValue={setWatchTowers} step=".1"/>
      <Field name="Crime science multiplier" value={crime} setValue={setCrime} step=".01"/>
      <Field name="Race TPA multiplier" value={race} setValue={setRace} step=".01"/>
      <Field name="Dens multiplier" value={dens} setValue={setDens} step=".01"/>
      <Field name="Honor multiplier" value={honor} setValue={setHonor} step=".01"/>
      <Field name="Invisibility multiplier" value={invis} setValue={setInvis} step=".01"/>
      <Field name="Ritual TPA multiplier" value={ritual} setValue={setRitual} step=".01"/>
    </Grid>
    <label style={{display:"flex",gap:8,margin:"14px 0",fontSize:11}}><input type="checkbox" checked={war} onChange={e=>setWar(e.target.checked)}/> In War</label>
    <Results rows={[
      ["TPA ratio",r.ratio.toFixed(2)+"x"],
      ["Watch Tower damage factor",r.watch.toFixed(3)+"x"],
      ["Maximum wiki return",fmt(r.maxReturn)+" "+op.unit],
      ["Thieves needed for max",r.rawNeed===null?"Wiki does not specify a per-thief yield":fmt(r.rawNeed)],
      ["Thieves you can send",r.thievesNeeded===null?"—":fmt(r.thievesNeeded)],
      ["Gross return if successful",r.projected===null?"Wiki does not give a per-thief yield":fmt(r.projected)+" "+op.unit],
      ["Max-return cap reached",r.rawNeed===null?"NOT CALCULATED":(r.rawNeed<=available?"YES":"NO — not enough thieves")],
    ]}/>
    <div style={{fontSize:10,color:"#718091",marginTop:10}}>
      Wiki basis: Mod TPA = Raw TPA × Invisibility × Crime Science × Race × Dens × Honor × Ritual. Watch Towers reduce thief damage by 2.4% per tower percentage, capped at 62.5%. Resource operations use the wiki's listed per-thief yields and maximum percentage caps. The wiki does not provide an exact success-probability equation here, so no made-up success percentage is used.
    </div>
  </Card>
}
function Declare(){const [on,setOn]=useState(100000),[tn,setTn]=useState(100000),[ol,setOl]=useState(1000),[tl,setTl]=useState(1000),[om,setOm]=useState(15),[tm,setTm]=useState(30),[q,setQ]=useState(3);const r=useMemo(function(){const nw=tn/Math.max(on,1),land=tl/Math.max(ol,1),nwi=nw>=.85&&nw<=1.1765,li=land>=.85&&land<=1.1765,small=tn<on||tl<ol,range=small?nwi&&li:nwi||li,we=om>=15&&tm>=30&&tm>om&&range,they=tm>=15&&om>=30&&om>tm&&range,fcf=tm-om>=15&&om<30&&q>=3&&on<tn&&ol<tl;return {nw,land,nwi,li,range,we,they,fcf}},[on,tn,ol,tl,om,tm,q]);return <Card title="⚖️ Declare Calculator" subtitle="War range, declare legality, and FCF checks"><Grid><Field name="Our NW" value={on} setValue={setOn}/><Field name="Their NW" value={tn} setValue={setTn}/><Field name="Our land" value={ol} setValue={setOl}/><Field name="Their land" value={tl} setValue={setTl}/><Field name="Our meter" value={om} setValue={setOm}/><Field name="Their meter" value={tm} setValue={setTm}/><Field name="Quiet ticks" value={q} setValue={setQ}/></Grid><Results rows={[["NW range",r.nwi?"PASS":"FAIL",(r.nw*100).toFixed(1)+"%"],["Land range",r.li?"PASS":"FAIL",(r.land*100).toFixed(1)+"%"],["Overall range",r.range?"IN RANGE":"OUT OF RANGE"],["Can we declare",r.we?"YES":"NO"],["Can they declare",r.they?"YES":"NO"],["FCF available",r.fcf?"YES":"NO"]]}/></Card>}

function Science(){const [province,setProvince]=useState(""),[libraries,setLibraries]=useState(0),[books,setBooks]=useState("alchemy:1000\nstrategy:1000\nchanneling:500"),[result,setResult]=useState<any>(null),[loading,setLoading]=useState(false);async function run(){setLoading(true);try{const parsed:any={};books.split("\n").forEach(function(line){const p=line.split(":");if(p.length===2)parsed[p[0].trim()]=Number(p[1])||0});const q=new URLSearchParams({province:province,libraries:String(libraries),books:JSON.stringify(parsed)});const res=await fetch("/api/tools/science-summary?"+q.toString());setResult(await res.json())}finally{setLoading(false)}}return <Card title="🔬 Science / Science Summary" subtitle="Science reference and summary. Investment remains in Build Library."><Grid><label><span style={label}>Province (optional)</span><input style={input} value={province} onChange={e=>setProvince(e.target.value)} placeholder="Province name"/></label><Field name="Libraries %" value={libraries} setValue={setLibraries} step=".1"/></Grid><label style={{display:"block",marginTop:12}}><span style={label}>Books — science:value per line</span><textarea style={{...input,minHeight:130,fontFamily:"monospace"}} value={books} onChange={e=>setBooks(e.target.value)}/></label><button style={{...primary,marginTop:12}} onClick={run} disabled={loading}>{loading?"Loading…":"Build Science Summary"}</button>{result&&<div>{result.error?<p style={{color:"#ff9b9b",fontSize:11}}>{result.error}</p>:<Results rows={Object.entries(result.summary||{}).map(function(x:any){return [x[0],x[1].bonus+"%",x[1].books+" books"]})}/>}</div>}</Card>}

export default function Calcs(){const [tab,setTab]=useState("Attack"),items=["Thievery","Attack","Declare","Science / Summary"];return <main style={shell}><Sidebar/><section style={{flex:1,padding:"30px 34px",maxWidth:1300,minWidth:0}}><div style={{fontSize:9,color:"#67f0b0",letterSpacing:".2em"}}>SPARTAN // CALCULATORS</div><h1 style={{fontSize:34,margin:"7px 0 5px"}}>Calculators</h1><p style={{fontSize:11,color:"#7e8a99"}}>Thievery, attack, declare, and science tools live here. Build Library remains the home for science investment.</p><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>{items.map(x=><button key={x} style={tab===x?primary:ghost} onClick={()=>setTab(x)}>{x}</button>)}</div>{tab==="Thievery"&&<Thievery/>}{tab==="Attack"&&<Attack/>}{tab==="Declare"&&<Declare/>}{tab==="Science / Summary"&&<Science/>}</section></main>}
