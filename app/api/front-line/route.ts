import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseFrontLineRows } from '@/lib/spartan/front-line'

export const dynamic = 'force-dynamic'

const CACHE = new Map<string, { at: number; body: any }>()
const TTL_MS = 12_000
const PAGE = 1000
const MAX_ROWS = 8000

// Kingdom-wide hit feed for the Front Line page. Reads the Discord attacker-log and KDNEWS captures of the
// caller's own kingdom, returns parsed hits only (no raw text, no Discord handles).
export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 14))
    const cacheKey = `${user.id}|${days}`
    const hit = CACHE.get(cacheKey)
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body)

    const db = createServiceClient()
    const accountResult = await db.from('spartan_accounts').select('province_name,province_location').eq('auth_user_id', user.id).maybeSingle()
    if (accountResult.error) throw new Error(accountResult.error.message)
    const account = accountResult.data
    if (!account?.province_name || !account?.province_location) {
      return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })
    }
    const ownKd = String(account.province_location).trim()

    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const rows: Array<{ id: string; captured_at: string | null; created_at: string | null; raw_text: string | null }> = []
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const result = await db
        .from('spartan_intel_records_with_archive')
        .select('id,captured_at,created_at,raw_text')
        .in('page_kind', ['news', 'bot_event']).eq('source', 'discord-bot').eq('kingdom_id', ownKd)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (result.error) throw new Error(result.error.message)
      const page = result.data || []
      rows.push(...page)
      if (page.length < PAGE) break
    }

    const { hits, coverage } = parseFrontLineRows(rows, ownKd)
    const body = {
      ok: true, page: 'front-line', province: account.province_name, kingdom: ownKd, days,
      generatedAt: new Date().toISOString(), hits, coverage,
    }
    CACHE.set(cacheKey, { at: Date.now(), body })
    while (CACHE.size > 40) { const oldest = CACHE.keys().next().value; if (oldest === undefined) break; CACHE.delete(oldest) }
    return NextResponse.json(body)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Front Line query failed' }, { status: 500 })
  }
}
