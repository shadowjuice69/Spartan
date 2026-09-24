"use strict"

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERS: Record<string,Record<string,number>>={artisan:{artisan:1.25,_all:1},tactician:{siege:1.4,_all:1},mystic:{channeling:1.75,_all:1},necromancer:{channeling:1.3,_all:1},heretic:{channeling:1.3,crime:1.3,_all:1},rogue:{crime:1.5,_all:1},warhero:{valor:1.4,_all:1},sage:{_all:1.15}}
const RACE: Record<string,number>={undead:.9}
const keys=["alchemy","artisan","bookkeeping","channeling","crime","cunning","finesse","heroism","housing","production","resilience","shielding","siege","sorcery","strategy","tactics","tools","valor","arcana"]

export async function GET(req:NextRequest){
 try{
  const u=new URL(req.url)
  const province=u.searchParams.get("province")?.trim()||""
  const libraries=Number(u.searchParams.get("libraries")||0)
  const books=JSON.parse(u.searchParams.get("books")||"{}")
  const sb=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!)
  if(!province)return NextResponse.json({error:"Enter a province name for the science summary."},{status:400})
  const pv=await sb.from("provinces").select("name,race,personality").ilike("name","%"+province+"%").limit(1)
  if(pv.error||!pv.data?.length)return NextResponse.json({error:"Province not found."},{status:404})
  const p=pv.data[0]
  const settings=await sb.from("bot_settings").select("key,value").in("key",["current_age","kingdom_code"])
  const sm=Object.fromEntries((settings.data||[]).map((x:any)=>[x.key,x.value]))
  const age=Number(sm.current_age),kd=String(sm.kingdom_code||"").trim()
  const rr=await sb.from("science_rules").select("science_name,category,multiplier,effect").eq("active",true).eq("kd_code",kd).eq("age_number",age).not("multiplier","is",null)
  if(rr.error||!rr.data?.length)return NextResponse.json({error:"Active science rules are not configured for the current age/kingdom."},{status:503})
  const pers=String(p.personality||"").toLowerCase().replace(/\s/g,""),race=String(p.race||"").toLowerCase(),pm=PERS[pers]||{_all:1},all=(pm._all||1)*(1+libraries/100),rm=RACE[race]||1
  const summary:any={}
  for(const k of keys){const rule=rr.data.find((x:any)=>String(x.science_name).toLowerCase()===k);if(!rule)continue;const n=Number(books[k]||0);const bonus=n?Math.pow(n,1/2.125)*Number(rule.multiplier)*Number(pm[k]||1)*all*rm:0;summary[k]={books:n,bonus:Number(bonus.toFixed(1)),effect:rule.effect,category:rule.category}}
  return NextResponse.json({province:p.name,race,personality:pers,age,kingdom:kd,summary})
 }catch(e:any){return NextResponse.json({error:e?.message||"Science summary failed"},{status:500})}
}
