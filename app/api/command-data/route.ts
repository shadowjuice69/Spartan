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

function payloadData(capture:any) {
  let value = capture?.parsed_payload ?? capture?.raw_payload ?? {}
  for (let i=0;i<5;i++) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const next = value.data ?? value.throne ?? value.state ?? value.payload
    if (!next || typeof next !== 'object' || Array.isArray(next)) return value
    value = next
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function value(d:any, ...keys:string[]) {
  for (const key of keys) if (d?.[key] !== undefined && d?.[key] !== null) return d[key]
  return null
}
function mergeCapture(province: any, capture: any) {
  if (!capture) return province
  const d = payloadData(capture)
  return {
    ...province,
    name: province.name || value(d,'name','province') || capture.province_id,
    kd_code: province.kd_code || value(d,'coordinates','kd_code') || capture.kingdom_id,
    race: province.race || value(d,'race'),
    personality: province.personality || value(d,'personality'),
    acres: province.acres ?? value(d,'acres','land'),
    nw: province.nw ?? value(d,'nw','networth'),
    off: province.off ?? value(d,'off','offense','offence'),
    def: province.def ?? value(d,'def','defense','defence'),
    population: province.population ?? value(d,'population'),
    peons: province.peons ?? value(d,'peons','peasants'),
    soldiers: province.soldiers ?? value(d,'soldiers'),
    off_specs: province.off_specs ?? value(d,'off_specs','offSpecs'),
    def_specs: province.def_specs ?? value(d,'def_specs','defSpecs'),
    elites: province.elites ?? value(d,'elites'),
    thieves: province.thieves ?? value(d,'thieves'),
    wizards: province.wizards ?? value(d,'wizards'),
    generals: province.generals ?? value(d,'generals'),
    prisoners: province.prisoners ?? value(d,'prisoners'),
    war_horses: province.war_horses ?? value(d,'war_horses','warHorses'),
    horses: province.horses ?? value(d,'war_horses','warHorses'),
    gold: province.gold ?? value(d,'gold'),
    food: province.food ?? value(d,'food'),
    runes: province.runes ?? value(d,'runes'),
    mana: province.mana ?? value(d,'mana'),
    stealth: province.stealth ?? value(d,'stealth','stlth'),
    build_efficiency: province.build_efficiency ?? value(d,'build_efficiency','buildEfficiency','be'),
    wages: province.wages ?? value(d,'wages'),
    game_year: province.game_year ?? value(d,'game_year','gameYear','year'),
    game_tick: province.game_tick ?? value(d,'game_tick','gameTick','tick'),
    latest_capture_at: capture.captured_at ?? null,
    latest_capture_source: capture.source ?? null,
  }
}
function captureIdentity(c:any) {
  const d=payloadData(c)
  return {
    name:String(value(d,'name','province') ?? c.province_id ?? '').trim().toLowerCase(),
    id:String(c.province_id ?? '').trim().toLowerCase(),
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

    // Captures are allowed to arrive keyed by province name while the canonical provinces table uses UUIDs.
    // Build both identity indexes so the Command Center never loses a fresh Throne overlay because of that mismatch.
    const latestThroneByName=new Map<string,any>(), latestThroneById=new Map<string,any>()
    for(const c of (vault.data||[]).filter((x:any)=>x.page_kind==='throne')) {
      const identity=captureIdentity(c)
      if(identity.name && !latestThroneByName.has(identity.name)) latestThroneByName.set(identity.name,c)
      if(identity.id && !latestThroneById.has(identity.id)) latestThroneById.set(identity.id,c)
    }
    const captureFor=(p:any)=>latestThroneById.get(String(p.id||'').toLowerCase()) || latestThroneByName.get(String(p.name||'').toLowerCase())
    const enrichedProvinces=(provinces.data||[]).map((p:any)=>mergeCapture(p,captureFor(p)))
    const currentCapture=captureFor(province)
    const current=mergeCapture(province,currentCapture)
    const currentHistory=(history.data||[]).map((row:any)=>({
      ...row,
      province_id:row.province_id || province.id,
      acres:row.acres ?? current.acres,
      networth:row.networth ?? current.nw,
      population:row.population ?? current.population,
      soldiers:row.soldiers ?? current.soldiers,
      off_specs:row.off_specs ?? current.off_specs,
      def_specs:row.def_specs ?? current.def_specs,
      elites:row.elites ?? current.elites,
      thieves:row.thieves ?? current.thieves,
      wizards:row.wizards ?? current.wizards,
      offense:row.offense ?? current.off,
      defense:row.defense ?? current.def,
    }))

    return NextResponse.json({ok:true,section,kingdom,province:current,provinces:enrichedProvinces,history:currentHistory,flows:flows.data||[],captures:selectedFlows,vault:selectedVault,pageKinds,wikiCounts:counts,stewards:steward.data||[],account,generatedAt:new Date().toISOString(),dataContract:{canonicalState:'provinces.state_data.throne',captureOverlay:Boolean(currentCapture),historyRows:currentHistory.length}})
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Command data query failed'},{status:500}) }
}
