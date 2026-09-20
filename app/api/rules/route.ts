import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/rules            -> race/personality rules for the newest seeded age
// GET /api/rules?age=115    -> race/personality rules for a specific age
export async function GET(request: Request) {
  const db = createServiceClient()
  const { searchParams } = new URL(request.url)
  const ageParam = searchParams.get('age')

  let age: number | null = ageParam ? Number(ageParam) : null
  if (age == null || Number.isNaN(age)) {
    // No age requested — fall back to whichever age has rules seeded most
    // recently, so a new age can go live with a plain INSERT and nothing
    // here has to change.
    const { data: latest, error: latestError } = await db
      .from('spartan_race_rules')
      .select('age_number')
      .order('age_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 })
    age = latest?.age_number ?? null
  }

  let raceQuery = db.from('spartan_race_rules').select('*').order('race')
  let personalityQuery = db.from('spartan_personality_rules').select('*').order('personality')
  if (age != null) {
    raceQuery = raceQuery.eq('age_number', age)
    personalityQuery = personalityQuery.eq('age_number', age)
  }

  const [racesRes, personalitiesRes] = await Promise.all([raceQuery, personalityQuery])
  if (racesRes.error) return NextResponse.json({ error: racesRes.error.message }, { status: 500 })
  if (personalitiesRes.error) return NextResponse.json({ error: personalitiesRes.error.message }, { status: 500 })

  return NextResponse.json({ age, races: racesRes.data, personalities: personalitiesRes.data })
}
