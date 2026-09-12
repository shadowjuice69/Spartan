import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const provinceId = url.searchParams.get('province')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500)

    let snapshots = supabase
      .from('spartan_province_history')
      .select('*')
      .eq('user_id', user.id)
      .order('observed_at', { ascending: true })
      .limit(limit)
    if (provinceId) snapshots = snapshots.eq('province_id', provinceId)

    let events = supabase
      .from('spartan_event_history')
      .select('*')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(100)
    if (provinceId) events = events.eq('province_id', provinceId)

    const [{ data: snapshotRows, error: snapshotError }, { data: eventRows, error: eventError }] = await Promise.all([snapshots, events])
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      snapshots: snapshotRows ?? [],
      events: eventRows ?? [],
      meta: {
        snapshotCount: snapshotRows?.length ?? 0,
        eventCount: eventRows?.length ?? 0,
        latestObservedAt: snapshotRows?.at(-1)?.observed_at ?? null,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History query failed' }, { status: 500 })
  }
}
