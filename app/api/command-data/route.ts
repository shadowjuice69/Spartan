import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan command data service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const allowed = new Set(['kingdom', 'war-room', 'build-lab', 'military', 'magic', 'thievery', 'science', 'tools'])
const sectionKinds: Record<string, string[]> = {
  'war-room': ['som', 'news', 'throne', 'universal'],
  'build-lab': ['survey'],
  military: ['som', 'throne'],
  magic: ['magic'],
  thievery: ['thievery'],
  science: ['science'],
  tools: ['bot_event', 'universal'],
  kingdom: ['kingdom', 'throne', 'som', 'survey', 'science', 'magic', 'thievery', 'news', 'universal'],
}

function value(d: any, ...keys: string[]) {
  for (const key of keys) if (d?.[key] !== undefined && d?.[key] !== null) return d[key]
  return null
}

function unwrapState(row: any) {
  const state = row?.state
  if (!state || typeof state !== 'object') return {}
  return state.data && typeof state.data === 'object' ? state.data : state
}

function provinceFromKingdomProjection(row: any, provinceName: string) {
  const data = unwrapState(row)
  const list = Array.isArray(data.provinces) ? data.provinces : []
  return list.find((p: any) => String(p?.name ?? '').trim().toLowerCase() === provinceName.trim().toLowerCase()) ?? null
}

function normalizeProvince(registry: any, state: any, projection: any) {
  const d = state || {}
  return {
    id: registry.province_id,
    name: registry.province_name,
    kd_code: registry.kingdom_code,
    slot: registry.slot,
    race: value(d, 'race'),
    personality: value(d, 'personality'),
    acres: value(d, 'acres', 'land'),
    nw: value(d, 'nw', 'networth'),
    off: value(d, 'off', 'offense', 'offence'),
    def: value(d, 'def', 'defense', 'defence'),
    population: value(d, 'population'),
    peons: value(d, 'peons', 'peasants'),
    soldiers: value(d, 'soldiers'),
    off_specs: value(d, 'off_specs', 'offSpecs'),
    def_specs: value(d, 'def_specs', 'defSpecs'),
    elites: value(d, 'elites'),
    thieves: value(d, 'thieves'),
    wizards: value(d, 'wizards'),
    generals: value(d, 'generals'),
    prisoners: value(d, 'prisoners'),
    war_horses: value(d, 'war_horses', 'warHorses'),
    horses: value(d, 'war_horses', 'warHorses'),
    gold: value(d, 'gold'),
    food: value(d, 'food'),
    runes: value(d, 'runes'),
    mana: value(d, 'mana'),
    stealth: value(d, 'stealth', 'stlth'),
    build_efficiency: value(d, 'build_efficiency', 'buildEfficiency', 'be'),
    wages: value(d, 'wages'),
    game_year: value(d, 'game_year', 'gameYear', 'year'),
    game_tick: value(d, 'game_tick', 'gameTick', 'tick'),
    updated_at: projection?.updated_at ?? registry.updated_at,
    source: 'spartan_state_projection',
  }
}

