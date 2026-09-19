import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isOwner, isTrustedAdmin } from '@/lib/spartan/security'

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

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await auth.db.from('spartan_builds').select('*').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Build not found.' }, { status: 404 })
  return NextResponse.json({ build: data })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await auth.db
    .from('spartan_builds')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAccount()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await auth.db.from('spartan_builds').select('created_by_discord_id').eq('id', params.id).maybeSingle()
  const owns = existing?.created_by_discord_id && existing.created_by_discord_id === auth.discordId
  if (!owns && !isOwner(auth.discordId) && !isTrustedAdmin(auth.discordId)) {
    return NextResponse.json({ error: 'Only the build author or an admin can remove this build.' }, { status: 403 })
  }

  const { error } = await auth.db.from('spartan_builds').update({ active: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
