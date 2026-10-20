import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(request.url).searchParams
    const query = (params.get('q') || '').trim().slice(0, 80)
    const ageValue = Number(params.get('age') || 0)
    const age = Number.isInteger(ageValue) && ageValue > 0 ? ageValue : null
    const db = createServiceClient()
    let requestQuery = db
      .from('spartan_historical_province_registry')
      .select('age_number,province_name,kingdom_code,slot,last_seen_at,archived_at')
      .order('age_number', { ascending: false })
      .order('province_name', { ascending: true })
      .limit(100)

    if (query) requestQuery = requestQuery.ilike('province_name', `%${query.replace(/[\\%_]/g, '\\$&')}%`)
    if (age) requestQuery = requestQuery.eq('age_number', age)

    const { data, error } = await requestQuery
    if (error) throw error
    return NextResponse.json({ ok: true, count: data?.length || 0, records: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Historical reference lookup failed' }, { status: 500 })
  }
}
