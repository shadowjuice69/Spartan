import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Spartan Intel service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const kinds: Record<string, string[]> = {
  // Intel is the complete classified feed. Nothing that has been classified
  // by the live capture/bot pipeline should disappear simply because a
  // dedicated page does not exist for that kind yet.
  intel: [
    'intel', 'utopiaintel', 'bot_event', 'news', 'attack', 'aid', 'military',
    'som', 'magic', 'ritual', 'dragon', 'thievery', 'science', 'buildings',
    'survey', 'throne', 'kingdom', 'universal', 'exploration', 'war',
    'council_history', 'council_spells', 'council_state', 'council_military',
    'council_science', 'council_internal', 'province_state', 'age_stats', 'unknown'
  ],
  military: ['military', 'som', 'attack', 'council_military', 'war'],
  magic: ['magic', 'ritual', 'dragon', 'council_spells'],
  thievery: ['thievery'],
  science: ['science', 'council_science'],
  buildings: ['survey', 'buildings', 'council_internal'],
  throne: ['throne', 'province_state', 'province_logs'],
  kingdom: ['kingdom', 'council_state'],
  'war-room': ['attack', 'war', 'military', 'thievery', 'magic', 'ritual', 'dragon', 'aid', 'exploration'],
  aid: ['aid'],
  news: ['news', 'council_history', 'province_logs'],
  exploration: ['exploration'],
  operations: ['attack', 'thievery', 'magic', 'ritual', 'aid', 'exploration'],
}

function payload(row: any) {
  if (row.parsed_payload && typeof row.parsed_payload === 'object') return row.parsed_payload
  if (typeof row.parsed_payload === 'string') {
    try { return JSON.parse(row.parsed_payload) } catch {}
  }
  return row.raw_payload ?? {}
}

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(request.url).searchParams
    const section = params.get('section') || 'kingdom'
    const summary = params.get('summary') === '1'
    const db = adminClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('province_name,province_location')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account?.province_name || !account?.province_location) return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })

    const selectedKinds = kinds[section] || [section]
    const { data, error } = await db
      .from('spartan_intel_records')
      .select(summary && section === 'intel'
        ? 'id,capture_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,created_at,source,url,page_kind,classification_confidence,classification_reason,classification_source,intel_type,visibility,metrics,parsed_payload'
        : 'id,capture_id,source_vault_id,user_id,province_id,kingdom_id,captured_at,created_at,updated_at,source,source_id,url,page_kind,classification_confidence,classification_reason,age,game_year,game_tick,retention_class,expires_at,raw_text,classification_source,parsed_payload,raw_payload,target_province_id,target_kingdom_id,intel_type,visibility,metrics')
      .in('page_kind', selectedKinds)

      .or(`kingdom_id.eq.${account.province_location},kingdom_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error

    const rows = data || []
    const provinceIds = [...new Set(rows.map((row: any) => row.province_id).filter(Boolean))]
    const registryById = new Map<string, { name: string | null; kingdom: string | null; slot: number | null }>()

    if (provinceIds.length) {
      const { data: registry, error: registryError } = await db
        .from('spartan_province_registry')
        .select('province_id,province_name,kingdom_code,slot,updated_at')
        .in('province_id', provinceIds)
        .order('updated_at', { ascending: false })
      if (registryError) throw registryError
      for (const entry of registry || []) {
        if (!registryById.has(String(entry.province_id))) {
          registryById.set(String(entry.province_id), {
            name: entry.province_name || null,
            kingdom: entry.kingdom_code || null,
            slot: entry.slot ?? null,
          })
        }
      }
    }

    const records = rows.map((row: any) => {
      const registry = row.province_id ? registryById.get(String(row.province_id)) : null
      const parsed = payload(row)
      const payloadProvince = parsed?.province || parsed?.provinceName || parsed?.attackerProvince || parsed?.targetProvince || null
      const payloadKingdom = parsed?.kingdom || parsed?.kingdomCode || parsed?.attackerKingdom || parsed?.targetKingdom || null
      return {
        id: row.id,
        capture_id: row.capture_id,
        source_vault_id: row.source_vault_id,
        user_id: row.user_id,
        province_id: row.province_id,
        province_name: registry?.name || payloadProvince || null,
        province_slot: registry?.slot ?? null,
        kingdom_id: row.kingdom_id || registry?.kingdom || payloadKingdom || null,
        target_province_id: row.target_province_id,
        target_kingdom_id: row.target_kingdom_id,
        intel_type: row.intel_type,
        visibility: row.visibility,
        metrics: row.metrics || {},
        captured_at: row.captured_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: row.source,
        source_id: row.source_id,
        url: row.url,
        page_kind: row.page_kind,
        classification_source: row.classification_source,
        classification_confidence: row.classification_confidence,
        classification_reason: row.classification_reason,
        age: row.age,
        game_year: row.game_year,
        game_tick: row.game_tick,
        retention_class: row.retention_class,
        expires_at: row.expires_at,
        raw_text: row.raw_text,
        payload: parsed,
        raw_payload: row.raw_payload,
      }
    })

    const counts: Record<string, number> = {}
    for (const row of records) counts[row.page_kind] = (counts[row.page_kind] || 0) + 1

    return NextResponse.json({
      ok: true,
      section,
      province: account.province_name,
      kingdom: account.province_location,
      count: records.length,
      counts,
      records,
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Intel query failed' }, { status: 500 })
  }
}
