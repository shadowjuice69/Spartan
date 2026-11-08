import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DISPLAY_DESTINATIONS: Record<string, string[]> = {
  throne: ['Province', 'Throne', 'Province History', 'Intel Vertical / Throne'],
  survey: ['Buildings', 'Build Lab', 'Province History', 'Intel Vertical / Buildings'],
  science: ['Science', 'Science Summary', 'Province History', 'Intel Vertical / Science'],
  som: ['Military', 'War Room', 'Return Tracker', 'Province History'],
  magic: ['Magic', 'War Room', 'Intel Vertical / Magic'],
  aid: ['Aid', 'Intel Vertical / Aid', 'News', 'War Room'],
  thievery: ['Thievery', 'War Room', 'Intel Vertical / Thievery'],
  news: ['News', 'War Room', 'Event History'],
  attack: ['News', 'War Room', 'Enemy Intel', 'Event History'],
  intel: ['Kingdom Intel', 'Enemy Intel'],
  bot_event: ['Intel Backlog', 'News', 'Event History'],
  universal: ['Intel Vertical', 'Province History'],
}

const FIELD_GROUPS = [
  { name: 'Province identity', keys: ['name', 'province', 'province_name', 'ruler', 'ruler_name', 'race', 'personality', 'coordinates', 'kingdom_code', 'province_location'] },
  { name: 'Land & economy', keys: ['acres', 'total_acres', 'total_land', 'nw', 'networth', 'net_worth', 'gold', 'food', 'trade_balance', 'tradebalance', 'peasants', 'peons', 'population', 'wages', 'income', 'daily_income', 'honor'] },
  { name: 'Military', keys: ['off', 'def', 'offense', 'defense', 'defense_home', 'defensehome', 'def_home', 'defhome', 'home_defense', 'home_def', 'soldiers', 'off_specs', 'def_specs', 'elites', 'generals', 'gens', 'war_horses', 'prisoners'] },
  { name: 'Covert & magic', keys: ['thieves', 'wizards', 'o_tpa', 'd_tpa', 'tpa', 'o_wpa', 'd_wpa', 'wpa', 'mana', 'stealth', 'runes'] },
  { name: 'Buildings & science', keys: ['buildings', 'be', 'building_efficiency', 'efficiency', 'science', 'science_level', 'research', 'books'] },
  { name: 'Kingdom grid', keys: ['grid', 'rows', 'slot', 'goodspells', 'kingdomcode'] },
  { name: 'Events & outcomes', keys: ['events', 'event_type', 'attacker', 'defender', 'attacker_kingdom', 'defender_kingdom', 'target', 'targetprovince', 'acres_change', 'acrescaptured', 'losses', 'thieveslost', 'wizardslost', 'result'] },
]

function keysIn(value: any, out = new Set<string>(), depth = 0): Set<string> {
  if (!value || typeof value !== 'object' || depth > 5) return out
  if (Array.isArray(value)) { value.slice(0, 30).forEach(v => keysIn(v, out, depth + 1)); return out }
  for (const [key, child] of Object.entries(value)) {
    out.add(key.toLowerCase())
    if (child && typeof child === 'object') keysIn(child, out, depth + 1)
  }
  return out
}

