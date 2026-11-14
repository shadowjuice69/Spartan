import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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
    const summary = params.get('summary') === '1'
    const db = createServiceClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('province_name,province_location')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account?.province_name || !account?.province_location) {
      return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })
    }

    const ownKingdom = String(account.province_location).trim().toLowerCase()

    const { data, error } = await db
      .from('spartan_intel_records_with_archive')
      .select(summary
        ? 'id,capture_id,user_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,created_at,source,url,page_kind,classification_source,classification_confidence,intel_type,visibility,metrics'
        : 'id,capture_id,user_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,created_at,source,url,page_kind,classification_source,classification_confidence,parsed_payload,raw_payload,intel_type,visibility,metrics')
      // Filter to enemy-visible/foreign-target records before applying the cap.
      // Filtering only after a global 1,000-row limit allowed own-province traffic
      // to crowd older but still-useful enemy intelligence out of the result.
      .or(`visibility.eq.enemy,target_kingdom_id.neq.${ownKingdom}`)
      .order('captured_at', { ascending: false })
      .limit(1000)
    if (error) throw error

    const enemyRows = (data || []).filter((row: any) => {
      if (row.visibility === 'own' && row.user_id !== user.id) return false
      const targetKingdom = String(row.target_kingdom_id ?? '').trim().toLowerCase()
      return row.visibility === 'enemy' || (targetKingdom && targetKingdom !== ownKingdom)
    }).map((row: any) => ({
      id: row.id,
      capture_id: row.capture_id,
      province_id: row.target_province_id || null,
      source_province_id: row.province_id || null,
      kingdom_id: row.target_kingdom_id || null,
      source_kingdom_id: row.kingdom_id || null,
      captured_at: row.captured_at,
      created_at: row.created_at,
      source: row.source,
      url: row.url,
      page_kind: row.page_kind,
      intel_type: row.intel_type,
      visibility: row.visibility,
      classification_source: row.classification_source,
      classification_confidence: row.classification_confidence,
      metrics: row.metrics || {},
      payload: summary ? {} : payload(row),
      raw_payload: summary ? null : row.raw_payload,
    }))

    const groups = new Map<string, any>()
    for (const row of enemyRows) {
      const key = String(row.province_id || row.kingdom_id || 'unknown').trim() || 'unknown'
      const current = groups.get(key) || {
        province_id: row.province_id,
        kingdom_id: row.kingdom_id,
        records: 0,
        latest: row.captured_at || row.created_at,
        kinds: {},
        intel: [],
      }
      current.records += 1
      current.kinds[row.page_kind] = (current.kinds[row.page_kind] || 0) + 1
      if (!current.latest || new Date(row.captured_at || row.created_at).getTime() > new Date(current.latest).getTime()) current.latest = row.captured_at || row.created_at
      current.intel.push(row)
      groups.set(key, current)
    }

    return NextResponse.json({
      ok: true,
      ownProvince: account.province_name,
      ownKingdom: account.province_location,
      count: enemyRows.length,
      provinces: Array.from(groups.values()).sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime()),
      records: enemyRows,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Enemy Intel query failed' }, { status: 500 })
  }
}
