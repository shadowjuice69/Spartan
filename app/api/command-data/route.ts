import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan command data service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
const allowed = new Set(['kingdom','war-room','build-lab','military','magic','thievery','science','tools'])
const sectionKinds: Record<string,string[]> = { 'war-room':['som','news','throne','universal'], 'build-lab':['survey'], military:['som','throne'], magic:['magic'], thievery:['thievery'], science:['science'], tools:['bot_event','universal'], kingdom:['kingdom','throne','som','survey','science','magic','thievery','news','universal'] }

function mergeCapture(province: any, capture: any) {
  if (!capture) return province
  const payload = capture.parsed_payload?.data ?? capture.parsed_payload?.throne ?? capture.parsed_payload ?? {}
  const d = payload.data ?? payload
  return {
    ...province,
    name: province.name || d.name || capture.province_id,
    kd_code: province.kd_code || d.coordinates || capture.kingdom_id,
    acres: province.acres ?? d.acres,
    nw: province.nw ?? d.nw,
    off: province.off ?? d.off,
    def: province.def ?? d.def,
    peons: province.peons ?? d.peons,
    thieves: province.thieves ?? d.thieves,
    wizards: province.wizards ?? d.wizards,
    race: province.race || d.race,
  }
}

export async function GET(request: Request) {
  try {
    const auth = await createClient(); const { data:{user} } = await auth.auth.getUser()
    if (!user) return NextResponse.json({error:'Unauthorized'},{status:401})
    const section = new URL(request.url).searchParams.get('section') || 'kingdom'
    if (!allowed.has(section)) return NextResponse.json({error:'Unknown command section'},{status:400})
    const db = adminClient()
    const { data:account, error:accountError } = await db.from('spartan_accounts').select('auth_user_id,province_name,province_location,discord_user_id,screen_name,role').eq('auth_user_id',user.id).maybeSingle()
    if (accountError) throw accountError
    if (!account) return NextResponse.json({error:'Your Spartan account identity is not linked to this session.'},{status:403})

    const provinceName = account.province_name || null, kdCode = account.province_location || null
    let province:any = null
    if (provinceName && kdCode) { const r=await db.from('provinces').select('*').eq('name',provinceName).eq('kd_code',kdCode).maybeSingle(); if(r.error)throw r.error; province=r.data }
    if (!province && provinceName) { const r=await db.from('provinces').select('*').eq('name',provinceName).order('updated_at',{ascending:false}).limit(1).maybeSingle(); if(r.error)throw r.error; province=r.data }
    if (!province && account.discord_user_id) { const r=await db.from('provinces').select('*').eq('discord_id',String(account.discord_user_id)).order('updated_at',{ascending:false}).limit(1).maybeSingle(); if(r.error)throw r.error; province=r.data }
    if (!province) return NextResponse.json({error:'Your Spartan account is verified, but its province is not currently linked to captured data.'},{status:404})

    const kingdom = province.kd_code || kdCode || '6:9', kinds=sectionKinds[section]||[]
    const [provinces,history,flows,vault,wiki,steward] = await Promise.all([
      db.from('provinces').select('*').eq('kd_code',kingdom).order('slot',{ascending:true}),
      db.from('spartan_province_history').select('*').or(`province_id.eq.${province.id},province_id.eq.${province.name}`).order('observed_at',{ascending:true}).limit(200),
      db.from('spartan_data_flow').select('flow_id,page_kind,province_id,kingdom_id,received_at,status,processed_at,payload').eq('kingdom_id',kingdom).order('received_at',{ascending:false}).limit(250),
      db.from('spartan_capture_vault').select('id,capture_id,page_kind,province_id,kingdom_id,captured_at,source,url,parsed_payload,raw_payload').eq('kingdom_id',kingdom).order('captured_at',{ascending:false}).limit(250),
      db.from('wiki_entries').select('category',{count:'exact',head:false}).limit(500),
      db.from('spartan_steward_registry').select('steward_key,name,enabled,last_run_at,last_status,processed_count,quarantined_count,error_count').order('steward_key')
    ])
    if(provinces.error)throw provinces.error; if(history.error)throw history.error; if(flows.error)throw flows.error; if(vault.error)throw vault.error; if(wiki.error)throw wiki.error; if(steward.error)throw steward.error

    const counts:Record<string,number>={}; for(const row of wiki.data||[]) counts[row.category]=(counts[row.category]||0)+1
    const pageKinds:Record<string,number>={}; for(const row of flows.data||[]) pageKinds[row.page_kind]=(pageKinds[row.page_kind]||0)+1
    const selectedVault=(vault.data||[]).filter((row:any)=>kinds.includes(row.page_kind)).slice(0,100)
    const selectedFlows=(flows.data||[]).filter((row:any)=>kinds.includes(row.page_kind)).slice(0,100)

    // The canonical province row may intentionally keep legacy columns NULL. Overlay the newest
    // Throne capture so Command Center always reflects the actual captured game state.
    const latestThroneByProvince=new Map<string,any>()
    for(const c of (vault.data||[]).filter((x:any)=>x.page_kind==='throne')) {
      const key=String(c.province_id||'').toLowerCase(); if(!latestThroneByProvince.has(key)) latestThroneByProvince.set(key,c)
    }
    const enrichedProvinces=(provinces.data||[]).map((p:any)=>mergeCapture(p,latestThroneByProvince.get(String(p.name||'').toLowerCase())||latestThroneByProvince.get(String(p.id||'').toLowerCase())))
    const currentCapture=latestThroneByProvince.get(String(province.name||'').toLowerCase()) || latestThroneByProvince.get(String(province.id||'').toLowerCase())
    const current=mergeCapture(province,currentCapture)

    return NextResponse.json({ok:true,section,kingdom,province:current,provinces:enrichedProvinces,history:history.data||[],flows:flows.data||[],captures:selectedFlows,vault:selectedVault,pageKinds,wikiCounts:counts,stewards:steward.data||[],account,generatedAt:new Date().toISOString()})
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Command data query failed'},{status:500}) }
}
