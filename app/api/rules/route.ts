import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = createServiceClient()
  const [racesRes, personalitiesRes] = await Promise.all([
    db.from('spartan_race_rules').select('*').order('race'),
    db.from('spartan_personality_rules').select('*').order('personality'),
  ])
  if (racesRes.error) return NextResponse.json({ error: racesRes.error.message }, { status: 500 })
  if (personalitiesRes.error) return NextResponse.json({ error: personalitiesRes.error.message }, { status: 500 })
  return NextResponse.json({ races: racesRes.data, personalities: personalitiesRes.data })
}
