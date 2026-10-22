"use strict"

import { NextRequest, NextResponse } from "next/server"
import { parseScience } from "@/lib/spartan/page-models"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const keys=["alchemy","artisan","bookkeeping","channeling","crime","cunning","finesse","heroism","housing","production","resilience","shielding","siege","sorcery","strategy","tactics","tools","valor"]

function parseEffect(value:any){
  const m=String(value||"").match(/([+-]?\d+(?:\.\d+)?)%/)
  return m?Number(m[1]):0
}

export async function GET(req:NextRequest){
 try{
  const u=new URL(req.url)
  const province=u.searchParams.get("province")?.trim()||""
  const libraries=Number(u.searchParams.get("libraries")||0)
  const books=JSON.parse(u.searchParams.get("books")||"{}")
  const sb=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!)
  if(!province)return NextResponse.json({error:"Enter your province name for the science summary."},{status:400})

  const pv=await sb.from("spartan_province_registry")
    .select("province_id,province_name,kingdom_code,metadata")
    .eq("province_name",province)
    .limit(1)

  if(pv.error||!pv.data?.length)return NextResponse.json({error:"Province not found in Spartan's current province registry."},{status:404})

  const p=pv.data[0]
  const metadata=(p.metadata&&typeof p.metadata==="object")?p.metadata as Record<string,any>:{}
  let capturedScience:Record<string,any>={}
  let capturedEffects:Record<string,any>={}
  let capturedAt:string|null=null
  let source="No current-age science capture"

  // The current_age setting may be absent after an age reset. The append-only
  // age log is the authoritative fallback, and untagged science is accepted
  // only when its capture timestamp is on/after that age's start.
  const ageResult=await sb.from("spartan_age_log").select("new_age,created_at").order("created_at",{ascending:false}).limit(1).maybeSingle()
  if(ageResult.error)throw ageResult.error
  const currentAge=Number(ageResult.data?.new_age)
  const ageStartedAt=ageResult.data?.created_at||null
  const ageStartMs=ageStartedAt?Date.parse(ageStartedAt):NaN

  if(Number.isInteger(currentAge)&&currentAge>0&&Number.isFinite(ageStartMs)){
    const accountResult=await sb.from("spartan_accounts").select("id").ilike("province_name",p.province_name).eq("province_location",p.kingdom_code).limit(1)
    if(accountResult.error)throw accountResult.error
    const account=accountResult.data?.[0]
    if(account?.id){
      const scienceResult=await sb.from("spartan_intel_records")
        .select("captured_at,created_at,age,raw_text,parsed_payload")
        .eq("province_id",String(account.id))
        .eq("page_kind","science")
        .order("captured_at",{ascending:false})
        .limit(30)
      if(scienceResult.error)throw scienceResult.error
      for(const row of scienceResult.data||[]){
        const at=String(row.captured_at||row.created_at||"")
        const age=Number(row.age)
        const current=Number.isFinite(age)&&row.age!=null?age===currentAge:(Number.isFinite(Date.parse(at))&&Date.parse(at)>=ageStartMs)
        if(!current)continue
        const parsed=parseScience(String(row.raw_text||""))
        const books:Record<string,number>={}
        const effects:Record<string,string>={}
        for(const category of parsed.categories||[]){
          for(const item of category.items||[]){
            const key=String(item.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")
            if(!key)continue
            books[key]=Number(item.books)||0
            effects[key]=String(Number(item.effect)||0)+"%"
          }
        }
        if(Object.keys(books).length){
          capturedScience=books
          capturedEffects=effects
          capturedAt=at||null
          source="Current-age Spartan Science capture"
          break
        }
      }
    }
  }

  // Registry metadata remains a compatibility fallback only when its own
  // capture timestamp proves it belongs to the current age.
  const metadataAt=String(metadata.science_captured_at||"")
  if(!Object.keys(capturedScience).length&&Number.isFinite(ageStartMs)&&Date.parse(metadataAt)>=ageStartMs){
    capturedScience=(metadata.science&&typeof metadata.science==="object")?metadata.science as Record<string,any>:{}
    capturedEffects=(metadata.science_effects&&typeof metadata.science_effects==="object")?metadata.science_effects as Record<string,any>:{}
    capturedAt=metadataAt||null
    source="Current-age province registry science snapshot"
  }
  const summary:any={}
  for(const k of keys){
    const currentBooks=Number(capturedScience[k]||0)
    const currentEffect=parseEffect(capturedEffects[k])
    const requestedBooks=Number(books[k]||0)
    let bonus=0
    if(requestedBooks>0&&currentBooks>0&&currentEffect!==0){
      const inferredMultiplier=currentEffect/Math.pow(currentBooks,1/2.125)
      bonus=inferredMultiplier*Math.pow(requestedBooks,1/2.125)*(1+libraries/100)
    }else if(requestedBooks>0&&currentEffect!==0){
      bonus=currentEffect*(1+libraries/100)
    }
    summary[k]={
      books:requestedBooks,
      bonus:Number(bonus.toFixed(1)),
      currentBooks,
      currentEffect,
      effect:capturedEffects[k]||"No captured effect"
    }
  }

  return NextResponse.json({
    province:p.province_name,
    kingdom:p.kingdom_code,
    summary,
    source,
    age:Number.isInteger(currentAge)&&currentAge>0?currentAge:null,
    ageStartedAt,
    capturedAt
  })
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Science summary failed"},{status:500})
 }
}