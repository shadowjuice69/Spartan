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
  return { ok: true as const, db, discordId: account?.discord_user_id ? String(account.discord_user_id) : null }
}

export async function GET(request: Request) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = new URL(request.url).searchParams.get('search') || ''
  let query = auth.db
    .from('spartan_builds')
    .select('id,name,race,personality,author,updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ builds: data })
}

export async function POST(request: Request) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, race, personality, author, buildings, science, military_requirement,
          raw_build_text, raw_military_text, raw_science_text } = body
  if (!name) return NextResponse.json({ error: 'Build name is required.' }, { status: 400 })

  const { data, error } = await auth.db
    .from('spartan_builds')
    .insert({
      name, race: race || null, personality: personality || null, author: author || null,
      created_by_discord_id: auth.discordId,
      buildings: buildings || {}, science: science || {}, military_requirement: military_requirement || {},
      raw_build_text: raw_build_text || null, raw_military_text: raw_military_text || null,
      raw_science_text: raw_science_text || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data }, { status: 201 })
}
