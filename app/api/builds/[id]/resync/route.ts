import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function requireAccount() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  return { ok: true as const, db }
}

// Re-pulls the latest race/personality rules onto an existing build.
// Use this after a new age's final changes are seeded into
// spartan_race_rules / spartan_personality_rules.
export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: build, error: fetchErr } = await auth.db.from('spartan_builds').select('race,personality').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!build) return NextResponse.json({ error: 'Build not found.' }, { status: 404 })

  const [raceRes, personalityRes] = await Promise.all([
    build.race
      ? auth.db.from('spartan_race_rules').select('*').ilike('race', build.race).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    build.personality
      ? auth.db.from('spartan_personality_rules').select('*').ilike('personality', build.personality).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const ages = [raceRes.data?.age_number, personalityRes.data?.age_number].filter((n: any) => typeof n === 'number')

  const { data, error } = await auth.db
    .from('spartan_builds')
    .update({
      race_rule_snapshot: raceRes.data || null,
      personality_rule_snapshot: personalityRes.data || null,
      rules_age_number: ages.length ? Math.max(...ages) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data })
}
