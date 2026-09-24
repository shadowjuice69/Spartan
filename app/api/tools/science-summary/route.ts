"use strict"

import { NextRequest, NextResponse } from "next/server"
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
    .ilike("province_name","%"+province+"%")
    .limit(1)

  if(pv.error||!pv.data?.length)return NextResponse.json({error:"Province not found in Spartan's current province registry."},{status:404})

  const p=pv.data[0]
  const metadata=(p.metadata&&typeof p.metadata==="object")?p.metadata as Record<string,any>:{}
  const capturedScience=(metadata.science&&typeof metadata.science==="object")?metadata.science as Record<string,any>:{}
  const capturedEffects=(metadata.science_effects&&typeof metadata.science_effects==="object")?metadata.science_effects as Record<string,any>:{}

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
    source:"Spartan province registry / latest captured Science page",
    capturedAt:metadata.science_captured_at||null
  })
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Science summary failed"},{status:500})
 }
}