export async function GET() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const { data: account, error: accountError } = await db.from('spartan_accounts')
      .select('id,auth_user_id,province_name,province_location,account_status')
      .eq('auth_user_id', user.id).maybeSingle()
    if (accountError) throw accountError
    if (!account) return NextResponse.json({ error: 'No linked Spartan account.' }, { status: 403 })

    const [vaultResult, intelRowsResult, intelCount, archivedIntelCount, expiredIntelCount, historyCount, eventCount, historyRowsResult, eventRowsResult, registryResult] = await Promise.all([
      db.from('spartan_capture_vault')
        .select('capture_id,source,page_kind,captured_at,parsed_payload,raw_payload')
        .eq('user_id', account.id).order('captured_at', { ascending: false }).limit(1500),
      db.from('spartan_intel_records_with_archive').select('page_kind,source,captured_at,expires_at,archived,parsed_payload,raw_payload,raw_text,metrics').eq('user_id', account.id).order('captured_at', { ascending: false }).limit(1500),
      db.from('spartan_intel_records_with_archive').select('id', { count: 'exact', head: true }).eq('user_id', account.id),
      db.from('spartan_intel_records_with_archive').select('id', { count: 'exact', head: true }).eq('user_id', account.id).eq('archived', true),
      db.from('spartan_intel_records_with_archive').select('id', { count: 'exact', head: true }).eq('user_id', account.id).lt('expires_at', new Date().toISOString()),
      db.from('spartan_province_history').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      db.from('spartan_event_history').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      db.from('spartan_province_history').select('acres,networth,population,peons,soldiers,off_specs,def_specs,elites,thieves,wizards,generals,prisoners,war_horses,offense,defense,defense_home,o_tpa,d_tpa,o_wpa,d_wpa,build_efficiency,wages').eq('user_id', user.id).order('observed_at', { ascending: false }).limit(250),
      db.from('spartan_event_history').select('event_type,attacker,defender,target_kingdom,acres_change,troops_lost,thieves_lost,wizards_lost,gold_change,food_change,runes_change,payload').eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(250),
      db.from('spartan_province_registry').select('province_id,province_name,kingdom_code,last_seen_at,metadata').or(`user_id.eq.${user.id},user_id.eq.${account.id}`).eq('province_name', account.province_name).limit(100),
    ])
    if (vaultResult.error) throw vaultResult.error
    if (intelRowsResult.error) throw intelRowsResult.error
    if (intelCount.error) throw intelCount.error
    if (archivedIntelCount.error) throw archivedIntelCount.error
    if (expiredIntelCount.error) throw expiredIntelCount.error
    if (historyCount.error) throw historyCount.error
    if (eventCount.error) throw eventCount.error
    if (historyRowsResult.error) throw historyRowsResult.error
    if (eventRowsResult.error) throw eventRowsResult.error
    if (registryResult.error) throw registryResult.error

    const captures = vaultResult.data || []
    const intelRows = intelRowsResult.data || []
    const intelByKind = new Map<string, any>()
    for (const row of intelRows) {
      const kind = row.page_kind || 'unknown'
      const current = intelByKind.get(kind) || { page_kind: kind, count: 0, latest: null, archived: 0, stale: 0, sources: new Set<string>(), fields: new Set<string>() }
      current.count += 1
      current.latest ||= row.captured_at
      current.archived += row.archived === true ? 1 : 0
      current.stale += row.archived === true || (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) ? 1 : 0
      current.sources.add(row.source || 'unknown')
      const parsed = row.parsed_payload?.data ?? row.parsed_payload ?? row.raw_payload ?? {}
      const keys = keysIn(parsed)
      keysIn(row.metrics, keys)
      const rawText = String(row.raw_text || parsed?.data_simple || '')
      for (const line of rawText.split(/\r?\n/)) {
        const cells = line.split(/\t+/).map((value: string) => value.trim())
        if (cells.length > 1 && cells[0] && cells[0].length <= 48) keys.add(cells[0].toLowerCase().replace(/\s+/g, '_'))
      }
      keys.forEach(key => current.fields.add(key))
      intelByKind.set(kind, current)
    }
    const byKind = new Map<string, any>()
    const bySource = new Map<string, number>()
    const allKeys = new Set<string>()
    const fieldCounts = new Map<string, number>()
    for (const row of captures) {
      const kind = row.page_kind || 'unknown'
      const current = byKind.get(kind) || { page_kind: kind, count: 0, latest: null, sources: new Set<string>(), structured: 0 }
      current.count += 1
      current.latest ||= row.captured_at
      if (row.source) { current.sources.add(row.source); bySource.set(row.source, (bySource.get(row.source) || 0) + 1) }
      const parsed = row.parsed_payload?.data ?? row.parsed_payload ?? row.raw_payload ?? {}
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) current.structured += 1
      const keys = keysIn(parsed)
      keys.forEach(key => { allKeys.add(key); fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1) })
      byKind.set(kind, current)
    }

    const captureIds = captures.slice(0, 200).map(row => row.capture_id).filter(Boolean)
    const flowResult = captureIds.length
      ? await db.from('spartan_data_flow').select('capture_id,page_kind,source,status,stage,processed_at,created_at').in('capture_id', captureIds).order('created_at', { ascending: false }).limit(500)
      : { data: [], error: null }
    if (flowResult.error) throw flowResult.error

    const intelKinds = [...intelByKind.values()].map(row => ({
      ...row, sources: [...row.sources], fields: [...row.fields].slice(0, 32),
      destinations: DISPLAY_DESTINATIONS[row.page_kind] || [`Intel Vertical / ${row.page_kind}`],
    })).sort((a, b) => b.count - a.count)
    const kinds = [...byKind.values()].map(row => ({
      ...row, sources: [...row.sources],
      destinations: DISPLAY_DESTINATIONS[row.page_kind] || ['Raw Capture / Intel Vertical (verify consumer)'],
    })).sort((a, b) => b.count - a.count)
    const fields = FIELD_GROUPS.map(group => ({
      name: group.name,
      fields: group.keys.map(key => ({ key, records: fieldCounts.get(key) || 0, present: allKeys.has(key) })),
    }))
    const countStoredFields = (rows: any[], keys: string[]) => keys.map(key => ({
      key, records: rows.filter(row => row[key] != null).length, present: rows.some(row => row[key] != null),
    }))
    const historyFields = countStoredFields(historyRowsResult.data || [], ['acres','networth','population','peons','soldiers','off_specs','def_specs','elites','thieves','wizards','generals','prisoners','war_horses','offense','defense','defense_home','o_tpa','d_tpa','o_wpa','d_wpa','build_efficiency','wages'])
    const eventRows = eventRowsResult.data || []
    const eventFields = [
      ...countStoredFields(eventRows, ['event_type','attacker','defender','target_kingdom','acres_change','troops_lost','thieves_lost','wizards_lost','gold_change','food_change','runes_change']),
      ...['attacker_kingdom','defender_kingdom','return_hours','unit_losses','capture_id','normalizer','kills','prisoners','spec_creds','peasants_reported','offense_sent','generals','people_killed'].map(key => ({
        key: 'payload.' + key, records: eventRows.filter(row => row.payload?.[key] != null).length,
        present: eventRows.some(row => row.payload?.[key] != null),
      })),
    ]
    const flows = flowResult.data || []
    const flowByKind = new Map<string, any>()
    for (const flow of flows) {
      const kind = flow.page_kind || 'unknown'
      const current = flowByKind.get(kind) || { page_kind: kind, count: 0, latest: null, statuses: {} }
      current.count += 1
      current.latest ||= flow.processed_at || flow.created_at
      const status = flow.status || flow.stage || 'unknown'
      current.statuses[status] = (current.statuses[status] || 0) + 1
      flowByKind.set(kind, current)
    }

    return NextResponse.json({
      account: { province: account.province_name, kingdom: account.province_location },
      totals: {
        captures: captures.length, captureLimit: 1500, intelRecords: intelCount.count || 0,
        archivedIntelRecords: archivedIntelCount.count || 0, expiredIntelRecords: expiredIntelCount.count || 0,
        provinceHistory: historyCount.count || 0, eventHistory: eventCount.count || 0,
        registryProvinces: registryResult.data?.length || 0,
      },
      coverage: {
        kinds, intelKinds, intelSampleLimit: 1500, intelTruncated: intelRows.length === 1500, sources: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        fields, historyFields, eventFields, flows: [...flowByKind.values()],
        registry: (registryResult.data || []).map(row => ({
          province: row.province_name, kingdom: row.kingdom_code, latest: row.last_seen_at,
          available: Object.keys(row.metadata || {}),
        })),
        capturedAt: captures[0]?.captured_at || null,
        truncated: captures.length === 1500,
      },
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Data coverage query failed' }, { status: 500 })
  }
}