function normalizeKingdomRows(registryRows: any[], kingdomProjection: any) {
  const data = unwrapState(kingdomProjection)
  const captured = Array.isArray(data.provinces) ? data.provinces : []
  const byName = new Map(captured.map((p: any) => [String(p?.name ?? '').trim().toLowerCase(), p]))
  return registryRows
    .map((r: any) => {
      const capturedProvince = byName.get(r.province_name.trim().toLowerCase())
      return normalizeProvince(r, capturedProvince ?? {}, kingdomProjection)
    })
    .sort((a, b) => (Number(a.slot ?? 999) - Number(b.slot ?? 999)) || a.name.localeCompare(b.name))
}

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const section = new URL(request.url).searchParams.get('section') || 'kingdom'
    if (!allowed.has(section)) return NextResponse.json({ error: 'Unknown command section' }, { status: 400 })

    const db = adminClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('id,auth_user_id,province_name,province_location,discord_user_id,screen_name,role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return NextResponse.json({ error: 'Your Spartan account identity is not linked to this session.' }, { status: 403 })

    const provinceName = account.province_name || ''
    const kingdom = account.province_location || ''
    if (!provinceName || !kingdom) return NextResponse.json({ error: 'Your Spartan account does not have a province/kingdom identity.' }, { status: 404 })

    // Command Center now reads ONLY the new Spartan canonical system.
    // No legacy provinces/kingdoms views, legacy wiki table, or old Intel tables are used here.
    const sharedSections = new Set(['kingdom', 'war-room'])
    const allowKingdomView = sharedSections.has(section)
    const [registryResult, kingdomRegistryResult, projectionResult, historyResult, flowResult, vaultResult, wikiResult, stewardResult] = await Promise.all([
      (allowKingdomView
        ? db.from('spartan_province_registry').select('*').eq('kingdom_code', kingdom)
        : db.from('spartan_province_registry').select('*').eq('province_id', account.id)).order('slot', { ascending: true }),
      allowKingdomView ? db.from('spartan_kingdom_registry').select('*').eq('kingdom_code', kingdom).maybeSingle() : Promise.resolve({ data: null, error: null }),
      (allowKingdomView
        ? db.from('spartan_state_projection').select('province_id,kingdom_id,state,version,source_flow_id,updated_at').eq('kingdom_id', kingdom)
        : db.from('spartan_state_projection').select('province_id,kingdom_id,state,version,source_flow_id,updated_at').or(`province_id.eq.${account.id},province_id.eq.${provinceName}`)).order('updated_at', { ascending: false }).limit(100),
      db.from('spartan_province_history').select('*').eq('province_id', provinceName).order('observed_at', { ascending: true }).limit(200),
      (allowKingdomView
        ? db.from('spartan_data_flow').select('flow_id,page_kind,province_id,kingdom_id,received_at,status,processed_at,payload').eq('kingdom_id', kingdom)
        : db.from('spartan_data_flow').select('flow_id,page_kind,province_id,kingdom_id,received_at,status,processed_at,payload').eq('province_id', account.id)).order('received_at', { ascending: false }).limit(250),
      (allowKingdomView
        ? db.from('spartan_capture_vault').select('id,capture_id,page_kind,province_id,kingdom_id,captured_at,source,url,parsed_payload,raw_payload').eq('kingdom_id', kingdom)
        : db.from('spartan_capture_vault').select('id,capture_id,page_kind,province_id,kingdom_id,captured_at,source,url,parsed_payload,raw_payload').eq('province_id', account.id)).order('captured_at', { ascending: false }).limit(250),
      db.from('spartan_wiki_knowledge_registry').select('source_key,source_name,authoritative,active'),
      db.from('spartan_steward_registry').select('steward_key,name,enabled,last_run_at,last_status,processed_count,quarantined_count,error_count').order('steward_key'),
    ])

    for (const result of [registryResult, kingdomRegistryResult, projectionResult, historyResult, flowResult, vaultResult, wikiResult, stewardResult]) {
      if (result.error) throw result.error
    }

    const registryRows = registryResult.data || []
    const projections = projectionResult.data || []
    const kingdomProjection = projections.find((p: any) => unwrapState(p)?.raw_kind === 'kingdom_details') || projections[0] || null
    const currentRegistry = registryRows.find((r: any) => r.province_name.trim().toLowerCase() === provinceName.trim().toLowerCase())

    if (!currentRegistry) {
      return NextResponse.json({ error: 'Your Spartan province is not present in the canonical province registry.' }, { status: 404 })
    }

    // Province projections use the canonical province name as province_id, while
    // the registry uses its UUID. Match both forms before falling back to the
    // kingdom aggregate projection; otherwise a fresh province projection can
    // be ignored and the Command Center will display stale kingdom data.
    const currentProjection = projections.find((p: any) => {
      const projectionId = String(p?.province_id ?? '').trim().toLowerCase()
      const registryId = String(currentRegistry?.province_id ?? '').trim().toLowerCase()
      const state = unwrapState(p)
      const stateName = String(state?.name ?? state?.province_name ?? '').trim().toLowerCase()
      const wantedName = provinceName.trim().toLowerCase()
      return projectionId === wantedName || projectionId === registryId || stateName === wantedName
    })
    const currentState = currentProjection ? unwrapState(currentProjection) : provinceFromKingdomProjection(kingdomProjection, provinceName)
    const current = normalizeProvince(currentRegistry, currentState || {}, currentProjection || kingdomProjection)
    const enrichedProvinces = normalizeKingdomRows(registryRows, kingdomProjection)

    const kinds = new Set(sectionKinds[section] || [])
    const selectedVault = (vaultResult.data || []).filter((row: any) => kinds.has(row.page_kind)).slice(0, 100)
    const selectedFlows = (flowResult.data || []).filter((row: any) => kinds.has(row.page_kind)).slice(0, 100)
    const pageKinds: Record<string, number> = {}
    for (const row of flowResult.data || []) pageKinds[row.page_kind] = (pageKinds[row.page_kind] || 0) + 1

    const wikiCounts = { total: (wikiResult.data || []).filter((x: any) => x.active !== false).length, authoritative: (wikiResult.data || []).filter((x: any) => x.authoritative === true).length }

    const currentHistory = (historyResult.data || []).map((row: any) => ({
      ...row,
      province_id: row.province_id || current.id,
      acres: row.acres ?? current.acres,
      networth: row.networth ?? current.nw,
      population: row.population ?? current.population,
      soldiers: row.soldiers ?? current.soldiers,
      off_specs: row.off_specs ?? current.off_specs,
      def_specs: row.def_specs ?? current.def_specs,
      elites: row.elites ?? current.elites,
      thieves: row.thieves ?? current.thieves,
      wizards: row.wizards ?? current.wizards,
      offense: row.offense ?? current.off,
      defense: row.defense ?? current.def,
    }))

    return NextResponse.json({
      ok: true,
      section,
      kingdom,
      kingdomInfo: kingdomRegistryResult.data,
      province: current,
      provinces: allowKingdomView ? enrichedProvinces : enrichedProvinces.filter((p: any) => String(p.id) === String(currentRegistry.province_id)),
      history: currentHistory,
      flows: flowResult.data || [],
      captures: selectedFlows,
      vault: selectedVault,
      pageKinds,
      wikiCounts,
      stewards: stewardResult.data || [],
      account,
      generatedAt: new Date().toISOString(),
      dataContract: {
        canonicalRegistry: 'spartan_province_registry',
        canonicalKingdom: 'spartan_kingdom_registry',
        canonicalState: 'spartan_state_projection',
        legacySources: [],
        acresSource: 'state.data.land_or_acres',
        goldSource: 'state.data.gold_only',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Command data query failed' }, { status: 500 })
  }
}
