import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isOwner, isTrustedAdmin } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

async function authorized(request: Request) {
  const key = process.env.SPARTAN_STEWARD_KEY
  if (key && request.headers.get('x-spartan-steward-key') === key) return { ok: true, db: createServiceClient() }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  const { data: account } = await db.from('spartan_accounts').select('discord_user_id,role').eq('auth_user_id', user.id).maybeSingle()
  const discordId = account?.discord_user_id ? String(account.discord_user_id) : null
  const role = String(account?.role ?? '')
  const ok = isOwner(discordId) || isTrustedAdmin(discordId) || ['owner', 'admin', 'jeeves', 'steward'].includes(role)
  return ok ? { ok: true, db } : { ok: false as const }
}

export async function POST(request: Request) {
  const auth = await authorized(request)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date().toISOString()
  const expired = await auth.db.from('spartan_intel_records').delete().lt('expires_at', now).not('expires_at', 'is', null).select('id')
  if (expired.error) return NextResponse.json({ error: expired.error.message }, { status: 500 })

  const staleCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const stale = await auth.db.from('spartan_internal_storage').delete().in('processing_status', ['processed']).lt('created_at', staleCutoff).select('id')
  if (stale.error) return NextResponse.json({ error: stale.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, expiredIntelRemoved: expired.data?.length ?? 0, staleTempCopiesRemoved: stale.data?.length ?? 0 })
}
