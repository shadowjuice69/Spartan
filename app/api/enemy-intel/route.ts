import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  return createServiceClient()
}

function payload(row: any) {
  if (row.parsed_payload && typeof row.parsed_payload === 'object') return row.parsed_payload
  if (typeof row.parsed_payload === 'string') {
    try { return JSON.parse(row.parsed_payload) } catch {}
  }
  return row.raw_payload ?? {}
}

export async function GET() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = adminClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('province_name,province_location')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account?.province_name || !account?.province_location) {
      return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })
    }

    // Intel is shared. Visibility is based on the TARGET province's kingdom,
    // not on which Spartan user captured the record.
    const { data, error } = await db
      .from('spartan_intel_records')
      .select('id,capture_id,province_id,kingdom_id,captured_at,created_at,source,url,page_kind,classification_source,classification_confidence,parsed_payload,raw_payload')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) throw error

    const enemyRows = (data || []).filter((row: any) => {
      const targetKingdom = String(row.kingdom_id ?? '').trim().toLowerCase()
      const ownKingdom = String(account.province_location).trim().toLowerCase()
      return targetKingdom !== ownKingdom
    }).map((row: any) => ({
      id: row.id,
      capture_id: row.capture_id,
      province_id: row.province_id,
      kingdom_id: row.kingdom_id,
      captured_at: row.captured_at,
      created_at: row.created_at,
      source: row.source,
      url: row.url,
      page_kind: row.page_kind,
      classification_source: row.classification_source,
      classification_confidence: row.classification_confidence,
      payload: payload(row),
      raw_payload: row.raw_payload,
    }))

    const groups = new Map<string, any>()
    for (const row of enemyRows) {
      const key = String(row.province_id || 'unknown').trim() || 'unknown'
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
      if (!current.latest || new Date(row.captured_at || row.created_at).getTime() > new Date(current.latest).getTime()) {
        current.latest = row.captured_at || row.created_at
      }
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
