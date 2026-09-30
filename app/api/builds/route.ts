import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAccount() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()

  const { data: account } = await db
    .from('spartan_accounts')
    .select('discord_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (account) {
    return { ok: true as const, db, discordId: account.discord_user_id ? String(account.discord_user_id) : null }
  }

  // Canonical Spartan identity linkage lives in the province registry.
  // This keeps existing builds visible after an auth/account recreation without
  // creating a duplicate spartan_accounts row.
  const { data: registry } = await db
    .from('spartan_province_registry')
    .select('province_id,province_name,kingdom_code,user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!registry) return { ok: false as const }

  return { ok: true as const, db, discordId: null }
}

async function lookupRuleSnapshots(db: any, race: string | null, personality: string | null) {
  const [raceRes, personalityRes] = await Promise.all([
    race
      ? db.from('spartan_race_rules').select('*').ilike('race', race).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    personality
      ? db.from('spartan_personality_rules').select('*').ilike('personality', personality).order('age_number', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const ages = [raceRes.data?.age_number, personalityRes.data?.age_number].filter((n) => typeof n === 'number')
  return {
    race_rule_snapshot: raceRes.data || null,
    personality_rule_snapshot: personalityRes.data || null,
    rules_age_number: ages.length ? Math.max(...ages) : null,
  }
}

export async function GET(request: Request) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Library/Vault reads intentionally use the authenticated public client.
  // spartan_builds has an explicit read-all policy, so this avoids making
  // visibility depend on a server secret key being configured correctly.
  const readClient = await createClient()

  const params = new URL(request.url).searchParams
  const search = params.get('search') || ''
  const view = params.get('view') || 'library'
  let query = readClient
    .from('spartan_builds')
    .select('id,name,race,personality,author,updated_at,active,created_by_discord_id')
    .order('updated_at', { ascending: false })

  if (view !== 'vault') query = query.eq('active', true)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ builds: data, view })
}

export async function POST(request: Request) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Restore existing stored builds into the user's visible Library without
  // duplicating the underlying records.
  if (body?.action === 'restore') {
    const ids = Array.isArray(body.buildIds) ? body.buildIds.filter((id: unknown) => typeof id === 'string') : []
    if (!ids.length) return NextResponse.json({ error: 'Select at least one stored build.' }, { status: 400 })

    const { data, error } = await auth.db
      .from('spartan_builds')
      .update({ active: true, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id,name,race,personality,author,updated_at,active')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ builds: data, restored: data?.length || 0 })
  }

  const { name, race, personality, author, buildings, science, military_requirement,
          raw_build_text, raw_military_text, raw_science_text } = body
  if (!name) return NextResponse.json({ error: 'Build name is required.' }, { status: 400 })

  const snapshots = await lookupRuleSnapshots(auth.db, race || null, personality || null)

  const { data, error } = await auth.db
    .from('spartan_builds')
    .insert({
      name, race: race || null, personality: personality || null, author: author || null,
      created_by_discord_id: auth.discordId,
      buildings: buildings || {}, science: science || {}, military_requirement: military_requirement || {},
      raw_build_text: raw_build_text || null, raw_military_text: raw_military_text || null,
      raw_science_text: raw_science_text || null,
      ...snapshots,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data }, { status: 201 })
}
