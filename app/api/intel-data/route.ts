import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
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
  military: ['military', 'som', 'news', 'attack', 'throne'],
  magic: ['magic', 'ritual', 'dragon', 'council_spells'],
  thievery: ['thievery'],
  science: ['science', 'council_science'],
  buildings: ['survey', 'buildings', 'council_internal'],
  throne: ['throne', 'province_state'],
  kingdom: [
    'kingdom', 'news', 'som', 'survey', 'science', 'magic', 'ritual', 'dragon',
    'thievery', 'throne', 'universal', 'council_state', 'council_military',
    'council_science', 'council_internal'
  ],
  'war-room': ['news', 'attack', 'war', 'military', 'thievery', 'magic', 'ritual', 'dragon'],
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

    const section = new URL(request.url).searchParams.get('section') || 'kingdom'
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
      .select('id,capture_id,province_id,kingdom_id,captured_at,created_at,source,url,page_kind,classification_source,classification_confidence,parsed_payload,raw_payload')
      .in('page_kind', selectedKinds)
      .or(`kingdom_id.eq.${account.province_location},kingdom_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error

    const records = (data || []).map((row: any) => ({
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

    const counts: Record<string, number> = {}
    for (const row of records) counts[row.page_kind] = (counts[row.page_kind] || 0) + 1

    return NextResponse.json({ ok: true, section, province: account.province_name, kingdom: account.province_location, count: records.length, counts, records, generatedAt: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Intel query failed' }, { status: 500 })
  }
}
